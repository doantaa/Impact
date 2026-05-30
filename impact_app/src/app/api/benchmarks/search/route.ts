import { VertexAI } from "@google-cloud/vertexai";
import { GoogleAuth, type GoogleAuthOptions } from "google-auth-library";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type RequestBody = {
  initiative: {
    title: string;
    goal: string;
    templateType: string;
    productType: string;
    targetUsers: string;
    timeline: string;
    releaseApproach: string;
    owner: string;
    stakeholders: string;
  };
  metricIds: string[];
};

function safeJsonExtract(text: string) {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;
  const slice = text.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractTextFromVertexResponse(value: unknown): string {
  if (!isRecord(value)) return "";
  const response = value["response"];
  if (!isRecord(response)) return "";
  const candidates = response["candidates"];
  if (!Array.isArray(candidates) || candidates.length === 0) return "";
  const c0 = candidates[0];
  if (!isRecord(c0)) return "";
  const content = c0["content"];
  if (!isRecord(content)) return "";
  const parts = content["parts"];
  if (!Array.isArray(parts)) return "";
  return parts.map((p) => (isRecord(p) && typeof p["text"] === "string" ? p["text"] : "")).join("");
}

async function callVertexRestGoogleSearch(params: {
  project: string;
  location: string;
  model: string;
  prompt: string;
  credentials?: unknown;
}): Promise<string> {
  const auth = new GoogleAuth({
    credentials: isRecord(params.credentials) ? (params.credentials as Record<string, unknown>) : undefined,
    projectId: params.project,
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const token = await auth.getAccessToken();
  if (!token) throw new Error("Missing access token");

  const url = `https://${params.location}-aiplatform.googleapis.com/v1/projects/${params.project}/locations/${params.location}/publishers/google/models/${params.model}:generateContent`;
  const body = {
    contents: [{ role: "user", parts: [{ text: params.prompt }] }],
    tools: [{ google_search: {} }],
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json()) as unknown;
  if (!res.ok) {
    const msg = isRecord(json) && isRecord(json["error"]) && typeof json["error"]["message"] === "string" ? json["error"]["message"] : `HTTP ${res.status}`;
    throw new Error(msg);
  }

  if (!isRecord(json)) return "";
  const candidates = json["candidates"];
  if (!Array.isArray(candidates) || candidates.length === 0) return "";
  const c0 = candidates[0];
  if (!isRecord(c0)) return "";
  const content = c0["content"];
  if (!isRecord(content)) return "";
  const parts = content["parts"];
  if (!Array.isArray(parts)) return "";
  return parts.map((p) => (isRecord(p) && typeof p["text"] === "string" ? p["text"] : "")).join("");
}

export async function POST(req: Request) {
  const project = process.env.GCP_PROJECT_ID;
  const location = process.env.GCP_LOCATION || "us-central1";
  const model = process.env.VERTEX_MODEL || "gemini-1.0-pro";

  if (!project) {
    return NextResponse.json({ ok: false, error: "Missing GCP_PROJECT_ID", sources: [] }, { status: 200 });
  }

  const body = (await req.json()) as RequestBody;
  const metricIds = Array.isArray(body.metricIds) ? body.metricIds.slice(0, 12) : [];

  if (metricIds.length === 0) {
    return NextResponse.json({ ok: true, sources: [] });
  }

  let googleAuthOptions: GoogleAuthOptions | undefined;
  const saRaw = process.env.GCP_SERVICE_ACCOUNT_JSON;
  if (saRaw) {
    try {
      googleAuthOptions = { credentials: JSON.parse(saRaw) };
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid GCP_SERVICE_ACCOUNT_JSON", sources: [] }, { status: 200 });
    }
  }

  const vertexAI = new VertexAI({ project, location, googleAuthOptions });
  const generativeModel = vertexAI.preview.getGenerativeModel({
    model,
    generationConfig: {
      maxOutputTokens: 2048,
      temperature: 0.2,
    },
  });

  const googleSearchRetrievalTool = {
    googleSearchRetrieval: {},
  };

  const prompt = [
    `Kamu adalah asisten riset. Cari data dari sumber publik (artikel, business report, news, dan jurnal) yang relevan sebagai benchmark / case study untuk inisiatif berikut.`,
    `Konteks inisiatif:`,
    `- Title: ${body.initiative.title}`,
    `- Goal: ${body.initiative.goal}`,
    `- Template: ${body.initiative.templateType}`,
    `- Product type: ${body.initiative.productType}`,
    `- Target users: ${body.initiative.targetUsers}`,
    `- Timeline: ${body.initiative.timeline}`,
    `- Release approach: ${body.initiative.releaseApproach}`,
    `- Owner: ${body.initiative.owner}`,
    `- Stakeholders: ${body.initiative.stakeholders}`,
    ``,
    `Metrik IDs: ${metricIds.join(", ")}`,
    ``,
    `Aturan:`,
    `- Hanya sumber publik (tanpa paywall).`,
    `- Berikan 1–3 sumber per metrik bila tersedia.`,
    `- Setiap entri harus punya url dan excerpt ringkas (1–3 kalimat) tentang claim yang relevan.`,
    `- Sertakan relevance: "High" | "Medium" | "Low" dan relevanceRationale singkat.`,
    `- Utamakan studi kasus yang mirip konteks produk/goal (bukan definisi metrik generik).`,
    ``,
    `Output WAJIB berupa JSON array saja (tanpa markdown, tanpa penjelasan lain) dengan shape:`,
    `[{"url": "...", "title": "...", "publisher": "...", "date": "YYYY-MM-DD or YYYY", "excerpt": "...", "metricIds": ["..."], "relevance": "High", "relevanceRationale": "..."}]`,
  ].join("\n");

  try {
    const result = await generativeModel.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      tools: [googleSearchRetrievalTool],
    });

    const text = extractTextFromVertexResponse(result);
    const parsed = safeJsonExtract(text);
    const sources = Array.isArray(parsed) ? parsed : [];

    return NextResponse.json({ ok: true, sources }, { status: 200 });
  } catch (e) {
    const message =
      e instanceof Error
        ? e.message
        : typeof e === "string"
          ? e
          : "Unknown error";
    if (message.includes("google_search_retrieval is not supported") && project) {
      try {
        const saRaw = process.env.GCP_SERVICE_ACCOUNT_JSON;
        const credentials = saRaw ? JSON.parse(saRaw) : undefined;
        const text = await callVertexRestGoogleSearch({ project, location, model, prompt, credentials });
        const parsed = safeJsonExtract(text);
        const sources = Array.isArray(parsed) ? parsed : [];
        return NextResponse.json({ ok: true, sources }, { status: 200 });
      } catch (fallbackErr) {
        const fallbackMsg =
          fallbackErr instanceof Error
            ? fallbackErr.message
            : typeof fallbackErr === "string"
              ? fallbackErr
              : "Unknown error";
        console.error("[benchmarks/search] failed", { message, fallbackMsg });
        return NextResponse.json(
          { ok: false, error: `Benchmark search failed: ${fallbackMsg}`, sources: [] },
          { status: 200 },
        );
      }
    }
    console.error("[benchmarks/search] failed", { message });
    return NextResponse.json(
      { ok: false, error: `Benchmark search failed: ${message}`, sources: [] },
      { status: 200 },
    );
  }
}

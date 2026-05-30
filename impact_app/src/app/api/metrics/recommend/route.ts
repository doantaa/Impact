import { VertexAI } from "@google-cloud/vertexai";
import type { GoogleAuthOptions } from "google-auth-library";
import { NextResponse } from "next/server";
import { METRICS } from "@/lib/metrics/catalog";
import type { MetricRecommendation, TemplateType } from "@/lib/domain/types";
import { recommendMetrics } from "@/lib/metrics/recommender";

export const runtime = "nodejs";

type RequestBody = {
  initiative: {
    title: string;
    goal: string;
    templateType: TemplateType;
    productType: string;
    targetUsers: string;
    timeline: string;
    releaseApproach: string;
    owner: string;
    stakeholders: string;
  };
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

function fallback(templateType: TemplateType, goal: string) {
  const { recommendations } = recommendMetrics({ templateType, goal });
  return NextResponse.json({ ok: true, recommendations, source: "rules" }, { status: 200 });
}

export async function POST(req: Request) {
  const project = process.env.GCP_PROJECT_ID;
  const location = process.env.GCP_LOCATION || "us-central1";
  const model = process.env.VERTEX_MODEL || "gemini-1.0-pro";

  const body = (await req.json()) as RequestBody;
  const templateType = body?.initiative?.templateType || "new_feature";
  const goal = body?.initiative?.goal || "";

  if (!project) {
    return fallback(templateType, goal);
  }

  let googleAuthOptions: GoogleAuthOptions | undefined;
  const saRaw = process.env.GCP_SERVICE_ACCOUNT_JSON;
  if (saRaw) {
    try {
      googleAuthOptions = { credentials: JSON.parse(saRaw) };
    } catch {
      return fallback(templateType, goal);
    }
  }

  const vertexAI = new VertexAI({ project, location, googleAuthOptions });
  const generativeModel = vertexAI.getGenerativeModel({
    model,
    generationConfig: {
      maxOutputTokens: 1024,
      temperature: 0.2,
    },
  });

  const metricCatalogCompact = METRICS.map((m) => ({
    id: m.id,
    name: m.name,
    category: m.category,
    type: m.type,
    definition: m.definition,
  }));

  const prompt = [
    `Kamu adalah asisten produk yang memilih metrik paling relevan untuk sebuah inisiatif.`,
    `Berdasarkan konteks di bawah, pilih dan urutkan metrik yang paling relevan.`,
    ``,
    `Konteks inisiatif:`,
    `- Title: ${body.initiative.title}`,
    `- Goal: ${body.initiative.goal}`,
    `- Template: ${body.initiative.templateType}`,
    `- Product type: ${body.initiative.productType}`,
    `- Target users: ${body.initiative.targetUsers}`,
    `- Timeline: ${body.initiative.timeline}`,
    `- Release approach: ${body.initiative.releaseApproach}`,
    ``,
    `Katalog metrik (JSON):`,
    JSON.stringify(metricCatalogCompact),
    ``,
    `Aturan output:`,
    `- Output HARUS berupa JSON array saja (tanpa markdown).`,
    `- Maksimal 8 rekomendasi. Minimal 1 jika memungkinkan.`,
    `- Setiap item shape: {"metricId":"...","rank":1,"rationale":"1 kalimat kenapa relevan"}`,
  ].join("\n");

  try {
    const result = await generativeModel.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const text = extractTextFromVertexResponse(result);
    const parsed = safeJsonExtract(text);
    const items = Array.isArray(parsed) ? parsed : [];

    const recommendations = items
      .reduce<MetricRecommendation[]>((acc, x, idx) => {
        if (!isRecord(x)) return acc;
        const metricId = typeof x["metricId"] === "string" ? x["metricId"] : "";
        if (!METRICS.some((m) => m.id === metricId)) return acc;
        const rationale = typeof x["rationale"] === "string" ? x["rationale"] : "";
        const rank = typeof x["rank"] === "number" ? x["rank"] : idx + 1;
        acc.push({ metricId, rank, rationale, selected: false, recommended: true });
        return acc;
      }, [])
      .slice(0, 8)
      .sort((a, b) => a.rank - b.rank)
      .map((r, idx) => ({ ...r, rank: idx + 1 }));

    if (recommendations.length === 0) {
      return fallback(templateType, goal);
    }

    return NextResponse.json({ ok: true, recommendations, source: "ai" }, { status: 200 });
  } catch {
    return fallback(templateType, goal);
  }
}

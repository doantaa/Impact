import { VertexAI } from "@google-cloud/vertexai";
import type { GoogleAuthOptions } from "google-auth-library";
import { NextResponse } from "next/server";
import type { Baseline, BenchmarkSource, ImpactScore, Initiative, Scenario } from "@/lib/domain/types";
import { getMetric } from "@/lib/metrics/catalog";

export const runtime = "nodejs";

type RequestBody = {
  initiative: Initiative;
  selectedMetricIds: string[];
  baselines: Baseline[];
  benchmarks: BenchmarkSource[];
  scenarios: Scenario[];
  impactScore: ImpactScore | null;
  confidenceScore: number | null;
  resources: {
    engEffortPersonWeeks: number | null;
    designEffortPersonWeeks: number | null;
    pmOtherEffortPersonWeeks: number | null;
    fullyLoadedCostRateIdrPerPersonWeek: number | null;
  };
};

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

function fallback(body: RequestBody) {
  const metricNames = body.selectedMetricIds
    .map((id) => getMetric(id)?.name || id)
    .slice(0, 6);

  const parts: string[] = [];
  parts.push(`Inisiatif **${body.initiative.title || "Untitled"}** bertujuan: ${body.initiative.goal || "-"}.`);
  if (metricNames.length > 0) parts.push(`Metrik utama: ${metricNames.join(", ")}.`);
  if (typeof body.confidenceScore === "number") parts.push(`Confidence: **${body.confidenceScore}/100**.`);
  if (body.impactScore) parts.push(`ImpactScore: **${body.impactScore.value}**.`);
  parts.push(`Gunakan hasil scenario (worst/base/best) sebagai range estimasi impact dan untuk diskusi trade-off.`);
  return parts.join("\n");
}

export async function POST(req: Request) {
  const project = process.env.GCP_PROJECT_ID;
  const location = process.env.GCP_LOCATION || "us-central1";
  const model = process.env.VERTEX_MODEL || "gemini-1.0-pro";

  const body = (await req.json()) as RequestBody;

  if (!project) {
    return NextResponse.json({ ok: true, narrativeMarkdown: fallback(body), source: "template" }, { status: 200 });
  }

  let googleAuthOptions: GoogleAuthOptions | undefined;
  const saRaw = process.env.GCP_SERVICE_ACCOUNT_JSON;
  if (saRaw) {
    try {
      googleAuthOptions = { credentials: JSON.parse(saRaw) };
    } catch {
      return NextResponse.json({ ok: true, narrativeMarkdown: fallback(body), source: "template" }, { status: 200 });
    }
  }

  const vertexAI = new VertexAI({ project, location, googleAuthOptions });
  const generativeModel = vertexAI.getGenerativeModel({
    model,
    generationConfig: { maxOutputTokens: 700, temperature: 0.2 },
  });

  const metricLines = body.selectedMetricIds
    .map((id) => {
      const m = getMetric(id);
      if (!m) return `- ${id}`;
      return `- ${m.name} (${m.type}, ${m.category}) — ${m.definition}`;
    })
    .slice(0, 10)
    .join("\n");

  const baselineLines = body.baselines
    .filter((b) => body.selectedMetricIds.includes(b.metricId))
    .slice(0, 10)
    .map((b) => {
      const m = getMetric(b.metricId);
      const label = m ? m.name : b.metricId;
      const val = b.value === null ? "unknown" : `${b.value} ${b.unit}`;
      return `- ${label}: ${val} (${b.window}; ${b.provenance})`;
    })
    .join("\n");

  const benchmarkLines = body.benchmarks
    .slice(0, 8)
    .map((b) => `- ${b.title || b.url} — ${b.relevance} — ${b.url}`)
    .join("\n");

  const baseScenario = body.scenarios.find((s) => s.name === "base") || null;
  const baseRollups = baseScenario?.rollups ? Object.entries(baseScenario.rollups).map(([k, v]) => `${k}: ${v}`).join("; ") : "";

  const prompt = [
    `Kamu adalah asisten produk yang menulis ringkasan singkat untuk Impact Brief.`,
    `Tulis bagian "Summary" dalam Bahasa Indonesia yang siap dipakai, berdasarkan data di bawah.`,
    ``,
    `Aturan format:`,
    `- Output hanya markdown teks (tanpa code block).`,
    `- 6–10 baris total.`,
    `- Fokus: tujuan, metrik yang dipilih, bukti benchmark yang ada, dan range scenario (worst/base/best).`,
    `- Jangan membuat angka spesifik bila tidak ada datanya; kalau unknown tulis "unknown".`,
    ``,
    `Initiative:`,
    `- Title: ${body.initiative.title}`,
    `- Goal: ${body.initiative.goal}`,
    `- Template: ${body.initiative.templateType}`,
    `- Product type: ${body.initiative.productType}`,
    `- Target users: ${body.initiative.targetUsers}`,
    `- Timeline: ${body.initiative.timeline}`,
    `- Release approach: ${body.initiative.releaseApproach}`,
    ``,
    `Resources (person-weeks + rate):`,
    `- Eng: ${body.resources.engEffortPersonWeeks ?? "unknown"}`,
    `- Design: ${body.resources.designEffortPersonWeeks ?? "unknown"}`,
    `- PM/Other: ${body.resources.pmOtherEffortPersonWeeks ?? "unknown"}`,
    `- Fully-loaded rate (IDR/pw): ${body.resources.fullyLoadedCostRateIdrPerPersonWeek ?? "unknown"}`,
    ``,
    `Selected metrics:`,
    metricLines || "- (none)",
    ``,
    `Baselines:`,
    baselineLines || "- (none)",
    ``,
    `Benchmarks:`,
    benchmarkLines || "- (none)",
    ``,
    `Scenario base rollups: ${baseRollups || "unknown"}`,
    `Confidence score: ${typeof body.confidenceScore === "number" ? body.confidenceScore : "unknown"}`,
    `ImpactScore: ${body.impactScore ? body.impactScore.value : "unknown"}`,
  ].join("\n");

  try {
    const result = await generativeModel.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] });
    const text = extractTextFromVertexResponse(result).trim();
    if (!text) {
      return NextResponse.json({ ok: true, narrativeMarkdown: fallback(body), source: "template" }, { status: 200 });
    }
    return NextResponse.json({ ok: true, narrativeMarkdown: text, source: "ai" }, { status: 200 });
  } catch {
    return NextResponse.json({ ok: true, narrativeMarkdown: fallback(body), source: "template" }, { status: 200 });
  }
}


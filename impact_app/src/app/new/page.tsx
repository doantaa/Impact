"use client";

import { AppShell } from "@/components/AppShell";
import { TEMPLATES } from "@/lib/domain/templates";
import type { Baseline, BaselineProvenance, BenchmarkSource, Initiative, MetricRecommendation, TemplateType } from "@/lib/domain/types";
import { generateBriefMarkdown } from "@/lib/brief/markdown";
import { downloadTextFile } from "@/lib/brief/export";
import { computeConfidence } from "@/lib/estimation/confidence";
import { computeImpactScore } from "@/lib/estimation/impactScore";
import { computeScenarios, scenarioSummary } from "@/lib/estimation/scenario";
import { getMetric } from "@/lib/metrics/catalog";
import { trackEvent } from "@/lib/analytics/events";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  newId,
  saveDraft,
  setRecommendations,
  slugify,
  updateInitiative,
  validateStep,
  type LocalBrief,
  type WizardStep,
  createDraft,
  loadDraft,
} from "@/lib/state/briefStore";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const STEP_ORDER: WizardStep[] = ["intake", "metrics", "baselines", "benchmarks", "scenarios"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stepLabel(step: WizardStep) {
  if (step === "intake") return "Ringkasan";
  if (step === "metrics") return "Metrik";
  if (step === "baselines") return "Baseline";
  if (step === "benchmarks") return "Benchmark";
  return "Skenario & Output";
}

function unitDefault(metricId: string) {
  if (metricId.endsWith("_rate") || metricId.includes("retention") || metricId.includes("pct") || metricId.includes("dau_wau")) return "%";
  if (metricId === "time_on_task") return "seconds";
  return "count";
}

function upsertBaseline(baselines: Baseline[], baseline: Baseline) {
  const idx = baselines.findIndex((b) => b.metricId === baseline.metricId);
  if (idx === -1) return [...baselines, baseline];
  const next = baselines.slice();
  next[idx] = baseline;
  return next;
}

function upsertBenchmark(benchmarks: BenchmarkSource[], b: BenchmarkSource) {
  const idx = benchmarks.findIndex((x) => x.id === b.id || x.url === b.url);
  if (idx === -1) return [...benchmarks, b];
  const next = benchmarks.slice();
  next[idx] = b;
  return next;
}

function InfoTooltip(props: { label: string; text: string }) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={props.label}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-zinc-300 text-[10px] font-semibold text-zinc-600 hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/30"
      >
        i
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-72 -translate-x-1/2 rounded-md bg-zinc-900 px-3 py-2 text-xs text-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {props.text}
      </span>
    </span>
  );
}

const nfNumber = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });
const nfInteger = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
const nfIdr = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

function fmtNumber(v: number, opts?: { decimals?: boolean }) {
  if (!Number.isFinite(v)) return "";
  if (opts?.decimals) return nfNumber.format(v);
  return nfInteger.format(v);
}

function fmtIdr(v: number) {
  if (!Number.isFinite(v)) return "";
  return nfIdr.format(v);
}

function scenarioInputsKey(draft: LocalBrief) {
  const selectedMetricIds = draft.recommendations
    .filter((r) => r.selected)
    .map((r) => r.metricId)
    .slice()
    .sort();
  const baselineParts = selectedMetricIds
    .map((id) => {
      const b = draft.baselines.find((x) => x.metricId === id) || null;
      if (!b) return `${id}:none`;
      return `${id}:${b.provenance}:${b.value ?? "null"}:${b.unit}:${b.window}:${b.note}`;
    })
    .join("|");
  const benchParts = draft.benchmarks
    .slice()
    .sort((a, b) => (a.url || "").localeCompare(b.url || ""))
    .map((b) => `${b.url}:${b.relevance}:${b.metricIds.slice().sort().join(",")}:${b.excerpt}`)
    .join("|");
  const assumpParts = draft.assumptions
    .slice()
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((a) => `${a.key}:${String(a.value)}`)
    .join("|");
  const r = draft.resources;
  const res = `${r.engEffortPersonWeeks ?? "null"}:${r.designEffortPersonWeeks ?? "null"}:${r.pmOtherEffortPersonWeeks ?? "null"}:${r.fullyLoadedCostRateIdrPerPersonWeek ?? "null"}`;
  const i = draft.initiative;
  const init = `${i.title}|${i.goal}|${i.templateType}|${i.productType}|${i.targetUsers}|${i.timeline}|${i.releaseApproach}|${i.owner}|${i.stakeholders}`;
  return [init, selectedMetricIds.join(","), baselineParts, benchParts, assumpParts, res].join("||");
}

export default function NewBriefPage() {
  return (
    <Suspense
      fallback={
        <AppShell title="Buat Impact Brief">
          <div className="text-sm text-zinc-600">Loading…</div>
        </AppShell>
      }
    >
      <NewBriefPageInner />
    </Suspense>
  );
}

function NewBriefPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const draftId = searchParams.get("id");
  const [draft, setDraft] = useState<LocalBrief | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [loadingBenchmarks, setLoadingBenchmarks] = useState(false);
  const [generatingScenarios, setGeneratingScenarios] = useState(false);
  const [generatingNarrative, setGeneratingNarrative] = useState(false);
  const [manualUrl, setManualUrl] = useState("");
  const [manualTitle, setManualTitle] = useState("");
  const [manualExcerpt, setManualExcerpt] = useState("");
  const [manualMetricId, setManualMetricId] = useState<string>("");
  const [manualBenchmarkOpen, setManualBenchmarkOpen] = useState(true);
  const [openBaselineMetricId, setOpenBaselineMetricId] = useState<string | null>(null);
  const [baselinesSectionOpen, setBaselinesSectionOpen] = useState(false);
  const [pendingBenchmarkDelete, setPendingBenchmarkDelete] = useState<{
    id: string;
    title: string;
    url: string;
  } | null>(null);
  const viewedStepsRef = useRef<Set<WizardStep>>(new Set());
  const hasUserEditedMetricsRef = useRef(false);
  const lastAiMetricsKeyRef = useRef<string | null>(null);
  const lastInitKeyRef = useRef<string | null>(null);
  const baselineSectionInitForBriefRef = useRef<string | null>(null);
  const benchmarksAutoForBriefRef = useRef<string | null>(null);
  const scenariosAutoKeyRef = useRef<string | null>(null);
  const narrativeAutoKeyRef = useRef<string | null>(null);

  const setAndSave = useCallback((next: LocalBrief) => {
    setDraft(next);
    saveDraft(next);
  }, []);

  const applyAiMetricRecommendations = useCallback(
    async (opts?: { preserveSelection?: boolean }) => {
      if (!draft) return;
      setErrors([]);
      try {
        const res = await fetch("/api/metrics/recommend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            initiative: {
              title: draft.initiative.title,
              goal: draft.initiative.goal,
              templateType: draft.initiative.templateType,
              productType: draft.initiative.productType,
              targetUsers: draft.initiative.targetUsers,
              timeline: draft.initiative.timeline,
              releaseApproach: draft.initiative.releaseApproach,
              owner: draft.initiative.owner,
              stakeholders: draft.initiative.stakeholders,
            },
          }),
        });
        const json = (await res.json()) as { ok: boolean; recommendations?: MetricRecommendation[]; error?: string };
        if (!json.ok || !Array.isArray(json.recommendations)) {
          setErrors([json.error || "Gagal mendapatkan rekomendasi metrik."]);
          return;
        }

        const byId = new Map(draft.recommendations.map((r) => [r.metricId, r]));
        const preserveSelection = opts?.preserveSelection ?? true;
        const ranked = json.recommendations
          .slice()
          .sort((a, b) => a.rank - b.rank)
          .map((r, idx) => {
            const existing = byId.get(r.metricId);
            return {
              metricId: r.metricId,
              rank: idx + 1,
              rationale: r.rationale || existing?.rationale || "",
              selected: preserveSelection ? Boolean(existing?.selected) : false,
              recommended: true,
            } satisfies MetricRecommendation;
          });

        const remaining = draft.recommendations
          .filter((r) => !ranked.some((x) => x.metricId === r.metricId))
          .map((r, idx) => ({ ...r, rank: ranked.length + idx + 1, recommended: false }));

        setAndSave(setRecommendations(draft, [...ranked, ...remaining], draft.baselines, draft.benchmarks));
      } catch {
        setErrors(["Gagal mendapatkan rekomendasi metrik."]);
      }
    },
    [draft, setAndSave],
  );

  useEffect(() => {
    const key = draftId || "__new__";
    if (lastInitKeyRef.current === key) return;
    lastInitKeyRef.current = key;

    queueMicrotask(() => {
      if (draftId) {
        const existing = loadDraft(draftId);
        if (existing) {
          if (draft && draft.id === existing.id) return;
          setDraft(existing);
          trackEvent("brief_create_started", { hasExisting: true, briefId: existing.id, step: existing.step });
          return;
        }
      }

      const created = createDraft();
      setDraft(created);
      router.replace(`/new?id=${encodeURIComponent(created.id)}`);
      trackEvent("brief_create_started", { hasExisting: false, briefId: created.id, step: created.step });
    });
  }, [draftId, draft, router]);

  useEffect(() => {
    if (!draft) return;
    if (draft.step === "metrics" && !viewedStepsRef.current.has("metrics")) {
      viewedStepsRef.current.add("metrics");
      trackEvent("metrics_recommended_viewed", {
        briefId: draft.id,
        templateType: draft.initiative.templateType,
        recommendationCount: draft.recommendations.length,
      });
    }

    if (draft.step === "metrics") {
      const aiKey = [
        draft.initiative.templateType,
        draft.initiative.title,
        draft.initiative.goal,
        draft.initiative.productType,
        draft.initiative.targetUsers,
        draft.initiative.timeline,
        draft.initiative.releaseApproach,
        draft.initiative.owner,
        draft.initiative.stakeholders,
      ].join("|");

      if (!hasUserEditedMetricsRef.current && lastAiMetricsKeyRef.current !== aiKey) {
        lastAiMetricsKeyRef.current = aiKey;
        void applyAiMetricRecommendations({ preserveSelection: false });
      }
    }
  }, [draft, applyAiMetricRecommendations]);

  useEffect(() => {
    hasUserEditedMetricsRef.current = false;
    lastAiMetricsKeyRef.current = null;
    baselineSectionInitForBriefRef.current = null;
    setOpenBaselineMetricId(null);
    setBaselinesSectionOpen(false);
    benchmarksAutoForBriefRef.current = null;
    setManualBenchmarkOpen(true);
    scenariosAutoKeyRef.current = null;
    narrativeAutoKeyRef.current = null;
    setGeneratingScenarios(false);
    setGeneratingNarrative(false);
  }, [draft?.id]);

  const selectedMetricIds = useMemo(() => {
    if (!draft) return [];
    return draft.recommendations.filter((r) => r.selected).map((r) => r.metricId);
  }, [draft]);

  useEffect(() => {
    if (!draft) return;
    if (draft.step !== "baselines") return;
    if (baselineSectionInitForBriefRef.current === draft.id) return;
    baselineSectionInitForBriefRef.current = draft.id;
    const hasAnyBaseline = draft.baselines.some((b) => b.provenance !== "Unknown" || b.value !== null || b.note.trim().length > 0);
    setBaselinesSectionOpen(hasAnyBaseline);
  }, [draft]);

  useEffect(() => {
    if (!draft) return;
    if (draft.step !== "baselines") return;
    if (!baselinesSectionOpen) return;
    if (openBaselineMetricId && selectedMetricIds.includes(openBaselineMetricId)) return;
    setOpenBaselineMetricId(selectedMetricIds[0] || null);
  }, [draft, baselinesSectionOpen, openBaselineMetricId, selectedMetricIds]);

  const stepIndex = useMemo(() => {
    if (!draft) return 0;
    return Math.max(0, STEP_ORDER.indexOf(draft.step));
  }, [draft]);

  const markdown = useMemo(() => {
    if (!draft) return "";
    return generateBriefMarkdown(draft);
  }, [draft]);

  function go(step: WizardStep) {
    if (!draft) return;
    setErrors([]);
    setAndSave({ ...draft, step });
  }

  function nextStep() {
    if (!draft) return;
    const v = validateStep(draft);
    if (!v.ok) {
      setErrors(v.errors);
      return;
    }
    setErrors([]);
    const next = STEP_ORDER[Math.min(STEP_ORDER.length - 1, stepIndex + 1)];
    setAndSave({ ...draft, step: next });
  }

  function prevStep() {
    if (!draft) return;
    setErrors([]);
    const prev = STEP_ORDER[Math.max(0, stepIndex - 1)];
    setAndSave({ ...draft, step: prev });
  }

  const fetchBenchmarks = useCallback(async () => {
    if (!draft) return;
    setLoadingBenchmarks(true);
    setErrors([]);
    try {
      const res = await fetch("/api/benchmarks/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initiative: {
            title: draft.initiative.title,
            goal: draft.initiative.goal,
            templateType: draft.initiative.templateType,
            productType: draft.initiative.productType,
            targetUsers: draft.initiative.targetUsers,
            timeline: draft.initiative.timeline,
            releaseApproach: draft.initiative.releaseApproach,
            owner: draft.initiative.owner,
            stakeholders: draft.initiative.stakeholders,
          },
          metricIds: selectedMetricIds,
        }),
      });
      const json = (await res.json()) as { ok: boolean; sources?: unknown[]; error?: string };
      if (!json.ok) {
        setErrors([json.error || "Benchmark search failed."]);
        return;
      }

      const normalized = (json.sources || [])
        .map((s): BenchmarkSource | null => {
          if (!isRecord(s)) return null;
          const url = typeof s.url === "string" ? s.url : "";
          if (!url.startsWith("http")) return null;
          const relevanceRaw = typeof s.relevance === "string" ? s.relevance : "Medium";
          const relevance: BenchmarkSource["relevance"] =
            relevanceRaw === "High" || relevanceRaw === "Medium" || relevanceRaw === "Low" ? relevanceRaw : "Medium";
          const out: BenchmarkSource = {
            id: typeof s.id === "string" ? s.id : newId("src"),
            url,
            title: typeof s.title === "string" && s.title.trim().length > 0 ? s.title : url,
            excerpt: typeof s.excerpt === "string" ? s.excerpt : "",
            metricIds: Array.isArray(s.metricIds) ? s.metricIds.map(String) : [],
            relevance,
            relevanceRationale: typeof s.relevanceRationale === "string" ? s.relevanceRationale : "",
          };
          if (typeof s.publisher === "string" && s.publisher.trim().length > 0) out.publisher = s.publisher;
          if (typeof s.date === "string" && s.date.trim().length > 0) out.date = s.date;
          return out;
        })
        .filter((x): x is BenchmarkSource => x !== null);

      let nextBenchmarks = draft.benchmarks;
      for (const b of normalized) nextBenchmarks = upsertBenchmark(nextBenchmarks, b);
      setAndSave({ ...draft, benchmarks: nextBenchmarks });
      if (normalized.length > 0) {
        trackEvent("benchmark_added", {
          briefId: draft.id,
          source: "vertex_grounding",
          count: normalized.length,
          metricIds: selectedMetricIds,
        });
      }
    } finally {
      setLoadingBenchmarks(false);
    }
  }, [draft, selectedMetricIds, setAndSave]);

  function addManualBenchmark() {
    if (!draft) return;
    if (!manualUrl.trim().startsWith("http")) {
      setErrors(["URL tidak valid."]);
      return;
    }
    if (!manualExcerpt.trim()) {
      setErrors(["Excerpt wajib diisi."]);
      return;
    }
    if (!manualMetricId) {
      setErrors(["Pilih metrik untuk benchmark manual."]);
      return;
    }
    setErrors([]);
    const b: BenchmarkSource = {
      id: newId("src"),
      url: manualUrl.trim(),
      title: manualTitle.trim() || manualUrl.trim(),
      excerpt: manualExcerpt.trim(),
      metricIds: [manualMetricId],
      relevance: "Medium",
      relevanceRationale: "Manual source (user-provided).",
    };
    setManualUrl("");
    setManualTitle("");
    setManualExcerpt("");
    setManualMetricId("");
    setAndSave({ ...draft, benchmarks: upsertBenchmark(draft.benchmarks, b) });
    trackEvent("benchmark_added", { briefId: draft.id, source: "manual", metricId: manualMetricId, url: b.url });
  }

  useEffect(() => {
    if (!draft) return;
    if (draft.step !== "benchmarks") return;
    if (draft.benchmarks.length > 0) return;
    if (loadingBenchmarks) return;
    if (benchmarksAutoForBriefRef.current === draft.id) return;
    benchmarksAutoForBriefRef.current = draft.id;
    void fetchBenchmarks();
  }, [draft, fetchBenchmarks, loadingBenchmarks]);

  const generateNarrative = useCallback(async () => {
    if (!draft) return;
    if (draft.scenarios.length === 0) return;
    if (!draft.confidence || !draft.impactScore) return;
    setGeneratingNarrative(true);
    try {
      const res = await fetch("/api/narrative/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initiative: draft.initiative,
          selectedMetricIds: selectedMetricIds,
          baselines: draft.baselines,
          benchmarks: draft.benchmarks,
          scenarios: draft.scenarios,
          impactScore: draft.impactScore,
          confidenceScore: draft.confidence.score,
          resources: draft.resources,
        }),
      });
      const json = (await res.json()) as { ok: boolean; narrativeMarkdown?: string };
      if (!json.ok || typeof json.narrativeMarkdown !== "string") return;
      setAndSave({ ...draft, narrativeMarkdown: json.narrativeMarkdown });
    } finally {
      setGeneratingNarrative(false);
    }
  }, [draft, selectedMetricIds, setAndSave]);

  const generateScenarios = useCallback(() => {
    if (!draft) return;
    setGeneratingScenarios(true);
    try {
      const scenarios = computeScenarios(draft);
      const confidence = computeConfidence(draft);
      const impactScore = computeImpactScore(draft, scenarios, confidence.score);
      const generatedAt = new Date().toISOString();
      const next = { ...draft, scenarios, confidence, impactScore, generatedAt };
      setAndSave(next);
      setErrors([]);
      trackEvent("scenario_generated", {
        briefId: draft.id,
        selectedMetricCount: selectedMetricIds.length,
        confidenceScore: confidence.score,
        impactScore: impactScore.value,
      });
    } finally {
      setGeneratingScenarios(false);
    }
  }, [draft, selectedMetricIds.length, setAndSave]);

  useEffect(() => {
    if (!draft) return;
    if (draft.step !== "scenarios") return;
    const key = scenarioInputsKey(draft);
    if (scenariosAutoKeyRef.current === key) return;
    scenariosAutoKeyRef.current = key;
    generateScenarios();
  }, [draft, generateScenarios]);

  useEffect(() => {
    if (!draft) return;
    if (draft.step !== "scenarios") return;
    if (draft.scenarios.length === 0 || !draft.confidence || !draft.impactScore) return;
    const key = scenarioInputsKey(draft);
    if (narrativeAutoKeyRef.current === key) return;
    narrativeAutoKeyRef.current = key;
    void generateNarrative();
  }, [draft, generateNarrative]);

  function exportFiles() {
    if (!draft) return;
    const slug = slugify(draft.initiative.title || "impact-brief");
    const date = new Date().toISOString().slice(0, 10);
    const mdName = `impact-brief_${slug}_${date}.md`;
    const jsonName = `impact-brief_${slug}_${date}.json`;
    downloadTextFile(mdName, markdown, "text/markdown;charset=utf-8");
    downloadTextFile(jsonName, JSON.stringify(draft, null, 2), "application/json;charset=utf-8");
    trackEvent("brief_exported", {
      briefId: draft.id,
      templateType: draft.initiative.templateType,
      selectedMetricCount: selectedMetricIds.length,
      baselineCount: draft.baselines.length,
      benchmarkCount: draft.benchmarks.length,
      hasScenarios: draft.scenarios.length > 0,
    });
  }

  if (!draft) {
    return (
      <AppShell title="New brief">
        <div className="text-sm text-zinc-600">Loading…</div>
      </AppShell>
    );
  }

  const template = TEMPLATES.find((t) => t.type === draft.initiative.templateType);

  return (
    <AppShell title="New brief">
      <div className="grid gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xl font-semibold tracking-tight">Buat Impact Brief</div>
            <div className="mt-1 text-sm text-zinc-600">
              {template?.label || draft.initiative.templateType} • {draft.initiative.title || "Untitled"}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => exportFiles()}
              className="inline-flex h-9 items-center justify-center rounded-md bg-zinc-900 px-3 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Ekspor
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="flex flex-wrap gap-2">
            {STEP_ORDER.map((s) => {
              const active = s === draft.step;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => go(s)}
                  className={`inline-flex h-8 items-center justify-center rounded-md px-3 text-sm ${
                    active ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-800 hover:bg-zinc-200"
                  }`}
                >
                  {stepLabel(s)}
                </button>
              );
            })}
          </div>
        </div>

        {errors.length > 0 ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <ul className="list-disc pl-5">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {draft.step === "intake" ? (
          <div className="rounded-lg border border-zinc-200 bg-white p-6">
            <div className="text-sm font-medium text-zinc-950">Initiative intake</div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="grid gap-1">
                <span className="text-sm text-zinc-700">Title</span>
                <input
                  value={draft.initiative.title}
                  onChange={(e) => setAndSave(updateInitiative(draft, { title: e.target.value }))}
                  className="h-10 rounded-md border border-zinc-300 px-3 text-sm"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-sm text-zinc-700">Template</span>
                <select
                  value={draft.initiative.templateType}
                  onChange={(e) => {
                    const nextTemplate = e.target.value as TemplateType;
                    setAndSave(updateInitiative(draft, { templateType: nextTemplate }));
                    trackEvent("template_selected", { briefId: draft.id, templateType: nextTemplate });
                  }}
                  className="h-10 rounded-md border border-zinc-300 px-3 text-sm"
                >
                  {TEMPLATES.map((t) => (
                    <option key={t.type} value={t.type}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 md:col-span-2">
                <span className="text-sm text-zinc-700">Goal statement</span>
                <textarea
                  value={draft.initiative.goal}
                  onChange={(e) => setAndSave(updateInitiative(draft, { goal: e.target.value }))}
                  className="min-h-[88px] rounded-md border border-zinc-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-sm text-zinc-700">Product type</span>
                <select
                  value={draft.initiative.productType}
                  onChange={(e) => setAndSave(updateInitiative(draft, { productType: e.target.value }))}
                  className="h-10 rounded-md border border-zinc-300 px-3 text-sm"
                >
                  <option value="">Select…</option>
                  <option value="B2B SaaS">B2B SaaS</option>
                  <option value="B2C">B2C</option>
                  <option value="Marketplace">Marketplace</option>
                  <option value="Internal tool">Internal tool</option>
                  <option value="Other">Other</option>
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-sm text-zinc-700">Target users</span>
                <select
                  value={draft.initiative.targetUsers}
                  onChange={(e) => setAndSave(updateInitiative(draft, { targetUsers: e.target.value as Initiative["targetUsers"] }))}
                  className="h-10 rounded-md border border-zinc-300 px-3 text-sm"
                >
                  <option value="customer">Customer</option>
                  <option value="employee">Employee</option>
                  <option value="both">Both</option>
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-sm text-zinc-700">Timeline</span>
                <input
                  value={draft.initiative.timeline}
                  onChange={(e) => setAndSave(updateInitiative(draft, { timeline: e.target.value }))}
                  className="h-10 rounded-md border border-zinc-300 px-3 text-sm"
                  placeholder="e.g., 2–4 weeks"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-sm text-zinc-700">Release approach</span>
                <select
                  value={draft.initiative.releaseApproach}
                  onChange={(e) =>
                    setAndSave(updateInitiative(draft, { releaseApproach: e.target.value as Initiative["releaseApproach"] }))
                  }
                  className="h-10 rounded-md border border-zinc-300 px-3 text-sm"
                >
                  <option value="unknown">Unknown</option>
                  <option value="big_bang">Big bang</option>
                  <option value="staged">Staged</option>
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-sm text-zinc-700">Owner</span>
                <input
                  value={draft.initiative.owner}
                  onChange={(e) => setAndSave(updateInitiative(draft, { owner: e.target.value }))}
                  className="h-10 rounded-md border border-zinc-300 px-3 text-sm"
                  placeholder="Name / role"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-sm text-zinc-700">Stakeholders</span>
                <input
                  value={draft.initiative.stakeholders}
                  onChange={(e) => setAndSave(updateInitiative(draft, { stakeholders: e.target.value }))}
                  className="h-10 rounded-md border border-zinc-300 px-3 text-sm"
                  placeholder="Comma-separated names / roles"
                />
              </label>
            </div>

            {template?.intakeHints?.length ? (
              <div className="mt-4 rounded-md bg-zinc-50 p-3 text-sm text-zinc-700">
                <div className="font-medium">Template hints</div>
                <ul className="mt-1 list-disc pl-5">
                  {template.intakeHints.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        {draft.step === "metrics" ? (
          <div className="rounded-lg border border-zinc-200 bg-white p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-zinc-950">Metric recommendations</div>
                <div className="mt-1 text-sm text-zinc-600">Pilih metrik yang paling relevan untuk brief ini.</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-sm text-zinc-600">Selected: {selectedMetricIds.length}</div>
              </div>
            </div>
            <div className="mt-4 grid gap-3">
              {draft.recommendations
                .slice()
                .sort((a, b) => a.rank - b.rank)
                .map((r) => {
                  const m = getMetric(r.metricId);
                  if (!m) return null;
                  return (
                    <label key={r.metricId} className="flex gap-3 rounded-md border border-zinc-200 p-3">
                      <input
                        type="checkbox"
                        checked={r.selected}
                        onChange={(e) => {
                          hasUserEditedMetricsRef.current = true;
                          trackEvent("metric_edited", { briefId: draft.id, metricId: r.metricId, selected: e.target.checked });
                          const nextRecs: MetricRecommendation[] = draft.recommendations.map((x) =>
                            x.metricId === r.metricId ? { ...x, selected: e.target.checked } : x,
                          );
                          const next = setRecommendations(draft, nextRecs, draft.baselines, draft.benchmarks);
                          setAndSave(next);
                        }}
                        className="mt-1 h-4 w-4"
                      />
                      <div className="grid gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-sm font-medium text-zinc-950">{m.name}</div>
                          <span className="text-xs text-zinc-600">({m.type}, {m.category})</span>
                          {r.recommended ? (
                            <span className="inline-flex items-center rounded-full bg-green-200 px-2 py-0.5 text-xs font-medium text-zinc-700">
                              Direkomendasikan ✨
                            </span>
                          ) : null}
                        </div>
                        <div className="text-sm text-zinc-700">{m.definition}</div>
                        {m.formula ? <div className="text-xs text-zinc-600">Formula: {m.formula}</div> : null}
                      </div>
                    </label>
                  );
                })}
            </div>
          </div>
        ) : null}

        {draft.step === "baselines" ? (
          <div className="grid gap-4">
            <div className="rounded-lg border border-zinc-200 bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-zinc-950">Resource</div>
                  <div className="mt-1 text-sm text-zinc-600">Wajib diisi. Dipakai untuk estimasi cost dan proxy execution complexity.</div>
                </div>
                <div className="text-xs font-medium text-red-600">Wajib</div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="grid gap-1">
                  <span className="flex items-center gap-1 text-xs text-zinc-600">
                    Eng effort (person-weeks) *
                    <InfoTooltip
                      label="Info person-week"
                      text="Person-week = 1 orang bekerja full-time selama 1 minggu. Contoh: 2 orang × 3 minggu = 6 person-weeks."
                    />
                  </span>
                  <input
                    value={draft.resources.engEffortPersonWeeks === null ? "" : String(draft.resources.engEffortPersonWeeks)}
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      const val = raw === "" ? null : Number(raw.replaceAll(",", ""));
                      setAndSave({
                        ...draft,
                        resources: { ...draft.resources, engEffortPersonWeeks: val !== null && Number.isFinite(val) ? val : null },
                      });
                    }}
                    inputMode="decimal"
                    className="h-10 rounded-md border border-zinc-300 px-3 text-sm"
                  />
                </label>
                <label className="grid gap-1">
                  <span className="flex items-center gap-1 text-xs text-zinc-600">
                    Design effort (person-weeks) *
                    <InfoTooltip
                      label="Info person-week"
                      text="Person-week = 1 orang bekerja full-time selama 1 minggu. Contoh: 2 orang × 3 minggu = 6 person-weeks."
                    />
                  </span>
                  <input
                    value={draft.resources.designEffortPersonWeeks === null ? "" : String(draft.resources.designEffortPersonWeeks)}
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      const val = raw === "" ? null : Number(raw.replaceAll(",", ""));
                      setAndSave({
                        ...draft,
                        resources: { ...draft.resources, designEffortPersonWeeks: val !== null && Number.isFinite(val) ? val : null },
                      });
                    }}
                    inputMode="decimal"
                    className="h-10 rounded-md border border-zinc-300 px-3 text-sm"
                  />
                </label>
                <label className="grid gap-1">
                  <span className="flex items-center gap-1 text-xs text-zinc-600">
                    PM/Other effort (person-weeks) *
                    <InfoTooltip
                      label="Info person-week"
                      text="Person-week = 1 orang bekerja full-time selama 1 minggu. Contoh: 2 orang × 3 minggu = 6 person-weeks."
                    />
                  </span>
                  <input
                    value={draft.resources.pmOtherEffortPersonWeeks === null ? "" : String(draft.resources.pmOtherEffortPersonWeeks)}
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      const val = raw === "" ? null : Number(raw.replaceAll(",", ""));
                      setAndSave({
                        ...draft,
                        resources: { ...draft.resources, pmOtherEffortPersonWeeks: val !== null && Number.isFinite(val) ? val : null },
                      });
                    }}
                    inputMode="decimal"
                    className="h-10 rounded-md border border-zinc-300 px-3 text-sm"
                  />
                </label>
                <label className="grid gap-1">
                  <span className="flex items-center gap-1 text-xs text-zinc-600">
                    Fully-loaded cost rate (IDR / person-week) *
                    <InfoTooltip
                      label="Info cost rate"
                      text="Biaya fully-loaded per 1 person-week (gaji + benefit + overhead). Dipakai untuk menghitung Estimated cost = total person-weeks × rate."
                    />
                  </span>
                  <input
                    value={
                      draft.resources.fullyLoadedCostRateIdrPerPersonWeek === null
                        ? ""
                        : String(draft.resources.fullyLoadedCostRateIdrPerPersonWeek)
                    }
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      const val = raw === "" ? null : Number(raw.replaceAll(",", ""));
                      setAndSave({
                        ...draft,
                        resources: {
                          ...draft.resources,
                          fullyLoadedCostRateIdrPerPersonWeek: val !== null && Number.isFinite(val) ? val : null,
                        },
                      });
                    }}
                    inputMode="decimal"
                    className="h-10 rounded-md border border-zinc-300 px-3 text-sm"
                  />
                </label>
              </div>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-zinc-950">Baseline</div>
                  <div className="mt-1 text-sm text-zinc-600">Opsional. Boleh Unknown, tapi confidence akan turun.</div>
                </div>
                <button
                  type="button"
                  onClick={() => setBaselinesSectionOpen((v) => !v)}
                  className="inline-flex h-9 items-center justify-center rounded-md border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-900 hover:bg-zinc-50"
                >
                  {baselinesSectionOpen ? "Tutup baseline" : "Buka baseline"}
                </button>
              </div>

              {baselinesSectionOpen ? (
                <div className="mt-4 grid gap-3">
                  {selectedMetricIds.length === 0 ? (
                    <div className="text-sm text-zinc-600">Pilih minimal 1 metrik di step sebelumnya.</div>
                  ) : (
                    selectedMetricIds.map((metricId) => {
                      const m = getMetric(metricId);
                      if (!m) return null;
                      const existing = draft.baselines.find((b) => b.metricId === metricId);
                      const b: Baseline =
                        existing ||
                        ({
                          metricId,
                          value: null,
                          unit: unitDefault(metricId),
                          window: "last 30 days",
                          provenance: "Unknown",
                          note: "",
                        } satisfies Baseline);

                      const open = openBaselineMetricId === metricId;
                      const summaryValue = b.provenance === "Unknown" ? "Unknown" : b.value === null ? "—" : `${b.value} ${b.unit}`;

                      return (
                        <div key={metricId} className="rounded-md border border-zinc-200">
                          <button
                            type="button"
                            onClick={() => setOpenBaselineMetricId(open ? null : metricId)}
                            aria-expanded={open}
                            className="flex w-full items-start justify-between gap-3 p-4 text-left hover:bg-zinc-50"
                          >
                            <div className="grid gap-1">
                              <div className="flex flex-wrap items-baseline gap-2">
                                <div className="text-sm font-medium text-zinc-950">{m.name}</div>
                                <div className="text-xs text-zinc-600">
                                  {m.category} • {m.type}
                                </div>
                              </div>
                              <div className="text-xs text-zinc-600">
                                {summaryValue} • {b.window} • {b.provenance}
                              </div>
                            </div>
                            <div className="mt-0.5 text-xs font-medium text-zinc-700">{open ? "Tutup ▾" : "Buka ▸"}</div>
                          </button>
                          {open ? (
                            <div className="border-t border-zinc-200 p-4">
                              <div className="grid gap-3 md:grid-cols-5">
                                <label className="grid gap-1 md:col-span-2">
                                  <span className="text-xs text-zinc-600">Value</span>
                                  <input
                                    value={b.value === null ? "" : String(b.value)}
                                    onChange={(e) => {
                                      const raw = e.target.value;
                                      const value = raw.trim() === "" ? null : Number(raw);
                                      const nextB: Baseline = { ...b, value: Number.isFinite(value) ? value : null };
                                      const prev = existing?.value ?? null;
                                      if (prev === null && nextB.value !== null) {
                                        trackEvent("baseline_added", { briefId: draft.id, metricId, provenance: nextB.provenance });
                                      }
                                      setAndSave({ ...draft, baselines: upsertBaseline(draft.baselines, nextB) });
                                    }}
                                    disabled={b.provenance === "Unknown"}
                                    inputMode="decimal"
                                    className="h-10 rounded-md border border-zinc-300 px-3 text-sm disabled:bg-zinc-50"
                                  />
                                </label>
                                <label className="grid gap-1">
                                  <span className="text-xs text-zinc-600">Unit</span>
                                  <input
                                    value={b.unit}
                                    onChange={(e) => {
                                      const nextB: Baseline = { ...b, unit: e.target.value };
                                      setAndSave({ ...draft, baselines: upsertBaseline(draft.baselines, nextB) });
                                    }}
                                    className="h-10 rounded-md border border-zinc-300 px-3 text-sm"
                                  />
                                </label>
                                <label className="grid gap-1">
                                  <span className="text-xs text-zinc-600">Window</span>
                                  <input
                                    value={b.window}
                                    onChange={(e) => {
                                      const nextB: Baseline = { ...b, window: e.target.value };
                                      setAndSave({ ...draft, baselines: upsertBaseline(draft.baselines, nextB) });
                                    }}
                                    className="h-10 rounded-md border border-zinc-300 px-3 text-sm"
                                  />
                                </label>
                                <label className="grid gap-1">
                                  <span className="text-xs text-zinc-600">Provenance</span>
                                  <select
                                    value={b.provenance}
                                    onChange={(e) => {
                                      const provenance = e.target.value as BaselineProvenance;
                                      const nextB: Baseline = { ...b, provenance, value: provenance === "Unknown" ? null : b.value };
                                      if (b.provenance === "Unknown" && provenance !== "Unknown") {
                                        trackEvent("baseline_added", { briefId: draft.id, metricId, provenance });
                                      }
                                      setAndSave({ ...draft, baselines: upsertBaseline(draft.baselines, nextB) });
                                    }}
                                    className="h-10 rounded-md border border-zinc-300 px-3 text-sm"
                                  >
                                    <option value="Unknown">Unknown</option>
                                    <option value="Observed">Observed</option>
                                    <option value="Estimated">Estimated</option>
                                  </select>
                                </label>
                                <label className="grid gap-1 md:col-span-5">
                                  <span className="text-xs text-zinc-600">Note / source</span>
                                  <input
                                    value={b.note}
                                    onChange={(e) => {
                                      const nextB: Baseline = { ...b, note: e.target.value };
                                      setAndSave({ ...draft, baselines: upsertBaseline(draft.baselines, nextB) });
                                    }}
                                    className="h-10 rounded-md border border-zinc-300 px-3 text-sm"
                                  />
                                </label>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>
              ) : (
                <div className="mt-4 text-sm text-zinc-600">Baseline ditutup (opsional).</div>
              )}
            </div>
          </div>
        ) : null}

        {draft.step === "benchmarks" ? (
          <div className="rounded-lg border border-zinc-200 bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-zinc-950">Benchmark sources</div>
                <div className="mt-1 text-sm text-zinc-600">Live search otomatis via Vertex AI grounding (bila env tersedia).</div>
              </div>
              <div className="flex items-center gap-2">
                {loadingBenchmarks ? <div className="text-xs text-zinc-600">Searching…</div> : null}
                <button
                  type="button"
                  onClick={() => setManualBenchmarkOpen((v) => !v)}
                  className="inline-flex h-9 items-center justify-center rounded-md bg-zinc-900 px-3 text-sm font-medium text-white hover:bg-zinc-800"
                >
                  {manualBenchmarkOpen ? "Tutup manual source" : "Add manual source"}
                </button>
              </div>
            </div>

            {manualBenchmarkOpen ? (
              <div className="mt-5 rounded-md border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-sm font-medium text-zinc-950">Tambah benchmark manual</div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="grid gap-1 md:col-span-2">
                    <span className="text-xs text-zinc-600">URL</span>
                    <input
                      value={manualUrl}
                      onChange={(e) => setManualUrl(e.target.value)}
                      className="h-10 rounded-md border border-zinc-300 px-3 text-sm"
                      placeholder="https://..."
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs text-zinc-600">Title (optional)</span>
                    <input value={manualTitle} onChange={(e) => setManualTitle(e.target.value)} className="h-10 rounded-md border border-zinc-300 px-3 text-sm" />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs text-zinc-600">Metric</span>
                    <select
                      value={manualMetricId}
                      onChange={(e) => setManualMetricId(e.target.value)}
                      className="h-10 rounded-md border border-zinc-300 px-3 text-sm"
                    >
                      <option value="">Select…</option>
                      {selectedMetricIds.map((id) => (
                        <option key={id} value={id}>
                          {getMetric(id)?.name || id}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 md:col-span-2">
                    <span className="text-xs text-zinc-600">Excerpt (1–3 kalimat)</span>
                    <textarea
                      value={manualExcerpt}
                      onChange={(e) => setManualExcerpt(e.target.value)}
                      className="min-h-[80px] rounded-md border border-zinc-300 px-3 py-2 text-sm"
                    />
                  </label>
                </div>
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => addManualBenchmark()}
                    className="inline-flex h-9 items-center justify-center rounded-md bg-zinc-900 px-3 text-sm font-medium text-white hover:bg-zinc-800"
                  >
                    Add manual source
                  </button>
                </div>
              </div>
            ) : null}

            <div className={`${manualBenchmarkOpen ? "mt-6" : "mt-5"} grid gap-3`}>
              {draft.benchmarks.length === 0 ? (
                <div className="text-sm text-zinc-600">{loadingBenchmarks ? "Mencari benchmark…" : "Belum ada benchmark."}</div>
              ) : (
                draft.benchmarks.map((b) => (
                  <div key={b.id} className="rounded-md border border-zinc-200 p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <a href={b.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-zinc-950 hover:underline">
                        {b.title || b.url}
                      </a>
                      <div className="text-xs text-zinc-600">
                        {b.relevance} • {b.metricIds.join(", ")}
                      </div>
                    </div>
                    {b.publisher || b.date ? (
                      <div className="mt-1 text-xs text-zinc-600">{[b.publisher, b.date].filter(Boolean).join(" — ")}</div>
                    ) : null}
                    <div className="mt-2 text-sm text-zinc-700">{b.excerpt}</div>
                    <div className="mt-2 text-xs text-zinc-600">{b.relevanceRationale}</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setPendingBenchmarkDelete({
                            id: b.id,
                            title: b.title || b.url,
                            url: b.url,
                          });
                        }}
                        className="inline-flex h-8 items-center justify-center rounded-md border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-900 hover:bg-zinc-50"
                      >
                        Hapus
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}

        {draft.step === "scenarios" ? (
          <div className="grid gap-4">
            <div className="rounded-lg border border-zinc-200 bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-zinc-950">Skenario & output</div>
                  <div className="mt-1 text-sm text-zinc-600">Auto-generated. Siap untuk diekspor.</div>
                </div>
                <div className="flex items-center gap-2">
                  {generatingScenarios ? <div className="text-xs text-zinc-600">Generating scenarios…</div> : null}
                  {generatingNarrative ? <div className="text-xs text-zinc-600">Generating narrative…</div> : null}
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
                  <div className="flex items-center gap-2 text-xs text-zinc-600">
                    Confidence
                    <InfoTooltip
                      label="Info confidence"
                      text="Confidence = 0.35×baselineCompleteness + 0.35×benchmarkQuality + 0.15×executionComplexity + 0.15×measurementPlanQuality. executionComplexity diproxy dari total effort (person-weeks)."
                    />
                  </div>
                  <div className="mt-1 text-lg font-semibold text-zinc-950">{draft.confidence ? `${draft.confidence.score}/100` : "—"}</div>
                  {draft.confidence ? (
                    <div className="mt-2 text-xs text-zinc-600">
                      baseline={Math.round(100 * draft.confidence.drivers.baselineCompleteness)}% • benchmark=
                      {Math.round(100 * draft.confidence.drivers.benchmarkQuality)}% • exec=
                      {Math.round(100 * draft.confidence.drivers.executionComplexity)}% • measurement=
                      {Math.round(100 * draft.confidence.drivers.measurementPlanQuality)}%
                    </div>
                  ) : null}
                </div>
                <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
                  <div className="flex items-center gap-2 text-xs text-zinc-600">
                    ImpactScore
                    <InfoTooltip
                      label="Info impactscore"
                      text="ImpactScore dihitung dari hasil skenario (mis. incremental completions dari conversion) dan disesuaikan oleh confidence. Jika data belum cukup, sistem pakai proxy sederhana (jumlah metrik terpilih)."
                    />
                  </div>
                  <div className="mt-1 text-lg font-semibold text-zinc-950">{draft.impactScore ? draft.impactScore.value : "—"}</div>
                  {draft.impactScore?.why?.length ? (
                    <div className="mt-2 text-xs text-zinc-600">{draft.impactScore.why[0]}</div>
                  ) : null}
                </div>
                <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
                  <div className="flex items-center gap-2 text-xs text-zinc-600">
                    Resources
                    <InfoTooltip
                      label="Info resources"
                      text="Total effort = Eng + Design + PM/Other (person-weeks). Estimated cost = total effort × fully-loaded cost rate (IDR/person-week)."
                    />
                  </div>
                  <div className="mt-1 text-sm font-semibold text-zinc-950">
                    {(() => {
                      const eng = draft.resources.engEffortPersonWeeks;
                      const design = draft.resources.designEffortPersonWeeks;
                      const pmOther = draft.resources.pmOtherEffortPersonWeeks;
                      const rate = draft.resources.fullyLoadedCostRateIdrPerPersonWeek;
                      const effortKnown = [eng, design, pmOther].every((v) => typeof v === "number" && Number.isFinite(v));
                      const totalEffort = effortKnown ? (eng as number) + (design as number) + (pmOther as number) : null;
                      const cost = totalEffort !== null && typeof rate === "number" && Number.isFinite(rate) && rate > 0 ? Math.round(totalEffort * rate) : null;
                      const line1 = totalEffort === null ? "Total effort: —" : `Total effort: ${fmtNumber(totalEffort, { decimals: true })} pw`;
                      const line2 = cost === null ? "Estimated cost: —" : `Estimated cost: ${fmtIdr(cost)}`;
                      return `${line1} • ${line2}`;
                    })()}
                  </div>
                  <div className="mt-2 text-xs text-zinc-600">
                    Benchmarks: {draft.benchmarks.length} • Metrics selected: {selectedMetricIds.length}
                  </div>
                </div>
              </div>

              {draft.scenarios.length > 0 ? (
                <div className="mt-5 rounded-md border border-zinc-200 bg-zinc-50 p-4">
                  <div className="text-sm font-medium text-zinc-950">Ringkasan</div>
                  <div className="mt-1 text-sm text-zinc-700">{scenarioSummary(draft, draft.scenarios)}</div>
                </div>
              ) : (
                <div className="mt-5 text-sm text-zinc-600">{generatingScenarios ? "Sedang generate skenario…" : "Output belum tersedia."}</div>
              )}
            </div>

            {draft.scenarios.length > 0 ? (
              <div className="rounded-lg border border-zinc-200 bg-white p-6">
                <div className="flex items-center gap-2 text-sm font-medium text-zinc-950">
                  Scenario dashboard
                  <InfoTooltip
                    label="Info scenario"
                    text="Skenario worst/base/best menggunakan uplift_pct_{worst|base|best} dan baseline. Contoh conversion_rate: incremental completions/month = volume_per_month × delta(pp) / 100."
                  />
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  {draft.scenarios
                    .slice()
                    .sort(
                      (a, b) =>
                        (a.name === "worst" ? 0 : a.name === "base" ? 1 : 2) - (b.name === "worst" ? 0 : b.name === "base" ? 1 : 2),
                    )
                    .map((sc) => (
                      <div key={sc.name} className="rounded-md border border-zinc-200 p-4">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <div className="text-sm font-semibold text-zinc-950">{sc.name}</div>
                          {Object.keys(sc.rollups).length > 0 ? (
                            <div className="text-xs text-zinc-600">
                              {Object.entries(sc.rollups)
                                .map(([k, v]) => {
                                  if (typeof v !== "number") return `${k}: ${String(v)}`;
                                  const rate = draft.resources.fullyLoadedCostRateIdrPerPersonWeek;
                                  const isIdrCost = k === "cost" && typeof rate === "number" && Number.isFinite(rate) && rate > 0;
                                  if (k === "cost") return `${isIdrCost ? "cost (IDR)" : "cost"}: ${isIdrCost ? fmtIdr(v) : fmtNumber(v)}`;
                                  if (k === "revenue") return `incremental/month: ${fmtNumber(v)}`;
                                  return `${k}: ${fmtNumber(v)}`;
                                })
                                .join(" • ")}
                            </div>
                          ) : (
                            <div className="text-xs text-zinc-600">Rollups: —</div>
                          )}
                        </div>
                        <div className="mt-3 grid gap-2">
                          {sc.metricDeltas.map((d) => {
                            const m = getMetric(d.metricId);
                            const label = m ? m.name : d.metricId;
                            const baseline = d.baselineValue === null ? "unknown" : `${fmtNumber(d.baselineValue, { decimals: true })} ${d.unit}`;
                            const assumed = d.assumedValue === null ? "unknown" : `${fmtNumber(d.assumedValue, { decimals: true })} ${d.unit}`;
                            const delta = d.delta === null ? "unknown" : `${d.delta >= 0 ? "+" : ""}${fmtNumber(d.delta, { decimals: true })} ${d.unit}`;
                            return (
                              <div key={d.metricId} className="flex flex-wrap items-baseline justify-between gap-2 rounded-md bg-zinc-50 px-3 py-2">
                                <div className="text-xs font-medium text-zinc-900">{label}</div>
                                <div className="text-xs text-zinc-600">
                                  {baseline} → {assumed} ({delta})
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ) : null}

            <div className="rounded-lg border border-zinc-200 bg-white p-6">
              <div className="grid gap-3">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: (props) => <h1 {...props} className="text-xl font-semibold tracking-tight" />,
                    h2: (props) => <h2 {...props} className="mt-2 text-lg font-semibold" />,
                    h3: (props) => <h3 {...props} className="mt-2 text-base font-semibold" />,
                    p: (props) => <p {...props} className="text-sm leading-6" />,
                    ul: (props) => <ul {...props} className="list-disc pl-5 text-sm" />,
                    ol: (props) => <ol {...props} className="list-decimal pl-5 text-sm" />,
                    li: (props) => <li {...props} className="my-1" />,
                    a: (props) => <a {...props} className="underline" target="_blank" rel="noreferrer" />,
                    code: (props) => <code {...props} className="rounded bg-zinc-50 px-1 py-0.5 font-mono text-xs" />,
                    pre: (props) => <pre {...props} className="overflow-auto rounded-md bg-zinc-50 p-3 font-mono text-xs" />,
                    table: (props) => <table {...props} className="w-full border-collapse text-sm" />,
                    th: (props) => <th {...props} className="border border-zinc-200 bg-zinc-50 px-2 py-1 text-left text-xs font-semibold" />,
                    td: (props) => <td {...props} className="border border-zinc-200 px-2 py-1 text-xs" />,
                  }}
                >
                  {markdown}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => prevStep()}
            disabled={stepIndex === 0}
            className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:bg-zinc-50 disabled:text-zinc-400"
          >
            Kembali
          </button>
          {stepIndex === STEP_ORDER.length - 1 ? (
            <button
              type="button"
              onClick={() => exportFiles()}
              className="inline-flex h-10 items-center justify-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Ekspor
            </button>
          ) : (
            <button
              type="button"
              onClick={() => nextStep()}
              className="inline-flex h-10 items-center justify-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Lanjut
            </button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(pendingBenchmarkDelete)}
        title="Hapus benchmark?"
        description={
          pendingBenchmarkDelete
            ? `Benchmark "${pendingBenchmarkDelete.title}" akan dihapus dari draft ini.`
            : undefined
        }
        confirmLabel="Hapus"
        cancelLabel="Batal"
        onCancel={() => setPendingBenchmarkDelete(null)}
        onConfirm={() => {
          if (!pendingBenchmarkDelete) return;
          setAndSave({ ...draft, benchmarks: draft.benchmarks.filter((x) => x.id !== pendingBenchmarkDelete.id) });
          setPendingBenchmarkDelete(null);
        }}
      />
    </AppShell>
  );
}

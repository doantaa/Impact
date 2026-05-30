import type {
  Assumption,
  Baseline,
  BenchmarkSource,
  ImpactBrief,
  Initiative,
  MetricRecommendation,
  TemplateType,
} from "../domain/types";
import { getMetric, METRICS } from "../metrics/catalog";
import { recommendMetrics } from "../metrics/recommender";

export type WizardStep = "intake" | "metrics" | "baselines" | "benchmarks" | "scenarios" | "preview";

export type LocalBrief = ImpactBrief & {
  step: WizardStep;
};

const LEGACY_STORAGE_KEY = "impact.brief.v1";
const INDEX_KEY = "impact.briefs.v1.index";
const ITEM_KEY_PREFIX = "impact.briefs.v1.item.";

export type DraftSummary = {
  id: string;
  title: string;
  templateType: TemplateType;
  updatedAt: string;
  step: WizardStep;
};

export function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

export function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function createNewDraft(): LocalBrief {
  const now = new Date().toISOString();
  const initiative: Initiative = {
    id: newId("init"),
    title: "",
    goal: "",
    templateType: "new_feature",
    productType: "",
    targetUsers: "customer",
    timeline: "",
    releaseApproach: "unknown",
    owner: "",
    stakeholders: "",
    createdAt: now,
    updatedAt: now,
  };

  const recommendations = applyRecommendedFromTemplate(
    METRICS.map((m, idx) => ({
      metricId: m.id,
      rank: idx + 1,
      rationale: "",
      selected: false,
      recommended: false,
    })),
    initiative.templateType,
    initiative.goal,
  );

  return {
    id: newId("brief"),
    version: 1,
    initiative,
    recommendations,
    baselines: [],
    benchmarks: [],
    resources: {
      engEffortPersonWeeks: null,
      designEffortPersonWeeks: null,
      pmOtherEffortPersonWeeks: null,
      fullyLoadedCostRateIdrPerPersonWeek: null,
    },
    assumptions: defaultAssumptions(initiative.templateType),
    scenarios: [],
    confidence: null,
    impactScore: null,
    narrativeMarkdown: "",
    generatedAt: now,
    step: "intake",
  };
}

export function defaultAssumptions(templateType: TemplateType): Assumption[] {
  const base: Assumption[] = [
    {
      key: "uplift_pct_base",
      value: 1,
      unit: "%",
      rationale: "Default uplift base-case; ubah sesuai konteks.",
      provenance: "Default",
    },
    {
      key: "uplift_pct_best",
      value: 2,
      unit: "%",
      rationale: "Default uplift best-case; ubah sesuai konteks.",
      provenance: "Default",
    },
    {
      key: "uplift_pct_worst",
      value: 0.25,
      unit: "%",
      rationale: "Default uplift worst-case; ubah sesuai konteks.",
      provenance: "Default",
    },
    {
      key: "volume_per_month",
      value: 10000,
      unit: "users",
      rationale: "Volume bucket default bila volume sebenarnya unknown.",
      provenance: "Default",
    },
    {
      key: "execution_complexity",
      value: "medium",
      unit: "level",
      rationale: "Proxy execution complexity untuk confidence.",
      provenance: "Default",
    },
  ];

  if (templateType === "tech_debt") {
    base.push(
      {
        key: "team_size",
        value: 6,
        unit: "engineers",
        rationale: "Ukuran tim untuk estimasi time saved.",
        provenance: "Default",
      },
      {
        key: "hours_per_engineer_week",
        value: 40,
        unit: "hours",
        rationale: "Asumsi jam kerja per engineer per minggu.",
        provenance: "Default",
      },
      {
        key: "maintenance_pct_after_base",
        value: 25,
        unit: "%",
        rationale: "Maintenance% setelah perbaikan (base-case).",
        provenance: "Default",
      },
      {
        key: "maintenance_pct_after_best",
        value: 20,
        unit: "%",
        rationale: "Maintenance% setelah perbaikan (best-case).",
        provenance: "Default",
      },
      {
        key: "maintenance_pct_after_worst",
        value: 30,
        unit: "%",
        rationale: "Maintenance% setelah perbaikan (worst-case).",
        provenance: "Default",
      },
    );
  }

  return base;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readIndex(): string[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(INDEX_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeIndex(ids: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(INDEX_KEY, JSON.stringify(ids));
}

function itemKey(id: string) {
  return `${ITEM_KEY_PREFIX}${id}`;
}

function migrateLegacyIfNeeded() {
  if (typeof window === "undefined") return;
  const index = readIndex();
  if (index.length > 0) return;

  const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!legacyRaw) return;
  try {
    const legacy = JSON.parse(legacyRaw) as unknown;
    if (!isRecord(legacy) || typeof legacy["id"] !== "string") return;
    const id = legacy["id"] as string;
    window.localStorage.setItem(itemKey(id), legacyRaw);
    writeIndex([id]);
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    return;
  }
}

function normalizeDraft(value: unknown): LocalBrief | null {
  if (!isRecord(value)) return null;
  if (!isRecord(value["initiative"])) return null;
  if (typeof value["step"] === "string") {
    const step = value["step"];
    if (step === "preview") value["step"] = "scenarios";
    if (step !== "intake" && step !== "metrics" && step !== "baselines" && step !== "benchmarks" && step !== "scenarios") value["step"] = "intake";
  } else {
    value["step"] = "intake";
  }
  const initiative = value["initiative"] as Record<string, unknown>;
  if (typeof initiative["owner"] !== "string") initiative["owner"] = "";
  if (typeof initiative["stakeholders"] !== "string") initiative["stakeholders"] = "";
  if (typeof initiative["productType"] !== "string") initiative["productType"] = "";
  const resources = isRecord(value["resources"]) ? (value["resources"] as Record<string, unknown>) : {};
  const engEffortPersonWeeks = typeof resources["engEffortPersonWeeks"] === "number" && Number.isFinite(resources["engEffortPersonWeeks"]) ? (resources["engEffortPersonWeeks"] as number) : null;
  const designEffortPersonWeeks = typeof resources["designEffortPersonWeeks"] === "number" && Number.isFinite(resources["designEffortPersonWeeks"]) ? (resources["designEffortPersonWeeks"] as number) : null;
  const pmOtherEffortPersonWeeks = typeof resources["pmOtherEffortPersonWeeks"] === "number" && Number.isFinite(resources["pmOtherEffortPersonWeeks"]) ? (resources["pmOtherEffortPersonWeeks"] as number) : null;
  const fullyLoadedCostRateIdrPerPersonWeek =
    typeof resources["fullyLoadedCostRateIdrPerPersonWeek"] === "number" && Number.isFinite(resources["fullyLoadedCostRateIdrPerPersonWeek"])
      ? (resources["fullyLoadedCostRateIdrPerPersonWeek"] as number)
      : null;
  value["resources"] = {
    engEffortPersonWeeks,
    designEffortPersonWeeks,
    pmOtherEffortPersonWeeks,
    fullyLoadedCostRateIdrPerPersonWeek,
  };
  const recs = value["recommendations"];
  if (Array.isArray(recs)) {
    for (const r of recs) {
      if (!isRecord(r)) continue;
      if (typeof r["selected"] !== "boolean") r["selected"] = false;
      if (typeof r["recommended"] !== "boolean") r["recommended"] = false;
      if (typeof r["rationale"] !== "string") r["rationale"] = "";
      if (typeof r["rank"] !== "number") r["rank"] = 0;
      if (typeof r["metricId"] !== "string") r["metricId"] = "";
    }
  }
  return value as LocalBrief;
}

export function listDrafts(): DraftSummary[] {
  if (typeof window === "undefined") return [];
  migrateLegacyIfNeeded();
  const ids = readIndex();
  const summaries: DraftSummary[] = [];
  for (const id of ids) {
    const raw = window.localStorage.getItem(itemKey(id));
    if (!raw) continue;
    try {
      const draft = normalizeDraft(JSON.parse(raw)) || null;
      if (!draft) continue;
      summaries.push({
        id: draft.id,
        title: draft.initiative.title || "(Untitled)",
        templateType: draft.initiative.templateType,
        updatedAt: draft.initiative.updatedAt,
        step: draft.step,
      });
    } catch {
      continue;
    }
  }
  summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return summaries;
}

export function loadDraft(id: string): LocalBrief | null {
  if (typeof window === "undefined") return null;
  migrateLegacyIfNeeded();
  const raw = window.localStorage.getItem(itemKey(id));
  if (!raw) return null;
  try {
    return normalizeDraft(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function createDraft(): LocalBrief {
  const draft = createNewDraft();
  saveDraft(draft);
  return draft;
}

export function saveDraft(draft: LocalBrief) {
  if (typeof window === "undefined") return;
  migrateLegacyIfNeeded();
  window.localStorage.setItem(itemKey(draft.id), JSON.stringify(draft));
  const ids = readIndex();
  const next = [draft.id, ...ids.filter((x) => x !== draft.id)];
  writeIndex(next);
}

export function deleteDraft(id: string) {
  if (typeof window === "undefined") return;
  migrateLegacyIfNeeded();
  window.localStorage.removeItem(itemKey(id));
  const ids = readIndex();
  writeIndex(ids.filter((x) => x !== id));
}

export function updateInitiative(draft: LocalBrief, patch: Partial<Initiative>): LocalBrief {
  const now = new Date().toISOString();
  const initiative = { ...draft.initiative, ...patch, updatedAt: now };

  let recommendations: MetricRecommendation[] = draft.recommendations;
  let assumptions: Assumption[] = draft.assumptions;

  if (patch.templateType && patch.templateType !== draft.initiative.templateType) {
    const base = METRICS.map((m, idx) => ({
      metricId: m.id,
      rank: idx + 1,
      rationale: "",
      selected: false,
      recommended: false,
    }));
    recommendations = applyRecommendedFromTemplate(base, patch.templateType, initiative.goal);
    assumptions = defaultAssumptions(patch.templateType);
  }

  return { ...draft, initiative, recommendations, assumptions };
}

function applyRecommendedFromTemplate(all: MetricRecommendation[], templateType: TemplateType, goal: string): MetricRecommendation[] {
  const { recommendations: templateRecs } = recommendMetrics({ templateType, goal });
  const recommendedOrder = templateRecs.map((r) => r.metricId);
  const recommendedSet = new Set(recommendedOrder);
  const rankById = new Map(recommendedOrder.map((id, idx) => [id, idx + 1]));
  const rationaleById = new Map(templateRecs.map((r) => [r.metricId, r.rationale]));

  const recommended = all
    .filter((r) => recommendedSet.has(r.metricId))
    .map((r) => ({
      ...r,
      rank: rankById.get(r.metricId) || r.rank,
      rationale: rationaleById.get(r.metricId) || r.rationale,
      selected: false,
      recommended: true,
    }))
    .sort((a, b) => a.rank - b.rank);

  const others = all
    .filter((r) => !recommendedSet.has(r.metricId))
    .map((r, idx) => ({
      ...r,
      rank: recommended.length + idx + 1,
      rationale: r.rationale || "",
      selected: false,
      recommended: false,
    }));

  return [...recommended, ...others];
}

export function setRecommendations(
  draft: LocalBrief,
  recommendations: MetricRecommendation[],
  baselines: Baseline[],
  benchmarks: BenchmarkSource[],
): LocalBrief {
  const selectedMetricIds = new Set(recommendations.filter((r) => r.selected).map((r) => r.metricId));
  const nextBaselines = baselines.filter((b) => selectedMetricIds.has(b.metricId));
  const nextBenchmarks = benchmarks.map((s) => ({
    ...s,
    metricIds: s.metricIds.filter((id) => selectedMetricIds.has(id)),
  }));

  return { ...draft, recommendations, baselines: nextBaselines, benchmarks: nextBenchmarks };
}

export function validateStep(draft: LocalBrief): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  if (draft.step === "intake") {
    if (!draft.initiative.title.trim()) errors.push("Title wajib diisi.");
    if (!draft.initiative.goal.trim()) errors.push("Goal wajib diisi.");
  }

  if (draft.step === "metrics") {
  }

  if (draft.step === "baselines") {
    const r = draft.resources;
    if (r.engEffortPersonWeeks === null || !Number.isFinite(r.engEffortPersonWeeks) || r.engEffortPersonWeeks < 0) {
      errors.push("Resource: Eng effort wajib diisi (>= 0).");
    }
    if (r.designEffortPersonWeeks === null || !Number.isFinite(r.designEffortPersonWeeks) || r.designEffortPersonWeeks < 0) {
      errors.push("Resource: Design effort wajib diisi (>= 0).");
    }
    if (r.pmOtherEffortPersonWeeks === null || !Number.isFinite(r.pmOtherEffortPersonWeeks) || r.pmOtherEffortPersonWeeks < 0) {
      errors.push("Resource: PM/Other effort wajib diisi (>= 0).");
    }
    if (
      r.fullyLoadedCostRateIdrPerPersonWeek === null ||
      !Number.isFinite(r.fullyLoadedCostRateIdrPerPersonWeek) ||
      r.fullyLoadedCostRateIdrPerPersonWeek <= 0
    ) {
      errors.push("Resource: Fully-loaded cost rate wajib diisi (> 0).");
    }

    const selectedMetricIds = draft.recommendations.filter((r) => r.selected).map((r) => r.metricId);
    for (const metricId of selectedMetricIds) {
      const label = getMetric(metricId)?.name || metricId;
      const b = draft.baselines.find((x) => x.metricId === metricId);
      if (!b) continue; // baseline auto-created di UI; kalau belum ada, dianggap unknown.

      if (b.provenance !== "Unknown") {
        if (b.value === null || !Number.isFinite(b.value)) {
          errors.push(`Baseline ${label}: value wajib diisi (atau pilih provenance=Unknown).`);
          continue;
        }
        if (b.value < 0) errors.push(`Baseline ${label}: value tidak boleh negatif.`);
        if (b.unit.trim() === "%") {
          if (b.value < 0 || b.value > 100) errors.push(`Baseline ${label}: untuk unit % harus 0–100.`);
        }
        if (!b.window.trim()) errors.push(`Baseline ${label}: window wajib diisi.`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

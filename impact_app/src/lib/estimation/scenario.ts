import type { ImpactBrief, Scenario, ScenarioName } from "../domain/types";

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function getAssumptionNumber(brief: ImpactBrief, key: string): number | null {
  return num(brief.assumptions.find((a) => a.key === key)?.value);
}

function getAssumptionString(brief: ImpactBrief, key: string): string {
  return String(brief.assumptions.find((a) => a.key === key)?.value ?? "");
}

function relevanceToWeight(r: "High" | "Medium" | "Low") {
  if (r === "High") return 1;
  if (r === "Medium") return 0.7;
  return 0.4;
}

function pickSupportingBenchmarkIds(brief: ImpactBrief, metricId: string) {
  return brief.benchmarks
    .filter((b) => b.metricIds.includes(metricId))
    .sort((a, b) => relevanceToWeight(b.relevance) - relevanceToWeight(a.relevance))
    .slice(0, 2)
    .map((b) => b.id);
}

function baselineFor(brief: ImpactBrief, metricId: string) {
  return brief.baselines.find((b) => b.metricId === metricId) || null;
}

function upliftKey(name: ScenarioName) {
  if (name === "best") return "uplift_pct_best";
  if (name === "worst") return "uplift_pct_worst";
  return "uplift_pct_base";
}

function computeAssumedValue(metricId: string, baselineValue: number, upliftPct: number, unit: string) {
  if (unit === "%") {
    if (metricId === "abandonment_rate") return Math.max(0, baselineValue - upliftPct);
    return Math.min(100, baselineValue + upliftPct);
  }

  if (metricId === "time_on_task") {
    const next = baselineValue * (1 - upliftPct / 100);
    return Math.max(0, next);
  }

  if (metricId === "support_tickets" || metricId === "incident_count" || metricId === "mttr" || metricId === "defect_escape_rate") {
    const next = baselineValue * (1 - upliftPct / 100);
    return Math.max(0, next);
  }

  return baselineValue;
}

function unitDefault(metricId: string) {
  if (metricId.endsWith("_rate") || metricId.includes("retention") || metricId.includes("pct") || metricId.includes("dau_wau")) return "%";
  if (metricId === "time_on_task") return "seconds";
  return "count";
}

function totalEffortPersonWeeks(brief: ImpactBrief) {
  return [brief.resources.engEffortPersonWeeks, brief.resources.designEffortPersonWeeks, brief.resources.pmOtherEffortPersonWeeks].reduce<number>(
    (acc, v) => (typeof v === "number" && Number.isFinite(v) ? acc + v : acc),
    0,
  );
}

export function computeScenarios(brief: ImpactBrief): Scenario[] {
  const selectedMetricIds = brief.recommendations.filter((r) => r.selected).map((r) => r.metricId);
  const volume = getAssumptionNumber(brief, "volume_per_month");

  const names: ScenarioName[] = ["worst", "base", "best"];

  return names.map((name) => {
    const upliftPct = getAssumptionNumber(brief, upliftKey(name)) ?? 0;

    const metricDeltas = selectedMetricIds.map((metricId) => {
      const b = baselineFor(brief, metricId);
      const baselineValue = b?.value ?? null;
      const unit = b?.unit || unitDefault(metricId);
      const benchmarkIds = pickSupportingBenchmarkIds(brief, metricId);

      if (baselineValue === null) {
        return {
          metricId,
          baselineValue: null,
          assumedValue: null,
          delta: null,
          unit,
          drivers: { assumptionKeys: [upliftKey(name)], benchmarkIds },
        };
      }

      const assumed = computeAssumedValue(metricId, baselineValue, upliftPct, unit);
      const delta = assumed - baselineValue;

      return {
        metricId,
        baselineValue,
        assumedValue: assumed,
        delta,
        unit,
        drivers: { baselineMetricId: metricId, assumptionKeys: [upliftKey(name)], benchmarkIds },
      };
    });

    const rollups: Scenario["rollups"] = {};

    const conversionsDelta = metricDeltas.find((d) => d.metricId === "conversion_rate");
    if (conversionsDelta && volume !== null && conversionsDelta.unit === "%" && conversionsDelta.delta !== null) {
      const incremental = Math.round((volume * conversionsDelta.delta) / 100);
      rollups.revenue = incremental;
    }

    const maintenanceDelta = metricDeltas.find((d) => d.metricId === "maintenance_time_pct");
    if (maintenanceDelta && maintenanceDelta.unit === "%" && maintenanceDelta.baselineValue !== null) {
      const teamSize = getAssumptionNumber(brief, "team_size");
      const hoursPerWeek = getAssumptionNumber(brief, "hours_per_engineer_week");
      const afterPct = getAssumptionNumber(
        brief,
        name === "best" ? "maintenance_pct_after_best" : name === "worst" ? "maintenance_pct_after_worst" : "maintenance_pct_after_base",
      );
      if (teamSize !== null && hoursPerWeek !== null && afterPct !== null) {
        const baselinePct = maintenanceDelta.baselineValue;
        const hoursSavedMonth = Math.round(((teamSize * hoursPerWeek * 4) * (baselinePct - afterPct)) / 100);
        rollups.cost = hoursSavedMonth;
      }
    }

    if (typeof rollups.cost !== "number") {
      const totalEffort = totalEffortPersonWeeks(brief);
      const rate = brief.resources.fullyLoadedCostRateIdrPerPersonWeek;
      if (totalEffort > 0 && typeof rate === "number" && Number.isFinite(rate) && rate > 0) {
        rollups.cost = Math.round(totalEffort * rate);
      }
    }

    const incidentsDelta = metricDeltas.find((d) => d.metricId === "incident_count");
    if (incidentsDelta && incidentsDelta.delta !== null && incidentsDelta.baselineValue !== null) {
      rollups.risk = Math.round(Math.abs(incidentsDelta.delta));
    }

    const notesParts: string[] = [];
    const complexity = getAssumptionString(brief, "execution_complexity");
    if (complexity) notesParts.push(`execution_complexity=${complexity}`);
    if (volume !== null) notesParts.push(`volume_per_month=${volume}`);

    return {
      name,
      metricDeltas,
      rollups,
      notes: notesParts.join("; "),
    };
  });
}

export function scenarioSummary(brief: ImpactBrief, scenarios: Scenario[]) {
  const base = scenarios.find((s) => s.name === "base");
  if (!base) return "";
  const volume = getAssumptionNumber(brief, "volume_per_month");
  const conversionsDelta = base.metricDeltas.find((d) => d.metricId === "conversion_rate");
  if (volume !== null && conversionsDelta?.unit === "%" && conversionsDelta.delta !== null) {
    const inc = Math.round((volume * conversionsDelta.delta) / 100);
    return `Estimasi incremental completions/month (base): ${inc}`;
  }
  return "Estimasi base tersedia (lihat per-metrik).";
}

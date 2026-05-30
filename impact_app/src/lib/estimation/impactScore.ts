import type { ImpactBrief, ImpactScore, ImpactScoreValue, Scenario } from "../domain/types";

const ORDER: ImpactScoreValue[] = [0.25, 0.5, 1, 2, 3];

function clampImpact(v: number): ImpactScoreValue {
  if (v <= 0.25) return 0.25;
  if (v <= 0.5) return 0.5;
  if (v <= 1) return 1;
  if (v <= 2) return 2;
  return 3;
}

function shift(value: ImpactScoreValue, delta: number): ImpactScoreValue {
  const idx = ORDER.indexOf(value);
  const next = Math.min(ORDER.length - 1, Math.max(0, idx + delta));
  return ORDER[next];
}

function getMetricDelta(scenario: Scenario | undefined, metricId: string) {
  return scenario?.metricDeltas.find((d) => d.metricId === metricId) || null;
}

export function computeImpactScore(brief: ImpactBrief, scenarios: Scenario[], confidenceScore: number): ImpactScore {
  const base = scenarios.find((s) => s.name === "base");
  const best = scenarios.find((s) => s.name === "best");
  const worst = scenarios.find((s) => s.name === "worst");

  const reasons: string[] = [];
  const assumptions: string[] = [];
  const supportingBenchmarkIds = Array.from(new Set(brief.benchmarks.map((b) => b.id))).slice(0, 5);

  let raw = 0.5;

  const revenueInc = base?.rollups.revenue;
  if (typeof revenueInc === "number") {
    reasons.push(`Ada proyeksi incremental completions/month: ${revenueInc}.`);
    if (revenueInc >= 5000) raw = 3;
    else if (revenueInc >= 2000) raw = 2;
    else if (revenueInc >= 500) raw = 1;
    else if (revenueInc >= 100) raw = 0.5;
    else raw = 0.25;
  } else {
    const convBase = getMetricDelta(base, "conversion_rate");
    if (convBase?.delta !== null && convBase?.unit === "%") {
      reasons.push(`Delta conversion (base): ${convBase.delta.toFixed(2)} pp.`);
      const abs = Math.abs(convBase.delta);
      if (abs >= 2) raw = 2;
      else if (abs >= 1) raw = 1;
      else if (abs >= 0.5) raw = 0.5;
      else raw = 0.25;
    } else {
      const selectedCount = brief.recommendations.filter((r) => r.selected).length;
      reasons.push(`Menggunakan proxy rubric (metric set size = ${selectedCount}).`);
      raw = selectedCount >= 6 ? 1 : 0.5;
    }
  }

  const uplift = brief.assumptions.find((a) => a.key === "uplift_pct_base");
  if (uplift) assumptions.push(`${uplift.key}=${uplift.value}${uplift.unit || ""}`);
  const volume = brief.assumptions.find((a) => a.key === "volume_per_month");
  if (volume) assumptions.push(`${volume.key}=${volume.value}${volume.unit ? ` ${volume.unit}` : ""}`);

  if (best && worst) {
    const convBest = getMetricDelta(best, "conversion_rate");
    const convWorst = getMetricDelta(worst, "conversion_rate");
    if (convBest && convWorst && convBest.delta !== null && convWorst.delta !== null && convBest.unit === "%" && convWorst.unit === "%") {
      reasons.push(`Range (worst→best) conversion: ${convWorst.delta.toFixed(2)}→${convBest.delta.toFixed(2)} pp.`);
    }
  }

  let value = clampImpact(raw);

  if (confidenceScore < 35) {
    value = shift(value, -2);
    reasons.push("Confidence rendah menurunkan ImpactScore.");
  } else if (confidenceScore < 55) {
    value = shift(value, -1);
    reasons.push("Confidence sedang menurunkan ImpactScore sedikit.");
  } else if (confidenceScore >= 80) {
    value = shift(value, 1);
    reasons.push("Confidence tinggi menaikkan ImpactScore sedikit.");
  }

  return {
    value,
    why: reasons,
    keyAssumptions: assumptions,
    supportingBenchmarkIds,
  };
}

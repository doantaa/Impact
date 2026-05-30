import type { BenchmarkSource, ConfidenceScore, ImpactBrief } from "../domain/types";

function clamp01(v: number) {
  if (Number.isNaN(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

function relevanceToScore(relevance: BenchmarkSource["relevance"]) {
  if (relevance === "High") return 1;
  if (relevance === "Medium") return 0.7;
  return 0.4;
}

export function computeConfidence(
  brief: Pick<ImpactBrief, "recommendations" | "baselines" | "benchmarks" | "assumptions" | "resources">,
): ConfidenceScore {
  const selectedMetricIds = brief.recommendations.filter((r) => r.selected).map((r) => r.metricId);

  const baselinesProvided = selectedMetricIds.filter((metricId) => {
    const b = brief.baselines.find((x) => x.metricId === metricId);
    return Boolean(b && b.value !== null && Number.isFinite(b.value));
  }).length;
  const baselineCompleteness = selectedMetricIds.length === 0 ? 0 : baselinesProvided / selectedMetricIds.length;

  const attachedBenchmarks = brief.benchmarks.filter((b) => b.metricIds.some((id) => selectedMetricIds.includes(id)));
  const benchmarkQuality =
    attachedBenchmarks.length === 0
      ? 0.2
      : attachedBenchmarks.reduce((acc, b) => acc + relevanceToScore(b.relevance), 0) / attachedBenchmarks.length;

  const effort = [brief.resources.engEffortPersonWeeks, brief.resources.designEffortPersonWeeks, brief.resources.pmOtherEffortPersonWeeks].reduce<number>(
    (acc, v) => (typeof v === "number" && Number.isFinite(v) ? acc + v : acc),
    0,
  );
  const executionComplexity =
    effort > 0 ? (effort <= 2 ? 1 : effort <= 6 ? 0.7 : 0.4) : (() => {
      const complexity = String(brief.assumptions.find((a) => a.key === "execution_complexity")?.value || "medium");
      return complexity === "low" ? 1 : complexity === "high" ? 0.4 : 0.7;
    })();

  const windowsDefined = brief.baselines.filter((b) => selectedMetricIds.includes(b.metricId)).filter((b) => b.window.trim().length > 0)
    .length;
  const measurementPlanQuality = selectedMetricIds.length === 0 ? 0 : windowsDefined / selectedMetricIds.length;

  const score01 =
    0.35 * clamp01(baselineCompleteness) +
    0.35 * clamp01(benchmarkQuality) +
    0.15 * clamp01(executionComplexity) +
    0.15 * clamp01(measurementPlanQuality);

  return {
    score: Math.round(100 * clamp01(score01)),
    drivers: {
      baselineCompleteness: clamp01(baselineCompleteness),
      benchmarkQuality: clamp01(benchmarkQuality),
      executionComplexity: clamp01(executionComplexity),
      measurementPlanQuality: clamp01(measurementPlanQuality),
    },
  };
}

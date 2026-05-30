import { describe, expect, it } from "vitest";
import { computeConfidence } from "@/lib/estimation/confidence";
import type { ImpactBrief } from "@/lib/domain/types";

function baseBrief(): Pick<ImpactBrief, "recommendations" | "baselines" | "benchmarks" | "assumptions" | "resources"> {
  return {
    recommendations: [
      { metricId: "conversion_rate", rank: 1, rationale: "", selected: true, recommended: true },
      { metricId: "retention_d30", rank: 2, rationale: "", selected: true, recommended: true },
      { metricId: "support_tickets", rank: 3, rationale: "", selected: true, recommended: true },
      { metricId: "feature_adoption_rate", rank: 4, rationale: "", selected: true, recommended: true },
    ],
    baselines: [
      { metricId: "conversion_rate", value: 10, unit: "%", window: "last 30 days", provenance: "Observed", note: "" },
      { metricId: "retention_d30", value: 20, unit: "%", window: "last 30 days", provenance: "Estimated", note: "" },
    ],
    benchmarks: [
      {
        id: "src_1",
        url: "https://example.com",
        title: "Example benchmark",
        excerpt: "Benchmark excerpt",
        metricIds: ["conversion_rate"],
        relevance: "High",
        relevanceRationale: "Relevant",
      },
    ],
    resources: {
      engEffortPersonWeeks: null,
      designEffortPersonWeeks: null,
      pmOtherEffortPersonWeeks: null,
      fullyLoadedCostRateIdrPerPersonWeek: null,
    },
    assumptions: [
      { key: "execution_complexity", value: "medium", unit: "level", rationale: "", provenance: "Default" },
    ],
  };
}

describe("computeConfidence", () => {
  it("menggabungkan completeness + benchmark + complexity + measurement", () => {
    const score = computeConfidence(baseBrief());
    expect(score.drivers.baselineCompleteness).toBeCloseTo(0.5, 5);
    expect(score.drivers.benchmarkQuality).toBeCloseTo(1, 5);
    expect(score.drivers.executionComplexity).toBeCloseTo(0.7, 5);
    expect(score.drivers.measurementPlanQuality).toBeCloseTo(0.5, 5);
    expect(score.score).toBe(70);
  });
});

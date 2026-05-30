import { describe, expect, it } from "vitest";
import type { TemplateType } from "@/lib/domain/types";
import { getMetric } from "@/lib/metrics/catalog";
import { recommendMetrics } from "@/lib/metrics/recommender";

const TEMPLATES: TemplateType[] = [
  "new_feature",
  "ui_revamp",
  "tech_debt",
  "bug_fix",
  "compliance",
  "accessibility",
  "gamification",
  "misc",
];

describe("recommendMetrics", () => {
  it("menghasilkan rekomendasi metrik untuk setiap template", () => {
    for (const templateType of TEMPLATES) {
      const { recommendations } = recommendMetrics({ templateType, goal: "test" });
      expect(recommendations.length).toBeGreaterThanOrEqual(3);
      for (const r of recommendations) {
        expect(getMetric(r.metricId)).toBeTruthy();
        expect(r.rank).toBeGreaterThan(0);
        expect(r.recommended).toBe(true);
      }
    }
  });
});

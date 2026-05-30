import { describe, expect, it } from "vitest";
import { generateBriefMarkdown } from "@/lib/brief/markdown";
import type { ImpactBrief } from "@/lib/domain/types";

describe("generateBriefMarkdown", () => {
  it("menghasilkan markdown dengan section utama + escape sederhana", () => {
    const brief: ImpactBrief = {
      id: "brief_1",
      version: 1,
      generatedAt: "2026-01-01T00:00:00.000Z",
      initiative: {
        id: "init_1",
        title: "Improve <Conversion>",
        goal: "Naikkan conversion 1pp",
        templateType: "new_feature",
        productType: "B2C",
        targetUsers: "customer",
        timeline: "2 weeks",
        releaseApproach: "staged",
        owner: "PM",
        stakeholders: "PM, Eng",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      narrativeMarkdown: "Ringkas: target <1pp> uplift.",
    recommendations: [
      { metricId: "conversion_rate", rank: 1, rationale: "", selected: true, recommended: true },
      { metricId: "feature_adoption_rate", rank: 2, rationale: "", selected: true, recommended: true },
      { metricId: "support_tickets", rank: 3, rationale: "", selected: true, recommended: true },
    ],
      resources: {
        engEffortPersonWeeks: null,
        designEffortPersonWeeks: null,
        pmOtherEffortPersonWeeks: null,
        fullyLoadedCostRateIdrPerPersonWeek: null,
      },
      baselines: [
        { metricId: "conversion_rate", value: 10, unit: "%", window: "last 30 days", provenance: "Observed", note: "" },
        { metricId: "feature_adoption_rate", value: 20, unit: "%", window: "last 30 days", provenance: "Estimated", note: "mixpanel" },
        { metricId: "support_tickets", value: 100, unit: "count", window: "last 30 days", provenance: "Observed", note: "" },
      ],
      benchmarks: [
        {
          id: "src_1",
          url: "https://example.com/bench",
          title: "Example Bench",
          publisher: "Example",
          date: "2025",
          excerpt: "Typical conversion rate 2–5%.",
          metricIds: ["conversion_rate"],
          relevance: "Medium",
          relevanceRationale: "Comparable product type.",
        },
      ],
      assumptions: [
        { key: "uplift_pct_base", value: 1, unit: "%", rationale: "Base uplift", provenance: "User" },
        { key: "volume_per_month", value: 10000, unit: "users", rationale: "Volume", provenance: "User" },
        { key: "execution_complexity", value: "medium", unit: "level", rationale: "Complexity", provenance: "User" },
      ],
      scenarios: [
        {
          name: "base",
          metricDeltas: [
            {
              metricId: "conversion_rate",
              baselineValue: 10,
              assumedValue: 11,
              delta: 1,
              unit: "%",
              drivers: { baselineMetricId: "conversion_rate", assumptionKeys: ["uplift_pct_base"], benchmarkIds: ["src_1"] },
            },
          ],
          rollups: { revenue: 100 },
          notes: "execution_complexity=medium; volume_per_month=10000",
        },
      ],
      confidence: {
        score: 70,
        drivers: { baselineCompleteness: 1, benchmarkQuality: 0.7, executionComplexity: 0.7, measurementPlanQuality: 1 },
      },
      impactScore: {
        value: 1,
        why: ["Delta conversion (base): 1.00 pp."],
        keyAssumptions: ["uplift_pct_base=1%"],
        supportingBenchmarkIds: ["src_1"],
      },
    };

    const md = generateBriefMarkdown(brief);
    expect(md).toContain("# Impact Brief — Improve Conversion");
    expect(md).toContain("## Metrics");
    expect(md).toContain("## Benchmarks (Citations)");
    expect(md).toMatchInlineSnapshot(`
      "# Impact Brief — Improve Conversion

      Goal: Naikkan conversion 1pp

      Template: new_feature
      Product: B2C
      Target users: customer
      Timeline: 2 weeks
      Release approach: staged
      Owner: PM
      Stakeholders: PM, Eng

      ## Summary

      Ringkas: target 1pp uplift.

      ## Metrics

      - Conversion rate (flow) (lagging, revenue)
        - Definition: Persentase user yang menyelesaikan step kunci dalam funnel/flow.
        - Formula: completions / entrants
        - Data required: Flow entrants; Flow completions
      - Feature adoption rate (leading, strategic)
        - Definition: Persentase user yang menggunakan fitur dalam window tertentu.
        - Formula: users_used_feature / eligible_users
        - Data required: Eligible users; Users who used the feature
      - Support tickets (volume) (lagging, cost)
        - Definition: Jumlah tiket support terkait flow/masalah per window.
        - Data required: Ticket count tagged to topic/flow

      ## Resources

      - Eng effort: unknown person-weeks
      - Design effort: unknown person-weeks
      - PM/Other effort: unknown person-weeks
      - Fully-loaded cost rate: unknown
      - Total effort: unknown

      ## Baselines

      - Conversion rate (flow): 10 % (last 30 days; Observed)
      - Feature adoption rate: 20 % (last 30 days; Estimated)
        - Note: mixpanel
      - Support tickets (volume): 100 count (last 30 days; Observed)

      ## Benchmarks (Citations)

      - [Example Bench](https://example.com/bench)
        - Example — 2025
        - Relevance: Medium — Comparable product type.
        - Excerpt: Typical conversion rate 2–5%.

      ## Scenarios

      ### Base
      - Conversion rate (flow): 10 % → 11 % (+1 %)
      - Rollups: revenue: 100

      ## ImpactScore (RICE-like)

      ImpactScore: 1
      - Delta conversion (base): 1.00 pp.
      "
    `);
  });
});

import type { MetricRecommendation, TemplateType } from "../domain/types";
import { getMetric } from "./catalog";

const TEMPLATE_DEFAULTS: Record<TemplateType, { metricIds: string[]; rationale: string[] }> = {
  new_feature: {
    metricIds: [
      "feature_adoption_rate",
      "activation_rate",
      "retention_d30",
      "conversion_rate",
      "support_tickets",
    ],
    rationale: [
      "Fitur baru biasanya dinilai lewat adopsi dan aktivasi (leading).",
      "Retention dan conversion membantu melihat dampak bisnis (lagging).",
      "Support tickets bisa menjadi proxy cost/operational load.",
    ],
  },
  ui_revamp: {
    metricIds: [
      "task_success_rate",
      "time_on_task",
      "abandonment_rate",
      "conversion_rate",
      "support_tickets",
    ],
    rationale: [
      "UI revamp paling cepat terlihat pada task success, time-on-task, dan abandonment (leading).",
      "Conversion rate dan support volume mengaitkan UX ke outcome bisnis/cost (lagging).",
    ],
  },
  tech_debt: {
    metricIds: [
      "maintenance_time_pct",
      "lead_time_changes",
      "incident_count",
      "mttr",
      "defect_escape_rate",
    ],
    rationale: [
      "Tech debt biasanya berdampak ke cost (maintenance time, lead time) dan risk (incidents, MTTR).",
    ],
  },
  bug_fix: {
    metricIds: ["incident_count", "support_tickets", "mttr", "defect_escape_rate", "conversion_rate"],
    rationale: [
      "Bug fix berfokus pada risk (incidents/MTTR) dan customer pain (tickets).",
      "Jika bug berada di flow bisnis, conversion bisa jadi indikator lagging.",
    ],
  },
  compliance: {
    metricIds: ["compliance_gap_count", "audit_readiness", "incident_count"],
    rationale: [
      "Compliance menekankan risk posture dan kesiapan audit; incident bisa jadi proxy consequence.",
    ],
  },
  accessibility: {
    metricIds: ["wcag_issues_sev", "task_success_rate", "abandonment_rate", "conversion_rate"],
    rationale: [
      "Accessibility diukur via issue severity dan dampaknya ke task completion/abandonment.",
      "Jika flow terkait bisnis, conversion membantu narasi dampak.",
    ],
  },
  gamification: {
    metricIds: ["engagement_dau_wau", "feature_adoption_rate", "retention_proxy"],
    rationale: ["Gamification biasanya menargetkan engagement dan retention proxy."],
  },
  misc: {
    metricIds: ["task_success_rate", "conversion_rate", "support_tickets", "incident_count"],
    rationale: ["Template umum: kombinasi experience + revenue + cost/risk proxy."],
  },
};

export type RecommendInput = {
  templateType: TemplateType;
  goal: string;
};

export function recommendMetrics(input: RecommendInput): {
  recommendations: MetricRecommendation[];
  why: string[];
} {
  const defaults = TEMPLATE_DEFAULTS[input.templateType];

  const recommendations: MetricRecommendation[] = [];

  for (const [idx, metricId] of defaults.metricIds.entries()) {
    const metric = getMetric(metricId);
    if (!metric) continue;
    recommendations.push({
      metricId: metric.id,
      rank: idx + 1,
      rationale: metric.definition,
      selected: false,
      recommended: true,
    });
  }

  return {
    recommendations,
    why: defaults.rationale,
  };
}

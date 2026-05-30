import type { TemplateType } from "./types";

export type TemplateDefinition = {
  type: TemplateType;
  label: string;
  description: string;
  intakeHints: string[];
};

export const TEMPLATES: TemplateDefinition[] = [
  {
    type: "new_feature",
    label: "New core feature launch",
    description: "Growth/retention impact dari fitur inti baru.",
    intakeHints: ["Target segment", "Primary outcome", "Rollout plan"],
  },
  {
    type: "ui_revamp",
    label: "UI improvements / revamps",
    description: "Task success, conversion efficiency, dan pengurangan support burden.",
    intakeHints: ["Target flow/page", "User pain type", "Expected UX change"],
  },
  {
    type: "tech_debt",
    label: "Tech debt / refactor / optimization",
    description: "Reclaim engineering time, reduce incidents, increase delivery speed.",
    intakeHints: ["Area", "Primary pain", "Team size", "Maintenance time (optional)"],
  },
  {
    type: "bug_fix",
    label: "Bug fixes",
    description: "Reduce customer pain & incident cost; stabilize core journeys.",
    intakeHints: ["Severity", "Affected users", "Frequency"],
  },
  {
    type: "compliance",
    label: "Compliance initiatives",
    description: "Avoid fines/legal exposure dan menjaga market access/enterprise deals.",
    intakeHints: ["Domain", "Deadline", "Gap status"],
  },
  {
    type: "accessibility",
    label: "Accessibility",
    description: "Risk reduction + experience improvement (WCAG & task completion).",
    intakeHints: ["Surface", "Affected flows", "Severity", "Region (optional)"],
  },
  {
    type: "gamification",
    label: "Gamification / engagement",
    description: "Engagement/retention uplift lewat mekanisme gamification.",
    intakeHints: ["Primary engagement behavior", "Target cohort"],
  },
  {
    type: "misc",
    label: "Misc / other",
    description: "Inisiatif lain yang tidak masuk template standar.",
    intakeHints: ["Apa yang berubah?", "Untuk siapa?", "Kenapa sekarang?"],
  },
];

export function getTemplate(type: TemplateType) {
  return TEMPLATES.find((t) => t.type === type);
}


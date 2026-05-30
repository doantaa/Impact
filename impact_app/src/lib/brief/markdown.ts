import type { ImpactBrief } from "../domain/types";
import { getMetric } from "../metrics/catalog";

function mdEscape(s: string) {
  return s.replace(/[<>]/g, "");
}

function capitalizeWord(s: string) {
  if (!s) return s;
  return s.slice(0, 1).toUpperCase() + s.slice(1);
}

function section(title: string) {
  return `\n## ${title}\n`;
}

function fmtNumber(v: number) {
  if (!Number.isFinite(v)) return "";
  if (Math.abs(v - Math.round(v)) < 1e-9) return String(Math.round(v));
  return String(v);
}

export function generateBriefMarkdown(brief: ImpactBrief): string {
  const lines: string[] = [];
  lines.push(`# Impact Brief — ${mdEscape(brief.initiative.title || "Untitled")}`);
  lines.push("");
  lines.push(`Goal: ${mdEscape(brief.initiative.goal || "")}`);
  lines.push("");
  lines.push(`Template: ${brief.initiative.templateType}`);
  lines.push(`Product: ${mdEscape(brief.initiative.productType || "unknown")}`);
  lines.push(`Target users: ${brief.initiative.targetUsers}`);
  lines.push(`Timeline: ${mdEscape(brief.initiative.timeline || "unknown")}`);
  lines.push(`Release approach: ${brief.initiative.releaseApproach}`);
  lines.push(`Owner: ${mdEscape(brief.initiative.owner || "unknown")}`);
  lines.push(`Stakeholders: ${mdEscape(brief.initiative.stakeholders || "unknown")}`);

  lines.push(section("Summary"));
  lines.push(mdEscape(brief.narrativeMarkdown || ""));

  lines.push(section("Metrics"));
  const selected = brief.recommendations.filter((r) => r.selected);
  if (selected.length === 0) lines.push("- (no metrics selected)");
  for (const r of selected) {
    const m = getMetric(r.metricId);
    if (!m) continue;
    lines.push(`- ${m.name} (${m.type}, ${m.category})`);
    lines.push(`  - Definition: ${mdEscape(m.definition)}`);
    if (m.formula) lines.push(`  - Formula: ${mdEscape(m.formula)}`);
    if (m.dataRequirements.length > 0) lines.push(`  - Data required: ${mdEscape(m.dataRequirements.join("; "))}`);
  }

  const eng = brief.resources.engEffortPersonWeeks;
  const design = brief.resources.designEffortPersonWeeks;
  const pmOther = brief.resources.pmOtherEffortPersonWeeks;
  const rate = brief.resources.fullyLoadedCostRateIdrPerPersonWeek;
  const effortValues = [eng, design, pmOther];
  const effortKnown = effortValues.every((v) => typeof v === "number" && Number.isFinite(v));
  const totalEffort = effortKnown ? (effortValues as number[]).reduce((acc, v) => acc + v, 0) : null;
  const estimatedCost =
    totalEffort !== null && typeof rate === "number" && Number.isFinite(rate) && rate > 0 ? Math.round(totalEffort * rate) : null;

  lines.push(section("Resources"));
  lines.push(`- Eng effort: ${eng === null ? "unknown" : fmtNumber(eng)} person-weeks`);
  lines.push(`- Design effort: ${design === null ? "unknown" : fmtNumber(design)} person-weeks`);
  lines.push(`- PM/Other effort: ${pmOther === null ? "unknown" : fmtNumber(pmOther)} person-weeks`);
  lines.push(`- Fully-loaded cost rate: ${rate === null ? "unknown" : `IDR ${fmtNumber(rate)} / person-week`}`);
  lines.push(`- Total effort: ${totalEffort === null ? "unknown" : `${fmtNumber(totalEffort)} person-weeks`}`);
  if (estimatedCost !== null) lines.push(`- Estimated cost: IDR ${fmtNumber(estimatedCost)}`);

  lines.push(section("Baselines"));
  const baselineSelected = brief.baselines.filter((b) => selected.some((s) => s.metricId === b.metricId));
  if (baselineSelected.length === 0) lines.push("- (no baselines)");
  for (const b of baselineSelected) {
    const m = getMetric(b.metricId);
    const label = m ? m.name : b.metricId;
    const val = b.value === null ? "unknown" : `${b.value} ${b.unit}`;
    lines.push(`- ${label}: ${val} (${mdEscape(b.window)}; ${b.provenance})`);
    if (b.note.trim()) lines.push(`  - Note: ${mdEscape(b.note.trim())}`);
  }

  lines.push(section("Benchmarks (Citations)"));
  if (brief.benchmarks.length === 0) {
    lines.push("- (no benchmark sources)");
  } else {
    for (const s of brief.benchmarks) {
      lines.push(`- [${mdEscape(s.title || s.url)}](${s.url})`);
      const meta = [s.publisher, s.date].filter(Boolean).join(" — ");
      if (meta) lines.push(`  - ${mdEscape(meta)}`);
      lines.push(`  - Relevance: ${s.relevance} — ${mdEscape(s.relevanceRationale)}`);
      lines.push(`  - Excerpt: ${mdEscape(s.excerpt)}`);
    }
  }

  lines.push(section("Scenarios"));
  if (brief.scenarios.length === 0) {
    lines.push("- (scenarios not generated yet)");
  } else {
    for (const sc of brief.scenarios) {
      lines.push(`### ${capitalizeWord(sc.name)}`);
      for (const d of sc.metricDeltas) {
        const m = getMetric(d.metricId);
        const label = m ? m.name : d.metricId;
        const baseline = d.baselineValue === null ? "unknown" : `${d.baselineValue} ${d.unit}`;
        const assumed = d.assumedValue === null ? "unknown" : `${d.assumedValue} ${d.unit}`;
        const delta = d.delta === null ? "unknown" : `${d.delta >= 0 ? "+" : ""}${d.delta} ${d.unit}`;
        lines.push(`- ${label}: ${baseline} → ${assumed} (${delta})`);
      }
      if (Object.keys(sc.rollups).length > 0) {
        const rollups = Object.entries(sc.rollups)
          .map(([k, v]) => `${k}: ${v}`)
          .join("; ");
        lines.push(`- Rollups: ${rollups}`);
      }
    }
  }

  lines.push(section("ImpactScore (RICE-like)"));
  if (!brief.impactScore) {
    lines.push("- (not generated)");
  } else {
    lines.push(`ImpactScore: ${brief.impactScore.value}`);
    for (const w of brief.impactScore.why) lines.push(`- ${mdEscape(w)}`);
  }

  return lines.join("\n").trim() + "\n";
}

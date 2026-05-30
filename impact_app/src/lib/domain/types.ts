export type TemplateType =
  | "new_feature"
  | "ui_revamp"
  | "tech_debt"
  | "bug_fix"
  | "compliance"
  | "accessibility"
  | "gamification"
  | "misc";

export type MetricCategory = "revenue" | "cost" | "risk" | "strategic";
export type MetricType = "leading" | "lagging";

export type Metric = {
  id: string;
  name: string;
  category: MetricCategory;
  type: MetricType;
  definition: string;
  formula?: string;
  defaultEstimationMethod: "benchmark" | "baseline" | "assumption";
  dataRequirements: string[];
};

export type MetricRecommendation = {
  metricId: string;
  rank: number;
  rationale: string;
  selected: boolean;
  recommended: boolean;
};

export type BaselineProvenance = "Observed" | "Estimated" | "Unknown";

export type Baseline = {
  metricId: string;
  value: number | null;
  unit: string;
  window: string;
  provenance: BaselineProvenance;
  note: string;
};

export type BenchmarkRelevance = "High" | "Medium" | "Low";

export type BenchmarkSource = {
  id: string;
  url: string;
  title: string;
  publisher?: string;
  date?: string;
  excerpt: string;
  metricIds: string[];
  relevance: BenchmarkRelevance;
  relevanceRationale: string;
};

export type Assumption = {
  key: string;
  value: number | string | boolean;
  unit?: string;
  rationale: string;
  provenance: "User" | "Benchmark" | "Default";
};

export type ScenarioName = "best" | "base" | "worst";

export type Resources = {
  engEffortPersonWeeks: number | null;
  designEffortPersonWeeks: number | null;
  pmOtherEffortPersonWeeks: number | null;
  fullyLoadedCostRateIdrPerPersonWeek: number | null;
};

export type ScenarioMetricDelta = {
  metricId: string;
  baselineValue: number | null;
  assumedValue: number | null;
  delta: number | null;
  unit: string;
  drivers: {
    baselineMetricId?: string;
    assumptionKeys: string[];
    benchmarkIds: string[];
  };
};

export type Scenario = {
  name: ScenarioName;
  metricDeltas: ScenarioMetricDelta[];
  rollups: Partial<Record<MetricCategory, number>>;
  notes: string;
};

export type ConfidenceScore = {
  score: number;
  drivers: {
    baselineCompleteness: number;
    benchmarkQuality: number;
    executionComplexity: number;
    measurementPlanQuality: number;
  };
};

export type ImpactScoreValue = 0.25 | 0.5 | 1 | 2 | 3;

export type ImpactScore = {
  value: ImpactScoreValue;
  why: string[];
  keyAssumptions: string[];
  supportingBenchmarkIds: string[];
};

export type Initiative = {
  id: string;
  title: string;
  goal: string;
  templateType: TemplateType;
  productType: string;
  targetUsers: "customer" | "employee" | "both";
  timeline: string;
  releaseApproach: "big_bang" | "staged" | "unknown";
  owner: string;
  stakeholders: string;
  createdAt: string;
  updatedAt: string;
};

export type ImpactBrief = {
  id: string;
  initiative: Initiative;
  recommendations: MetricRecommendation[];
  baselines: Baseline[];
  benchmarks: BenchmarkSource[];
  resources: Resources;
  assumptions: Assumption[];
  scenarios: Scenario[];
  confidence: ConfidenceScore | null;
  impactScore: ImpactScore | null;
  narrativeMarkdown: string;
  generatedAt: string;
  version: number;
};

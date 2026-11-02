export interface ExampleRecord {
  id: string
  metrics: Record<string, number>
  latencyMs?: number
  costUsd?: number
}

export interface ResultSet {
  source: string
  records: Map<string, ExampleRecord>
}

export type Mode = 'significance' | 'threshold'

export interface GateConfig {
  metrics: string[]
  maxDrop: Record<string, number>
  defaultMaxDrop: number
  lowerIsBetter: Set<string>
  alpha: number
  confidenceLevel: number
  mode: Mode
  bootstrapSamples: number
  seed: number
  topRegressions: number
  maxLatencyP95Increase?: number
  maxCostIncrease?: number
}

export interface MetricResult {
  metric: string
  n: number
  higherIsBetter: boolean
  baselineMean: number
  candidateMean: number
  delta: number
  ciLow: number
  ciHigh: number
  pValue: number
  test: 'mcnemar-exact' | 'paired-t'
  cohensD: number | null
  binary: boolean
  mcnemar?: { regressions: number; improvements: number }
  maxDrop: number
  drop: number
  regressed: boolean
}

export interface ExampleRegression {
  id: string
  metric: string
  baseline: number
  candidate: number
  delta: number
}

export interface DistributionSummary {
  n: number
  baseline: { p50: number; p95: number }
  candidate: { p50: number; p95: number }
  p50Change: number | null
  p95Change: number | null
}

export interface CostSummary {
  n: number
  baselineTotal: number
  candidateTotal: number
  baselineMean: number
  candidateMean: number
  totalChange: number | null
}

export interface GateCheck {
  name: string
  limit: number
  observed: number | null
  passed: boolean
}

export interface AlignmentSummary {
  baselineCount: number
  candidateCount: number
  shared: number
  onlyBaseline: string[]
  onlyCandidate: string[]
}

export interface AnalysisResult {
  config: GateConfig
  baselineSource: string
  candidateSource: string
  alignment: AlignmentSummary
  metrics: MetricResult[]
  latency: DistributionSummary | null
  cost: CostSummary | null
  extraChecks: GateCheck[]
  regressions: ExampleRegression[]
  passed: boolean
  regressedMetrics: string[]
}

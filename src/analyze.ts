import { alignMetric, commonMetrics, sharedIds, summarizeAlignment } from './align'
import {
  cohensDz,
  isBinary,
  mcnemarExact,
  mean,
  pairedBootstrapCi,
  pairedDifferences,
  pairedTTest,
  quantile
} from './stats'
import type {
  AnalysisResult,
  CostSummary,
  DistributionSummary,
  ExampleRegression,
  GateCheck,
  GateConfig,
  MetricResult,
  ResultSet
} from './types'

export class AnalysisError extends Error {
  override name = 'AnalysisError'
}

function relativeChange(before: number, after: number): number | null {
  if (before === 0) return after === 0 ? 0 : null
  return (after - before) / Math.abs(before)
}

export function analyzeMetric(
  metric: string,
  baseline: readonly number[],
  candidate: readonly number[],
  config: GateConfig
): MetricResult {
  const n = baseline.length
  const higherIsBetter = !config.lowerIsBetter.has(metric)
  const differences = pairedDifferences(baseline, candidate)
  const baselineMean = mean(baseline)
  const candidateMean = mean(candidate)
  const delta = candidateMean - baselineMean
  const [ciLow, ciHigh] = pairedBootstrapCi(differences, {
    samples: config.bootstrapSamples,
    seed: config.seed,
    confidenceLevel: config.confidenceLevel
  })
  const binary = isBinary(baseline) && isBinary(candidate)
  let pValue: number
  let mcnemar: MetricResult['mcnemar']
  if (binary) {
    const result = mcnemarExact(baseline, candidate)
    pValue = result.pValue
    mcnemar = { regressions: result.regressions, improvements: result.improvements }
  } else {
    pValue = pairedTTest(differences).pValue
  }
  const maxDrop = config.maxDrop[metric] ?? config.defaultMaxDrop
  const drop = higherIsBetter ? -delta : delta
  const beyondThreshold = drop > maxDrop
  const regressed =
    config.mode === 'threshold' ? beyondThreshold : beyondThreshold && pValue < config.alpha

  const result: MetricResult = {
    metric,
    n,
    higherIsBetter,
    baselineMean,
    candidateMean,
    delta,
    ciLow,
    ciHigh,
    pValue,
    test: binary ? 'mcnemar-exact' : 'paired-t',
    cohensD: cohensDz(differences),
    binary,
    maxDrop,
    drop,
    regressed
  }
  if (mcnemar !== undefined) result.mcnemar = mcnemar
  return result
}

function latencySummary(
  baseline: ResultSet,
  candidate: ResultSet,
  ids: string[]
): DistributionSummary | null {
  const b: number[] = []
  const c: number[] = []
  for (const id of ids) {
    const x = baseline.records.get(id)?.latencyMs
    const y = candidate.records.get(id)?.latencyMs
    if (x === undefined || y === undefined) continue
    b.push(x)
    c.push(y)
  }
  if (b.length === 0) return null
  const baselineStats = { p50: quantile(b, 0.5), p95: quantile(b, 0.95) }
  const candidateStats = { p50: quantile(c, 0.5), p95: quantile(c, 0.95) }
  return {
    n: b.length,
    baseline: baselineStats,
    candidate: candidateStats,
    p50Change: relativeChange(baselineStats.p50, candidateStats.p50),
    p95Change: relativeChange(baselineStats.p95, candidateStats.p95)
  }
}

function costSummary(baseline: ResultSet, candidate: ResultSet, ids: string[]): CostSummary | null {
  let n = 0
  let baselineTotal = 0
  let candidateTotal = 0
  for (const id of ids) {
    const x = baseline.records.get(id)?.costUsd
    const y = candidate.records.get(id)?.costUsd
    if (x === undefined || y === undefined) continue
    n++
    baselineTotal += x
    candidateTotal += y
  }
  if (n === 0) return null
  return {
    n,
    baselineTotal,
    candidateTotal,
    baselineMean: baselineTotal / n,
    candidateMean: candidateTotal / n,
    totalChange: relativeChange(baselineTotal, candidateTotal)
  }
}

function largestRegressions(
  baseline: ResultSet,
  candidate: ResultSet,
  metrics: MetricResult[],
  limit: number
): ExampleRegression[] {
  const rows: (ExampleRegression & { drop: number })[] = []
  for (const result of metrics) {
    const aligned = alignMetric(baseline, candidate, result.metric)
    aligned.ids.forEach((id, i) => {
      const b = aligned.baseline[i] as number
      const c = aligned.candidate[i] as number
      const drop = result.higherIsBetter ? b - c : c - b
      if (drop > 0)
        rows.push({ id, metric: result.metric, baseline: b, candidate: c, delta: c - b, drop })
    })
  }
  rows.sort(
    (x, y) =>
      y.drop - x.drop ||
      (x.metric < y.metric ? -1 : x.metric > y.metric ? 1 : 0) ||
      (x.id < y.id ? -1 : 1)
  )
  return rows.slice(0, limit).map(({ drop: _drop, ...row }) => row)
}

export function analyze(
  baseline: ResultSet,
  candidate: ResultSet,
  config: GateConfig
): AnalysisResult {
  const alignment = summarizeAlignment(baseline, candidate)
  if (alignment.shared === 0) {
    throw new AnalysisError(
      'no example ids are shared between the baseline and the candidate results'
    )
  }
  const available = commonMetrics(baseline, candidate)
  const metricNames = config.metrics.length > 0 ? config.metrics : available
  if (metricNames.length === 0) {
    throw new AnalysisError('no metric is reported by both the baseline and the candidate results')
  }
  const missing = metricNames.filter((name) => !available.includes(name))
  if (missing.length > 0) {
    throw new AnalysisError(
      `metric(s) not found in both result files: ${missing.join(', ')}. Available: ${available.join(', ') || 'none'}`
    )
  }

  const metrics = metricNames.map((name) => {
    const aligned = alignMetric(baseline, candidate, name)
    return analyzeMetric(name, aligned.baseline, aligned.candidate, config)
  })
  const ids = sharedIds(baseline, candidate)
  const latency = latencySummary(baseline, candidate, ids)
  const cost = costSummary(baseline, candidate, ids)

  const extraChecks: GateCheck[] = []
  if (config.maxLatencyP95Increase !== undefined) {
    const observed = latency?.p95Change ?? null
    extraChecks.push({
      name: 'latency p95 increase',
      limit: config.maxLatencyP95Increase,
      observed,
      passed: observed !== null && observed <= config.maxLatencyP95Increase
    })
  }
  if (config.maxCostIncrease !== undefined) {
    const observed = cost?.totalChange ?? null
    extraChecks.push({
      name: 'total cost increase',
      limit: config.maxCostIncrease,
      observed,
      passed: observed !== null && observed <= config.maxCostIncrease
    })
  }

  const regressedMetrics = metrics.filter((m) => m.regressed).map((m) => m.metric)
  const passed = regressedMetrics.length === 0 && extraChecks.every((check) => check.passed)
  return {
    config,
    baselineSource: baseline.source,
    candidateSource: candidate.source,
    alignment,
    metrics,
    latency,
    cost,
    extraChecks,
    regressions: largestRegressions(baseline, candidate, metrics, config.topRegressions),
    passed,
    regressedMetrics
  }
}

import type { AlignmentSummary, ResultSet } from './types'

export interface AlignedMetric {
  ids: string[]
  baseline: number[]
  candidate: number[]
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Ids present in both result sets, in a stable, locale-independent order. */
export function sharedIds(baseline: ResultSet, candidate: ResultSet): string[] {
  return [...baseline.records.keys()].filter((id) => candidate.records.has(id)).sort(compareIds)
}

export function summarizeAlignment(baseline: ResultSet, candidate: ResultSet): AlignmentSummary {
  const onlyBaseline = [...baseline.records.keys()]
    .filter((id) => !candidate.records.has(id))
    .sort(compareIds)
  const onlyCandidate = [...candidate.records.keys()]
    .filter((id) => !baseline.records.has(id))
    .sort(compareIds)
  return {
    baselineCount: baseline.records.size,
    candidateCount: candidate.records.size,
    shared: sharedIds(baseline, candidate).length,
    onlyBaseline,
    onlyCandidate
  }
}

/** Pairs metric values by example id, keeping only ids where both runs report the metric. */
export function alignMetric(
  baseline: ResultSet,
  candidate: ResultSet,
  metric: string
): AlignedMetric {
  const aligned: AlignedMetric = { ids: [], baseline: [], candidate: [] }
  for (const id of sharedIds(baseline, candidate)) {
    const b = baseline.records.get(id)?.metrics[metric]
    const c = candidate.records.get(id)?.metrics[metric]
    if (b === undefined || c === undefined) continue
    aligned.ids.push(id)
    aligned.baseline.push(b)
    aligned.candidate.push(c)
  }
  return aligned
}

/** Metric names reported by at least one shared example in both runs. */
export function commonMetrics(baseline: ResultSet, candidate: ResultSet): string[] {
  const names = new Set<string>()
  for (const id of sharedIds(baseline, candidate)) {
    const b = baseline.records.get(id)?.metrics ?? {}
    const c = candidate.records.get(id)?.metrics ?? {}
    for (const key of Object.keys(b)) if (key in c) names.add(key)
  }
  return [...names].sort(compareIds)
}

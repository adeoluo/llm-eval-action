import { describe, expect, it } from 'vitest'
import { alignMetric, commonMetrics, sharedIds, summarizeAlignment } from '../src/align'
import type { ExampleRecord, ResultSet } from '../src/types'

function set(source: string, records: ExampleRecord[]): ResultSet {
  return { source, records: new Map(records.map((r) => [r.id, r])) }
}

const baseline = set('b', [
  { id: 'b2', metrics: { em: 1, f1: 0.9 } },
  { id: 'a1', metrics: { em: 0, f1: 0.2 } },
  { id: 'c3', metrics: { em: 1 } },
  { id: 'z9', metrics: { em: 1, f1: 1 } }
])
const candidate = set('c', [
  { id: 'c3', metrics: { em: 0, f1: 0.1 } },
  { id: 'a1', metrics: { em: 1, f1: 0.8 } },
  { id: 'b2', metrics: { em: 1, f1: 0.7 } },
  { id: 'new', metrics: { em: 0 } }
])

describe('alignment', () => {
  it('returns shared ids in a stable order regardless of file order', () => {
    expect(sharedIds(baseline, candidate)).toEqual(['a1', 'b2', 'c3'])
  })

  it('pairs values by id, not by position', () => {
    expect(alignMetric(baseline, candidate, 'em')).toEqual({
      ids: ['a1', 'b2', 'c3'],
      baseline: [0, 1, 1],
      candidate: [1, 1, 0]
    })
  })

  it('skips ids where either side lacks the metric', () => {
    expect(alignMetric(baseline, candidate, 'f1').ids).toEqual(['a1', 'b2'])
    expect(alignMetric(baseline, candidate, 'missing').ids).toEqual([])
  })

  it('summarizes unmatched ids on both sides', () => {
    expect(summarizeAlignment(baseline, candidate)).toEqual({
      baselineCount: 4,
      candidateCount: 4,
      shared: 3,
      onlyBaseline: ['z9'],
      onlyCandidate: ['new']
    })
  })

  it('lists metrics present on both sides of at least one shared example', () => {
    expect(commonMetrics(baseline, candidate)).toEqual(['em', 'f1'])
  })
})

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { analyze } from '../src/analyze'
import { parseResults } from '../src/parse'
import {
  deltasJson,
  formatNumber,
  formatPercent,
  formatPValue,
  formatSigned,
  renderReport
} from '../src/report'
import { config, resultSet } from './helpers'

const load = (name: string) => parseResults(readFileSync(`__fixtures__/${name}`, 'utf8'), name)

describe('formatters', () => {
  it('format numbers, signs, p-values and percentages', () => {
    expect(formatNumber(0.12345)).toBe('0.1235')
    expect(formatNumber(-0.00001)).toBe('0.0000')
    expect(formatNumber(Number.NaN)).toBe('n/a')
    expect(formatNumber(Infinity)).toBe('inf')
    expect(formatNumber(-Infinity)).toBe('-inf')
    expect(formatSigned(0.5, 1)).toBe('+0.5')
    expect(formatSigned(-0.5, 1)).toBe('-0.5')
    expect(formatSigned(0, 1)).toBe('0.0')
    expect(formatPValue(0.00001)).toBe('< 0.0001')
    expect(formatPValue(0.04189)).toBe('0.0419')
    expect(formatPercent(null)).toBe('n/a')
    expect(formatPercent(0.256)).toBe('+25.6%')
    expect(formatPercent(-0.1)).toBe('-10.0%')
    expect(formatPercent(-0.0001)).toBe('0.0%')
  })
})

describe('renderReport', () => {
  const baseline = load('baseline.jsonl')

  it('renders a failing report with the regression table, budgets and per-example rows', () => {
    const result = analyze(
      baseline,
      load('candidate-regression.jsonl'),
      config({ defaultMaxDrop: 0.01, maxLatencyP95Increase: 0.2 })
    )
    const md = renderReport(result, 'Gate | QA \\')
    expect(md).toContain('## Gate \\| QA \\\\: :x: failed')
    expect(md).toContain('| exact_match | 200 | 0.7500 | 0.6650 | -0.0850 |')
    expect(md).toContain('McNemar exact (19 lost, 2 gained)')
    expect(md).toContain(':x: regression')
    expect(md).toContain('| Latency p95 (ms) | 200 | 944.3 | 1257.6 | +33.2% |')
    expect(md).toContain('### Budget checks')
    expect(md).toContain('| latency p95 increase | +20.0% | +33.2% | :x: fail |')
    expect(md).toContain('Largest per-example regressions (top 5)')
    expect(md).toContain('95% CI')
    expect(md).not.toMatch(/[\u2013\u2014]/)
  })

  it('renders a passing report and labels improvements and lower-is-better metrics', () => {
    const result = analyze(
      baseline,
      load('candidate-pass.jsonl'),
      config({ lowerIsBetter: new Set(['f1']) })
    )
    const md = renderReport(result)
    expect(md).toContain('## LLM evaluation gate')
    expect(md).toContain('f1 (lower is better)')
    expect(md).toContain(':white_check_mark: improved')
  })

  it('flags non-significant drops in significance mode and notes unaligned ids', () => {
    const ids = Array.from({ length: 14 }, (_, i) => `e${i}`)
    const b = resultSet(
      'b',
      ids.map((id) => ({ id, metrics: { em: 1 } }))
    )
    const c = resultSet('c', [
      ...ids.map((id, i) => ({ id, metrics: { em: i === 0 ? 0 : 1 } })),
      { id: 'extra', metrics: { em: 1 } }
    ])
    const md = renderReport(analyze(b, c, config({ topRegressions: 0 })))
    expect(md).toContain(':warning: drop, not significant')
    expect(md).toContain('Only in candidate (1): `extra`')
    expect(md).not.toContain('<details>')
    expect(md).not.toContain('### Latency and cost')
  })

  it('renders a plain pass and truncates long unaligned id lists', () => {
    const b = resultSet(
      'b',
      Array.from({ length: 15 }, (_, i) => ({ id: `b${i}`, metrics: { s: 0.5 } })).concat([
        { id: 'x', metrics: { s: 0.5 } }
      ])
    )
    const c = resultSet('c', [{ id: 'x', metrics: { s: 0.5 }, costUsd: 0.01 }])
    const md = renderReport(analyze(b, c, config({ mode: 'threshold' })))
    expect(md).toContain(':white_check_mark: pass |')
    expect(md).toContain('threshold (fail when a drop exceeds the allowed drop)')
    expect(md).toContain('and 5 more')
    expect(md).toContain('| n/a | 0.0000 | :white_check_mark: pass |')
  })

  it('renders cost rows without latency', () => {
    const b = resultSet('b', [{ id: 'x', metrics: { s: 1 }, costUsd: 0.02 }])
    const c = resultSet('c', [{ id: 'x', metrics: { s: 1 }, costUsd: 0.01 }])
    const md = renderReport(analyze(b, c, config()))
    expect(md).toContain('| Total cost (USD) | 1 | 0.0200 | 0.0100 | -50.0% |')
    expect(md).not.toContain('Latency p50')
  })
})

describe('deltasJson', () => {
  it('serializes per-metric deltas', () => {
    const result = analyze(baseline(), load('candidate-regression.jsonl'), config())
    const parsed = JSON.parse(deltasJson(result)) as Record<string, Record<string, unknown>>
    expect(Object.keys(parsed)).toEqual(['exact_match', 'f1'])
    expect(parsed.exact_match).toMatchObject({ n: 200, test: 'mcnemar-exact', regressed: true })
    expect(parsed.f1?.delta).toBeCloseTo(-0.0809085, 6)
  })

  function baseline() {
    return load('baseline.jsonl')
  }
})

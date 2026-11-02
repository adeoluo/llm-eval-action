import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { analyze, AnalysisError, analyzeMetric } from '../src/analyze'
import { parseResults } from '../src/parse'
import { config, resultSet } from './helpers'

const load = (name: string) => parseResults(readFileSync(`__fixtures__/${name}`, 'utf8'), name)
const baseline = load('baseline.jsonl')

describe('analyzeMetric', () => {
  it('uses McNemar for binary metrics and reports discordant counts', () => {
    const b = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 1]
    const c = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1]
    const result = analyzeMetric('em', b, c, config())
    expect(result.test).toBe('mcnemar-exact')
    expect(result.mcnemar).toEqual({ regressions: 10, improvements: 2 })
    expect(result.pValue).toBeCloseTo(158 / 4096, 12)
    expect(result.delta).toBeCloseTo(-8 / 14, 12)
    expect(result.regressed).toBe(true)
  })

  it('uses a paired t-test for continuous metrics', () => {
    const result = analyzeMetric(
      'f1',
      [0.62, 0.71, 0.55, 0.8, 0.67, 0.9, 0.48, 0.73],
      [0.6, 0.75, 0.5, 0.7, 0.66, 0.84, 0.41, 0.7],
      config()
    )
    expect(result.test).toBe('paired-t')
    expect(result.mcnemar).toBeUndefined()
    expect(result.pValue).toBeCloseTo(0.0418868139372642, 10)
    expect(result.cohensD).toBeCloseTo(-0.878668779193509, 10)
    expect(result.regressed).toBe(true)
    expect(
      analyzeMetric(
        'f1',
        [0.62, 0.71, 0.55, 0.8, 0.67, 0.9, 0.48, 0.73],
        [0.6, 0.75, 0.5, 0.7, 0.66, 0.84, 0.41, 0.7],
        config({ alpha: 0.01 })
      ).regressed
    ).toBe(false)
  })

  it('respects the allowed drop and per-metric overrides', () => {
    const b = [0.8, 0.7, 0.9, 0.6, 0.75, 0.85]
    const c = b.map((x) => x - 0.02)
    expect(
      analyzeMetric('s', b, c, config({ mode: 'threshold', defaultMaxDrop: 0.01 })).regressed
    ).toBe(true)
    expect(
      analyzeMetric('s', b, c, config({ mode: 'threshold', defaultMaxDrop: 0.03 })).regressed
    ).toBe(false)
    expect(
      analyzeMetric(
        's',
        b,
        c,
        config({ mode: 'threshold', defaultMaxDrop: 0.01, maxDrop: { s: 0.05 } })
      ).maxDrop
    ).toBe(0.05)
  })

  it('inverts the direction for lower-is-better metrics', () => {
    const b = [1, 2, 3, 4, 5, 6]
    const up = b.map((x, i) => x + 1 + (i % 2) * 0.1)
    const result = analyzeMetric('err', b, up, config({ lowerIsBetter: new Set(['err']) }))
    expect(result.higherIsBetter).toBe(false)
    expect(result.drop).toBeGreaterThan(1)
    expect(result.regressed).toBe(true)
    const down = analyzeMetric('err', up, b, config({ lowerIsBetter: new Set(['err']) }))
    expect(down.regressed).toBe(false)
  })
})

describe('analyze on fixtures', () => {
  it('passes the passing scenario', () => {
    const result = analyze(baseline, load('candidate-pass.jsonl'), config({ defaultMaxDrop: 0.01 }))
    expect(result.passed).toBe(true)
    expect(result.metrics.map((m) => m.metric)).toEqual(['exact_match', 'f1'])
    expect(result.alignment.shared).toBe(200)
    expect(result.latency?.n).toBe(200)
    expect(result.cost?.n).toBe(200)
  })

  it('fails the regression scenario in both modes', () => {
    const candidate = load('candidate-regression.jsonl')
    for (const mode of ['significance', 'threshold'] as const) {
      const result = analyze(baseline, candidate, config({ mode, defaultMaxDrop: 0.01 }))
      expect(result.passed).toBe(false)
      expect(result.regressedMetrics).toEqual(['exact_match', 'f1'])
    }
    const result = analyze(baseline, candidate, config())
    const em = result.metrics[0]
    expect(em?.mcnemar).toEqual({ regressions: 19, improvements: 2 })
    expect(em?.pValue).toBeCloseTo(0.00022125244140625, 12)
    expect(em?.ciHigh).toBeLessThan(0)
    expect(result.regressions).toHaveLength(5)
    expect(result.regressions[0]?.delta).toBe(-1)
  })

  it('distinguishes the two modes on a small, noisy drop', () => {
    const b = resultSet(
      'b',
      [1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ id: `e${i}`, metrics: { em: i % 2 } }))
    )
    const c = resultSet(
      'c',
      [1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ id: `e${i}`, metrics: { em: i === 1 ? 0 : i % 2 } }))
    )
    expect(analyze(b, c, config({ mode: 'threshold' })).passed).toBe(false)
    expect(analyze(b, c, config({ mode: 'significance' })).passed).toBe(true)
  })

  it('applies latency and cost budgets', () => {
    const candidate = load('candidate-regression.jsonl')
    const result = analyze(
      baseline,
      candidate,
      config({
        metrics: ['f1'],
        defaultMaxDrop: 1,
        maxLatencyP95Increase: 0.2,
        maxCostIncrease: 0.5
      })
    )
    expect(result.regressedMetrics).toEqual([])
    expect(result.extraChecks.map((c) => [c.name, c.passed])).toEqual([
      ['latency p95 increase', false],
      ['total cost increase', true]
    ])
    expect(result.passed).toBe(false)
  })

  it('fails budgets when latency or cost data are missing', () => {
    const b = resultSet('b', [{ id: 'a', metrics: { s: 1 } }])
    const result = analyze(b, b, config({ maxLatencyP95Increase: 0.1, maxCostIncrease: 0.1 }))
    expect(result.latency).toBeNull()
    expect(result.cost).toBeNull()
    expect(result.extraChecks.every((c) => !c.passed && c.observed === null)).toBe(true)
  })

  it('handles zero baselines in relative changes', () => {
    const b = resultSet('b', [{ id: 'a', metrics: { s: 1 }, latencyMs: 0, costUsd: 0 }])
    const same = analyze(b, b, config())
    expect(same.latency?.p95Change).toBe(0)
    const c = resultSet('c', [{ id: 'a', metrics: { s: 1 }, latencyMs: 5, costUsd: 1 }])
    const changed = analyze(b, c, config())
    expect(changed.latency?.p95Change).toBeNull()
    expect(changed.cost?.totalChange).toBeNull()
  })

  it('ranks per-example regressions by size, honoring direction and the limit', () => {
    const b = resultSet('b', [
      { id: 'a', metrics: { s: 0.9, err: 1 } },
      { id: 'b', metrics: { s: 0.5, err: 1 } },
      { id: 'c', metrics: { s: 0.4, err: 1 } }
    ])
    const c = resultSet('c', [
      { id: 'a', metrics: { s: 0.2, err: 1.5 } },
      { id: 'b', metrics: { s: 0.6, err: 0.5 } },
      { id: 'c', metrics: { s: 0.3, err: 1 } }
    ])
    const result = analyze(b, c, config({ lowerIsBetter: new Set(['err']), topRegressions: 2 }))
    expect(result.regressions.map((r) => [r.id, r.metric])).toEqual([
      ['a', 's'],
      ['a', 'err']
    ])
  })

  it('raises clear errors for unusable inputs', () => {
    const a = resultSet('a', [{ id: '1', metrics: { s: 1 } }])
    const other = resultSet('b', [{ id: '2', metrics: { s: 1 } }])
    const noMetric = resultSet('c', [{ id: '1', metrics: { t: 1 } }])
    expect(() => analyze(a, other, config())).toThrow(AnalysisError)
    expect(() => analyze(a, noMetric, config())).toThrow(/no metric is reported/)
    expect(() => analyze(a, a, config({ metrics: ['s', 'nope'] }))).toThrow(
      /not found in both result files: nope/
    )
  })

  it('reproduces the evaluation-harness compare result on its real CLI output', () => {
    // evaluation-harness reports Cohen's d = 0.84 and p < 0.0001 for keyword-sentiment
    // versus the constant baseline on the sentiment task.
    const result = analyze(
      load('harness-cli-keyword-sentiment.json'),
      load('harness-cli-constant-positive.json'),
      config()
    )
    const m = result.metrics[0]
    expect(m?.metric).toBe('sentiment')
    expect(m?.n).toBe(48)
    expect(m?.baselineMean).toBeCloseTo(44 / 48, 12)
    expect(m?.candidateMean).toBe(0.5)
    expect(m?.mcnemar).toEqual({ regressions: 20, improvements: 0 })
    expect(m?.pValue).toBeCloseTo(2 / 2 ** 20, 15)
    expect(m?.cohensD).toBeCloseTo(-0.84, 2)
  })

  it('works with evaluation-harness run records', () => {
    const result = analyze(load('harness-baseline.json'), load('harness-candidate.json'), config())
    expect(result.metrics.map((m) => m.metric)).toEqual(['factual_qa'])
    expect(result.metrics[0]?.test).toBe('mcnemar-exact')
    expect(result.latency?.n).toBe(60)
  })
})

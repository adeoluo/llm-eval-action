import { describe, expect, it } from 'vitest'
import { InputError, parseBoolean, parseInputs, parseMaxDrop, parseNumber } from '../src/inputs'
import { inputReader } from './helpers'

describe('parseInputs', () => {
  it('applies documented defaults', () => {
    const inputs = parseInputs(inputReader({ results: 'pr.jsonl', baseline: 'base.jsonl' }))
    expect(inputs).toMatchObject({
      resultsPath: 'pr.jsonl',
      baselinePath: 'base.jsonl',
      baselineArtifact: '',
      failOnRegression: true,
      commentOnPr: false,
      title: 'LLM evaluation gate',
      reportPath: ''
    })
    expect(inputs.baselineArtifactRunId).toBeUndefined()
    expect(inputs.config).toMatchObject({
      metrics: [],
      defaultMaxDrop: 0,
      maxDrop: {},
      alpha: 0.05,
      confidenceLevel: 0.95,
      mode: 'significance',
      bootstrapSamples: 10000,
      seed: 1234,
      topRegressions: 5
    })
    expect(inputs.config.maxLatencyP95Increase).toBeUndefined()
    expect(inputs.config.maxCostIncrease).toBeUndefined()
  })

  it('parses every option', () => {
    const inputs = parseInputs(
      inputReader({
        results: ' pr.jsonl ',
        'baseline-artifact': 'eval-baseline',
        'baseline-artifact-run-id': '987',
        'baseline-artifact-branch': 'main',
        metrics: 'exact_match,\n f1',
        'max-drop': '0.01, f1=0.02',
        'lower-is-better': 'latency_score',
        alpha: '0.01',
        'confidence-level': '0.9',
        mode: 'THRESHOLD',
        'bootstrap-samples': '500',
        seed: '7',
        'top-regressions': '0',
        'max-latency-p95-increase': '0.2',
        'max-cost-increase': '0.1',
        'fail-on-regression': 'false',
        'comment-on-pr': 'true',
        'github-token': 'tok',
        'report-path': 'out/report.md',
        title: 'Nightly gate'
      })
    )
    expect(inputs.baselineArtifactRunId).toBe(987)
    expect(inputs.baselineArtifactBranch).toBe('main')
    expect(inputs.config.metrics).toEqual(['exact_match', 'f1'])
    expect(inputs.config.maxDrop).toEqual({ f1: 0.02 })
    expect(inputs.config.defaultMaxDrop).toBe(0.01)
    expect([...inputs.config.lowerIsBetter]).toEqual(['latency_score'])
    expect(inputs.config.mode).toBe('threshold')
    expect(inputs.config.maxLatencyP95Increase).toBe(0.2)
    expect(inputs.config.maxCostIncrease).toBe(0.1)
    expect(inputs.failOnRegression).toBe(false)
    expect(inputs.commentOnPr).toBe(true)
    expect(inputs.title).toBe('Nightly gate')
  })

  it.each([
    [{}, /"results" is required/],
    [{ results: 'a' }, /set "baseline"/],
    [{ results: 'a', baseline: 'b', mode: 'vibes' }, /"mode" must be/],
    [{ results: 'a', baseline: 'b', alpha: '2' }, /"alpha" must be <= 1/],
    [{ results: 'a', baseline: 'b', 'bootstrap-samples': '10.5' }, /must be an integer/],
    [{ results: 'a', baseline: 'b', 'bootstrap-samples': '5' }, />= 100/],
    [{ results: 'a', baseline: 'b', 'max-drop': 'f1=abc' }, /max-drop \(f1\)" must be a number/],
    [{ results: 'a', baseline: 'b', 'max-drop': '=0.1' }, /without a metric/],
    [{ results: 'a', baseline: 'b', 'max-drop': '-0.1' }, />= 0/],
    [{ results: 'a', baseline: 'b', 'comment-on-pr': 'maybe' }, /true or false/],
    [{ results: 'a', baseline: 'b', 'baseline-artifact-run-id': '0' }, />= 1/]
  ])('rejects invalid input %j', (values, message) => {
    expect(() => parseInputs(inputReader(values))).toThrow(InputError)
    expect(() => parseInputs(inputReader(values))).toThrow(message)
  })
})

describe('input helpers', () => {
  it('parseNumber validates', () => {
    expect(parseNumber('x', ' 3.5 ')).toBe(3.5)
    expect(() => parseNumber('x', '')).toThrow(/must be a number/)
    expect(() => parseNumber('x', 'Infinity')).toThrow(/must be a number/)
  })

  it('parseBoolean accepts common spellings', () => {
    expect(parseBoolean('b', 'YES', false)).toBe(true)
    expect(parseBoolean('b', 'off', true)).toBe(false)
    expect(parseBoolean('b', '', true)).toBe(true)
  })

  it('parseMaxDrop supports a default plus overrides', () => {
    expect(parseMaxDrop('')).toEqual({ defaultMaxDrop: 0, maxDrop: {} })
    expect(parseMaxDrop('em=0.05\nf1 = 0.01\n0.002')).toEqual({
      defaultMaxDrop: 0.002,
      maxDrop: { em: 0.05, f1: 0.01 }
    })
  })
})

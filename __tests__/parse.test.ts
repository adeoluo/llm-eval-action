import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseResults, ResultsFormatError } from '../src/parse'

describe('parseResults', () => {
  it('parses JSONL with nested scores, latency and cost', () => {
    const text = [
      '{"id": "a", "scores": {"em": 1, "f1": 0.5}, "latency_ms": 120, "cost_usd": 0.001}',
      '',
      '{"id": 2, "scores": {"em": false, "f1": 0.25}, "latency_seconds": 0.5, "cost": 0.002}'
    ].join('\n')
    const set = parseResults(text, 'r.jsonl')
    expect(set.source).toBe('r.jsonl')
    expect(set.records.get('a')).toEqual({
      id: 'a',
      metrics: { em: 1, f1: 0.5 },
      latencyMs: 120,
      costUsd: 0.001
    })
    expect(set.records.get('2')).toEqual({
      id: '2',
      metrics: { em: 0, f1: 0.25 },
      latencyMs: 500,
      costUsd: 0.002
    })
  })

  it('parses a JSON array with top-level metrics, ignoring reserved and non-numeric fields', () => {
    const text = JSON.stringify([
      { example_id: 'x', accuracy: true, rouge: 0.4, latency: 33, prediction: 'hi' },
      { uid: 'y', accuracy: 0, rouge: 0.1 }
    ])
    const set = parseResults(text, 'r.json')
    expect(set.records.get('x')).toEqual({
      id: 'x',
      metrics: { accuracy: 1, rouge: 0.4 },
      latencyMs: 33
    })
    expect(set.records.get('y')?.metrics).toEqual({ accuracy: 0, rouge: 0.1 })
  })

  it('parses an object with an examples array and a "metrics" object', () => {
    const text = JSON.stringify({ examples: [{ id: 'q', metrics: { judge: 4 } }] })
    expect(parseResults(text, 'r.json').records.get('q')?.metrics).toEqual({ judge: 4 })
  })

  it('treats a single JSON object as one record', () => {
    expect(parseResults('{"id": "only", "score": 1}', 's.jsonl').records.size).toBe(1)
  })

  it('parses evaluation-harness run records', () => {
    const set = parseResults(readFileSync('__fixtures__/harness-baseline.json', 'utf8'), 'h.json')
    expect(set.records.size).toBe(60)
    const first = set.records.get('factual_qa/q000')
    expect(first?.metrics).toHaveProperty('factual_qa')
    expect(first?.latencyMs).toBeCloseTo(739.9, 6)
  })

  it('falls back to the example index for harness examples without ids', () => {
    const text = JSON.stringify({ results: [{ examples: [{ score: 1, id: null }, { score: 0 }] }] })
    const set = parseResults(text, 'h.json')
    expect([...set.records.keys()]).toEqual(['task0/0', 'task0/1'])
    expect(set.records.get('task0/0')?.metrics).toEqual({ task0: 1 })
  })

  it.each([
    ['', /file is empty/],
    ['"text"', /expected a JSON array or object/],
    ['{"id": 1}\nnot json', /line 2 is not valid JSON/],
    ['[1]', /record 0 is not an object/],
    ['[{"score": 1}]', /has no "id" field/],
    ['[{"id": {"a": 1}}]', /non-scalar id/],
    ['[{"id": "a", "s": 1}, {"id": "a", "s": 0}]', /duplicate id "a"/],
    ['[]', /no records found/],
    ['{"examples": [], "results": 3}', /no records found/],
    ['{"results": 3}', /must be an array/],
    ['{"results": [3]}', /results\[0\] is invalid/],
    ['{"results": [{"task_name": "t"}]}', /no "examples" array/],
    ['{"results": [{"task_name": "t", "examples": [5]}]}', /t example 0 is not an object/],
    ['{"results": [{"task_name": "t", "examples": [{"id": 1}]}]}', /no numeric "score"/]
  ])('rejects malformed input %j', (text, message) => {
    expect(() => parseResults(text, 'bad')).toThrow(ResultsFormatError)
    expect(() => parseResults(text, 'bad')).toThrow(message)
  })

  it('rejects non-finite metric values', () => {
    const set = () => parseResults('[{"id": "a", "s": 1e999}]', 'bad')
    expect(set).toThrow(/non-finite value for "s"/)
  })
})

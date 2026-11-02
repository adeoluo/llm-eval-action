/**
 * Regenerates the deterministic fixture files in __fixtures__/ used by the unit tests,
 * the self-test workflow, and the README examples. Run with: npx tsx scripts/generate-fixtures.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { mulberry32 } from '../src/random'

const N = 200
const rand = mulberry32(20261101)

function round(value: number, digits = 4): number {
  return Number(value.toFixed(digits))
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

interface Row {
  id: string
  scores: { exact_match: number; f1: number }
  latency_ms: number
  cost_usd: number
}

const baseline: Row[] = []
for (let i = 0; i < N; i++) {
  const correct = rand() < 0.8 ? 1 : 0
  const f1 = clamp01(correct ? 0.75 + 0.25 * rand() : 0.5 * rand())
  baseline.push({
    id: `q${String(i).padStart(3, '0')}`,
    scores: { exact_match: correct, f1: round(f1) },
    latency_ms: round(400 + 600 * rand() ** 2, 1),
    cost_usd: round(0.0004 + 0.0003 * rand(), 6)
  })
}

function variant(flipLoss: number, flipGain: number, f1Shift: number, latencyScale: number): Row[] {
  return baseline.map((row) => {
    let correct = row.scores.exact_match
    const r = rand()
    if (correct === 1 && r < flipLoss) correct = 0
    else if (correct === 0 && r < flipGain) correct = 1
    const noise = (rand() - 0.5) * 0.06
    const f1 =
      correct === row.scores.exact_match
        ? clamp01(row.scores.f1 + f1Shift + noise)
        : clamp01(correct ? 0.75 + 0.25 * rand() : 0.5 * rand())
    return {
      id: row.id,
      scores: { exact_match: correct, f1: round(f1) },
      latency_ms: round(row.latency_ms * latencyScale * (0.9 + 0.2 * rand()), 1),
      cost_usd: round(row.cost_usd * (0.95 + 0.1 * rand()), 6)
    }
  })
}

const pass = variant(0.03, 0.12, 0.0, 1.0)
const regression = variant(0.14, 0.05, -0.03, 1.35)

function jsonl(rows: Row[]): string {
  return rows.map((row) => JSON.stringify(row)).join('\n') + '\n'
}

function harness(rows: Row[], model: string): string {
  return (
    JSON.stringify(
      {
        label: model,
        created_at: '2026-11-01T00:00:00+00:00',
        results: [
          {
            task_name: 'factual_qa',
            model_name: model,
            seed: 0,
            examples: rows.slice(0, 60).map((row) => ({
              input: `question ${row.id}`,
              target: `answer ${row.id}`,
              id: row.id,
              prediction: row.scores.exact_match ? `answer ${row.id}` : 'unknown',
              score: row.scores.exact_match,
              rationale: null,
              latency_seconds: round(row.latency_ms / 1000, 4)
            }))
          }
        ]
      },
      null,
      2
    ) + '\n'
  )
}

mkdirSync('__fixtures__', { recursive: true })
writeFileSync('__fixtures__/baseline.jsonl', jsonl(baseline))
writeFileSync('__fixtures__/candidate-pass.jsonl', jsonl(pass))
writeFileSync('__fixtures__/candidate-regression.jsonl', jsonl(regression))
writeFileSync('__fixtures__/harness-baseline.json', harness(baseline, 'baseline-model'))
writeFileSync('__fixtures__/harness-candidate.json', harness(regression, 'candidate-model'))

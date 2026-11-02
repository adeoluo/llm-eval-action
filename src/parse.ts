import type { ExampleRecord, ResultSet } from './types'

const ID_KEYS = ['id', 'example_id', 'uid'] as const
const LATENCY_MS_KEYS = ['latency_ms', 'latency'] as const
const LATENCY_S_KEYS = ['latency_s', 'latency_seconds'] as const
const COST_KEYS = ['cost_usd', 'cost'] as const
const RESERVED = new Set<string>([
  ...ID_KEYS,
  ...LATENCY_MS_KEYS,
  ...LATENCY_S_KEYS,
  ...COST_KEYS,
  'scores',
  'metrics'
])

type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
type JsonObject = { [key: string]: Json }

export class ResultsFormatError extends Error {
  override name = 'ResultsFormatError'
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toNumber(value: Json | undefined): number | undefined {
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'number') return value
  return undefined
}

function readRows(text: string, source: string): Json[] | JsonObject {
  const trimmed = text.trim()
  if (trimmed.length === 0) throw new ResultsFormatError(`${source}: file is empty`)
  try {
    const parsed = JSON.parse(trimmed) as Json
    if (Array.isArray(parsed) || isObject(parsed)) {
      if (isObject(parsed) && !('examples' in parsed) && !('results' in parsed)) {
        return [parsed]
      }
      return parsed as Json[] | JsonObject
    }
    throw new ResultsFormatError(`${source}: expected a JSON array or object`)
  } catch (error) {
    if (error instanceof ResultsFormatError) throw error
  }
  const rows: Json[] = []
  text.split(/\r?\n/).forEach((line, index) => {
    if (line.trim().length === 0) return
    try {
      rows.push(JSON.parse(line) as Json)
    } catch {
      throw new ResultsFormatError(`${source}: line ${index + 1} is not valid JSON`)
    }
  })
  return rows
}

function normalizeRecord(row: Json, index: number, source: string, idPrefix = ''): ExampleRecord {
  if (!isObject(row)) throw new ResultsFormatError(`${source}: record ${index} is not an object`)
  const idKey = ID_KEYS.find((key) => row[key] !== undefined && row[key] !== null)
  if (idKey === undefined) {
    throw new ResultsFormatError(`${source}: record ${index} has no "id" field`)
  }
  const rawId = row[idKey]
  if (typeof rawId !== 'string' && typeof rawId !== 'number') {
    throw new ResultsFormatError(`${source}: record ${index} has a non-scalar id`)
  }
  const id = `${idPrefix}${String(rawId)}`

  const metrics: Record<string, number> = {}
  const nested = isObject(row.scores) ? row.scores : isObject(row.metrics) ? row.metrics : null
  const metricSource: JsonObject = nested ?? row
  for (const [key, value] of Object.entries(metricSource)) {
    if (nested === null && RESERVED.has(key)) continue
    const numeric = toNumber(value)
    if (numeric === undefined) continue
    if (!Number.isFinite(numeric)) {
      throw new ResultsFormatError(`${source}: record "${id}" has a non-finite value for "${key}"`)
    }
    metrics[key] = numeric
  }

  const record: ExampleRecord = { id, metrics }
  const msKey = LATENCY_MS_KEYS.find((key) => typeof row[key] === 'number')
  const sKey = LATENCY_S_KEYS.find((key) => typeof row[key] === 'number')
  if (msKey !== undefined) record.latencyMs = row[msKey] as number
  else if (sKey !== undefined) record.latencyMs = (row[sKey] as number) * 1000
  const costKey = COST_KEYS.find((key) => typeof row[key] === 'number')
  if (costKey !== undefined) record.costUsd = row[costKey] as number
  return record
}

/**
 * Converts one task from an evaluation-harness run record ("task_name") or its CLI
 * `run --json` report ("task") into records keyed "<task>/<id>", one metric per task.
 */
function harnessRecords(task: JsonObject, taskIndex: number, source: string): ExampleRecord[] {
  const rawName = task.task_name ?? task.task
  const name = typeof rawName === 'string' ? rawName : `task${taskIndex}`
  if (!Array.isArray(task.examples)) {
    throw new ResultsFormatError(`${source}: results[${taskIndex}] has no "examples" array`)
  }
  return task.examples.map((example, index) => {
    if (!isObject(example)) {
      throw new ResultsFormatError(`${source}: ${name} example ${index} is not an object`)
    }
    const score = toNumber(example.score)
    if (score === undefined) {
      throw new ResultsFormatError(`${source}: ${name} example ${index} has no numeric "score"`)
    }
    const rawId = example.id
    const id = `${name}/${typeof rawId === 'string' || typeof rawId === 'number' ? rawId : index}`
    const record: ExampleRecord = { id, metrics: { [name]: score } }
    if (typeof example.latency_seconds === 'number') {
      record.latencyMs = example.latency_seconds * 1000
    }
    return record
  })
}

/**
 * Parses a results file. Accepted shapes:
 * - JSONL, one record per line
 * - a JSON array of records, or an object with an "examples" array
 * - an evaluation-harness run record or `run --json` report:
 *   { "results": [{ "task_name" | "task", "examples": [{ "id", "score", ... }] }] }
 *
 * A record carries an id plus metric values either in a "scores"/"metrics" object or as
 * top-level numeric/boolean fields. Optional latency (latency_ms, latency_seconds) and
 * cost (cost_usd, cost) fields are read when present.
 */
export function parseResults(text: string, source: string): ResultSet {
  const parsed = readRows(text, source)
  let records: ExampleRecord[]
  if (Array.isArray(parsed)) {
    records = parsed.map((row, index) => normalizeRecord(row, index, source))
  } else if (Array.isArray(parsed.examples)) {
    records = parsed.examples.map((row, index) => normalizeRecord(row, index, source))
  } else if (Array.isArray(parsed.results)) {
    records = parsed.results.flatMap((task, index) => {
      if (!isObject(task)) throw new ResultsFormatError(`${source}: results[${index}] is invalid`)
      return harnessRecords(task, index, source)
    })
  } else {
    throw new ResultsFormatError(`${source}: "examples" or "results" must be an array`)
  }

  const map = new Map<string, ExampleRecord>()
  for (const record of records) {
    if (map.has(record.id)) {
      throw new ResultsFormatError(`${source}: duplicate id "${record.id}"`)
    }
    map.set(record.id, record)
  }
  if (map.size === 0) throw new ResultsFormatError(`${source}: no records found`)
  return { source, records: map }
}

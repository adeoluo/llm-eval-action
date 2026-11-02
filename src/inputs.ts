import type { GateConfig, Mode } from './types'

export class InputError extends Error {
  override name = 'InputError'
}

export interface ActionInputs {
  resultsPath: string
  baselinePath: string
  baselineArtifact: string
  baselineArtifactRunId?: number
  baselineArtifactBranch: string
  failOnRegression: boolean
  commentOnPr: boolean
  githubToken: string
  reportPath: string
  title: string
  config: GateConfig
}

export type InputReader = (name: string) => string

function list(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

export function parseNumber(
  name: string,
  raw: string,
  { min, max, integer = false }: { min?: number; max?: number; integer?: boolean } = {}
): number {
  const value = Number(raw.trim())
  if (raw.trim() === '' || !Number.isFinite(value)) {
    throw new InputError(`input "${name}" must be a number, got "${raw}"`)
  }
  if (integer && !Number.isInteger(value)) {
    throw new InputError(`input "${name}" must be an integer, got "${raw}"`)
  }
  if (min !== undefined && value < min) throw new InputError(`input "${name}" must be >= ${min}`)
  if (max !== undefined && value > max) throw new InputError(`input "${name}" must be <= ${max}`)
  return value
}

export function parseBoolean(name: string, raw: string, fallback: boolean): boolean {
  const value = raw.trim().toLowerCase()
  if (value === '') return fallback
  if (['true', 'yes', '1', 'on'].includes(value)) return true
  if (['false', 'no', '0', 'off'].includes(value)) return false
  throw new InputError(`input "${name}" must be true or false, got "${raw}"`)
}

/**
 * Parses "max-drop": either one number applied to every metric, or "metric=value" pairs
 * separated by commas or newlines, optionally with a bare number as the default.
 */
export function parseMaxDrop(raw: string): {
  defaultMaxDrop: number
  maxDrop: Record<string, number>
} {
  let defaultMaxDrop = 0
  const maxDrop: Record<string, number> = {}
  for (const item of list(raw)) {
    const eq = item.indexOf('=')
    if (eq === -1) {
      defaultMaxDrop = parseNumber('max-drop', item, { min: 0 })
      continue
    }
    const metric = item.slice(0, eq).trim()
    if (metric === '')
      throw new InputError(`input "max-drop" has an entry without a metric: "${item}"`)
    maxDrop[metric] = parseNumber(`max-drop (${metric})`, item.slice(eq + 1), { min: 0 })
  }
  return { defaultMaxDrop, maxDrop }
}

function optionalNumber(name: string, raw: string, min: number): number | undefined {
  return raw.trim() === '' ? undefined : parseNumber(name, raw, { min })
}

export function parseInputs(read: InputReader): ActionInputs {
  const get = (name: string): string => read(name) ?? ''
  const resultsPath = get('results').trim()
  if (resultsPath === '') throw new InputError('input "results" is required')
  const baselinePath = get('baseline').trim()
  const baselineArtifact = get('baseline-artifact').trim()
  if (baselinePath === '' && baselineArtifact === '') {
    throw new InputError('set "baseline" (a file path) or "baseline-artifact" (an artifact name)')
  }

  const modeRaw = (get('mode').trim() || 'significance').toLowerCase()
  if (modeRaw !== 'significance' && modeRaw !== 'threshold') {
    throw new InputError(`input "mode" must be "significance" or "threshold", got "${modeRaw}"`)
  }
  const { defaultMaxDrop, maxDrop } = parseMaxDrop(get('max-drop'))
  const config: GateConfig = {
    metrics: list(get('metrics')),
    maxDrop,
    defaultMaxDrop,
    lowerIsBetter: new Set(list(get('lower-is-better'))),
    alpha: parseNumber('alpha', get('alpha') || '0.05', { min: 0, max: 1 }),
    confidenceLevel: parseNumber('confidence-level', get('confidence-level') || '0.95', {
      min: 0.5,
      max: 0.9999
    }),
    mode: modeRaw as Mode,
    bootstrapSamples: parseNumber('bootstrap-samples', get('bootstrap-samples') || '10000', {
      min: 100,
      max: 1_000_000,
      integer: true
    }),
    seed: parseNumber('seed', get('seed') || '1234', { min: 0, integer: true }),
    topRegressions: parseNumber('top-regressions', get('top-regressions') || '5', {
      min: 0,
      integer: true
    })
  }
  const latency = optionalNumber('max-latency-p95-increase', get('max-latency-p95-increase'), 0)
  if (latency !== undefined) config.maxLatencyP95Increase = latency
  const cost = optionalNumber('max-cost-increase', get('max-cost-increase'), 0)
  if (cost !== undefined) config.maxCostIncrease = cost

  const runIdRaw = get('baseline-artifact-run-id').trim()
  const inputs: ActionInputs = {
    resultsPath,
    baselinePath,
    baselineArtifact,
    baselineArtifactBranch: get('baseline-artifact-branch').trim(),
    failOnRegression: parseBoolean('fail-on-regression', get('fail-on-regression'), true),
    commentOnPr: parseBoolean('comment-on-pr', get('comment-on-pr'), false),
    githubToken: get('github-token').trim(),
    reportPath: get('report-path').trim(),
    title: get('title').trim() || 'LLM evaluation gate',
    config
  }
  if (runIdRaw !== '') {
    inputs.baselineArtifactRunId = parseNumber('baseline-artifact-run-id', runIdRaw, {
      min: 1,
      integer: true
    })
  }
  return inputs
}

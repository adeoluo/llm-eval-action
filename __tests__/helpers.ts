import type { ExampleRecord, GateConfig, ResultSet } from '../src/types'

export function resultSet(source: string, records: ExampleRecord[]): ResultSet {
  return { source, records: new Map(records.map((r) => [r.id, r])) }
}

export function config(overrides: Partial<GateConfig> = {}): GateConfig {
  return {
    metrics: [],
    maxDrop: {},
    defaultMaxDrop: 0,
    lowerIsBetter: new Set(),
    alpha: 0.05,
    confidenceLevel: 0.95,
    mode: 'significance',
    bootstrapSamples: 2000,
    seed: 1234,
    topRegressions: 5,
    ...overrides
  }
}

export function inputReader(values: Record<string, string>): (name: string) => string {
  return (name) => values[name] ?? ''
}

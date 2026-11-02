/** Renders docs/sample-report.md from the regression fixture with the default settings. */
import { readFileSync, writeFileSync } from 'node:fs'
import { analyze } from '../src/analyze'
import { parseInputs } from '../src/inputs'
import { parseResults } from '../src/parse'
import { renderReport } from '../src/report'

const values: Record<string, string> = {
  results: '__fixtures__/candidate-regression.jsonl',
  baseline: '__fixtures__/baseline.jsonl',
  'max-drop': '0.01',
  'max-latency-p95-increase': '0.2'
}
const inputs = parseInputs((name) => values[name] ?? '')
const load = (file: string) => parseResults(readFileSync(file, 'utf8'), file)
const result = analyze(load(inputs.baselinePath), load(inputs.resultsPath), inputs.config)
writeFileSync('docs/sample-report.md', renderReport(result, inputs.title))
console.log(`passed=${result.passed} regressed=${result.regressedMetrics.join(',')}`)

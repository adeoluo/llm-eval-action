import type { AnalysisResult, MetricResult } from './types'

export function formatNumber(value: number, digits = 4): string {
  if (Number.isNaN(value)) return 'n/a'
  if (!Number.isFinite(value)) return value > 0 ? 'inf' : '-inf'
  const fixed = value.toFixed(digits)
  return fixed === `-${(0).toFixed(digits)}` ? (0).toFixed(digits) : fixed
}

export function formatSigned(value: number, digits = 4): string {
  const text = formatNumber(value, digits)
  return value > 0 && Number.isFinite(value) ? `+${text}` : text
}

export function formatPValue(p: number): string {
  if (p < 0.0001) return '< 0.0001'
  return p.toFixed(4)
}

export function formatPercent(change: number | null): string {
  if (change === null) return 'n/a'
  const text = (change * 100).toFixed(1)
  return change > 0 ? `+${text}%` : `${text === '-0.0' ? '0.0' : text}%`
}

function escapeCell(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
}

function statusCell(metric: MetricResult, mode: AnalysisResult['config']['mode']): string {
  if (metric.regressed) return ':x: regression'
  if (metric.drop > metric.maxDrop && mode === 'significance')
    return ':warning: drop, not significant'
  if (metric.drop < 0) return ':white_check_mark: improved'
  return ':white_check_mark: pass'
}

function testCell(metric: MetricResult): string {
  if (metric.mcnemar !== undefined) {
    return `McNemar exact (${metric.mcnemar.regressions} lost, ${metric.mcnemar.improvements} gained)`
  }
  return 'paired t'
}

export function renderReport(result: AnalysisResult, title = 'LLM evaluation gate'): string {
  const { config } = result
  const lines: string[] = []
  const verdict = result.passed ? ':white_check_mark: passed' : ':x: failed'
  lines.push(`## ${escapeCell(title)}: ${verdict}`, '')
  const modeText =
    config.mode === 'significance'
      ? `significance (fail when a drop exceeds the allowed drop and p < ${config.alpha})`
      : 'threshold (fail when a drop exceeds the allowed drop)'
  const ciLabel = `${Math.round(config.confidenceLevel * 1000) / 10}% CI`
  lines.push(
    `**Mode:** ${modeText}  `,
    `**Baseline:** \`${escapeCell(result.baselineSource)}\` (${result.alignment.baselineCount} examples)  `,
    `**Candidate:** \`${escapeCell(result.candidateSource)}\` (${result.alignment.candidateCount} examples)  `,
    `**Aligned by id:** ${result.alignment.shared} examples; bootstrap ${config.bootstrapSamples} resamples, seed ${config.seed}`,
    ''
  )

  lines.push(
    `| Metric | n | Baseline | Candidate | Delta | ${ciLabel} | p-value | Test | Cohen's d | Allowed drop | Status |`,
    '|---|---:|---:|---:|---:|---|---:|---|---:|---:|---|'
  )
  for (const m of result.metrics) {
    const name = m.higherIsBetter ? m.metric : `${m.metric} (lower is better)`
    lines.push(
      `| ${escapeCell(name)} | ${m.n} | ${formatNumber(m.baselineMean)} | ${formatNumber(m.candidateMean)} | ${formatSigned(m.delta)} | [${formatSigned(m.ciLow)}, ${formatSigned(m.ciHigh)}] | ${formatPValue(m.pValue)} | ${testCell(m)} | ${m.cohensD === null ? 'n/a' : formatSigned(m.cohensD, 2)} | ${formatNumber(m.maxDrop)} | ${statusCell(m, config.mode)} |`
    )
  }
  lines.push('')

  if (result.latency !== null || result.cost !== null) {
    lines.push(
      '### Latency and cost',
      '',
      '| Measure | n | Baseline | Candidate | Change |',
      '|---|---:|---:|---:|---:|'
    )
    if (result.latency !== null) {
      const l = result.latency
      lines.push(
        `| Latency p50 (ms) | ${l.n} | ${formatNumber(l.baseline.p50, 1)} | ${formatNumber(l.candidate.p50, 1)} | ${formatPercent(l.p50Change)} |`,
        `| Latency p95 (ms) | ${l.n} | ${formatNumber(l.baseline.p95, 1)} | ${formatNumber(l.candidate.p95, 1)} | ${formatPercent(l.p95Change)} |`
      )
    }
    if (result.cost !== null) {
      const c = result.cost
      lines.push(
        `| Total cost (USD) | ${c.n} | ${formatNumber(c.baselineTotal)} | ${formatNumber(c.candidateTotal)} | ${formatPercent(c.totalChange)} |`,
        `| Mean cost per example (USD) | ${c.n} | ${formatNumber(c.baselineMean, 6)} | ${formatNumber(c.candidateMean, 6)} | ${formatPercent(c.totalChange)} |`
      )
    }
    lines.push('')
  }

  if (result.extraChecks.length > 0) {
    lines.push(
      '### Budget checks',
      '',
      '| Check | Limit | Observed | Status |',
      '|---|---:|---:|---|'
    )
    for (const check of result.extraChecks) {
      lines.push(
        `| ${check.name} | ${formatPercent(check.limit)} | ${formatPercent(check.observed)} | ${check.passed ? ':white_check_mark: pass' : ':x: fail'} |`
      )
    }
    lines.push('')
  }

  if (result.regressions.length > 0) {
    lines.push(
      '<details>',
      `<summary>Largest per-example regressions (top ${result.regressions.length})</summary>`,
      '',
      '| Example id | Metric | Baseline | Candidate | Delta |',
      '|---|---|---:|---:|---:|'
    )
    for (const r of result.regressions) {
      lines.push(
        `| \`${escapeCell(r.id)}\` | ${escapeCell(r.metric)} | ${formatNumber(r.baseline)} | ${formatNumber(r.candidate)} | ${formatSigned(r.delta)} |`
      )
    }
    lines.push('', '</details>', '')
  }

  const { onlyBaseline, onlyCandidate } = result.alignment
  if (onlyBaseline.length > 0 || onlyCandidate.length > 0) {
    const preview = (ids: string[]): string =>
      ids.length === 0
        ? 'none'
        : ids
            .slice(0, 10)
            .map((id) => `\`${escapeCell(id)}\``)
            .join(', ') + (ids.length > 10 ? `, and ${ids.length - 10} more` : '')
    lines.push(
      `> **Unaligned examples were excluded.** Only in baseline (${onlyBaseline.length}): ${preview(onlyBaseline)}. Only in candidate (${onlyCandidate.length}): ${preview(onlyCandidate)}.`,
      ''
    )
  }

  lines.push(
    `<sub>Delta is candidate minus baseline. The ${ciLabel} is a seeded paired bootstrap of the mean difference. ` +
      'Binary metrics use the exact McNemar test; other metrics use a paired t-test. ' +
      `Cohen's d is the paired effect size (mean difference over its standard deviation). Generated by llm-eval-action.</sub>`,
    ''
  )
  return lines.join('\n')
}

export function deltasJson(result: AnalysisResult): string {
  const out: Record<string, unknown> = {}
  for (const m of result.metrics) {
    out[m.metric] = {
      n: m.n,
      baseline: m.baselineMean,
      candidate: m.candidateMean,
      delta: m.delta,
      ci_low: m.ciLow,
      ci_high: m.ciHigh,
      p_value: m.pValue,
      test: m.test,
      cohens_d: m.cohensD,
      max_drop: m.maxDrop,
      regressed: m.regressed
    }
  }
  return JSON.stringify(out)
}

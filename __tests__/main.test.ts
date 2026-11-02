import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { ArtifactApi } from '../src/artifact'
import { run, type PullRequestTarget, type Runtime } from '../src/main'

interface FakeRuntime extends Runtime {
  outputs: Record<string, string>
  failed: string[]
  warnings: string[]
  infos: string[]
  written: Record<string, string>
  summaries: string[]
}

function fakeRuntime(
  inputs: Record<string, string>,
  overrides: Partial<Runtime> = {},
  summaryAvailable = true
): FakeRuntime {
  const rt: FakeRuntime = {
    outputs: {},
    failed: [],
    warnings: [],
    infos: [],
    written: {},
    summaries: [],
    getInput: (name) => inputs[name] ?? '',
    setOutput(name, value) {
      rt.outputs[name] = value
    },
    setFailed(message) {
      rt.failed.push(message)
    },
    info(message) {
      rt.infos.push(message)
    },
    warning(message) {
      rt.warnings.push(message)
    },
    readFile: (filePath) => readFile(filePath, 'utf8'),
    async writeFile(filePath, content) {
      rt.written[filePath] = content
    },
    async writeSummary(markdown) {
      if (!summaryAvailable) return false
      rt.summaries.push(markdown)
      return true
    },
    env: { RUNNER_TEMP: 'runner-temp', GITHUB_WORKSPACE: '.' },
    artifactApi: () => {
      throw new Error('artifact API not expected')
    },
    pullRequest: () => null,
    ...overrides
  }
  return rt
}

const BASE = '__fixtures__/baseline.jsonl'

describe('run', () => {
  it('passes, writes the summary and report, and sets outputs', async () => {
    const rt = fakeRuntime({
      results: '__fixtures__/candidate-pass.jsonl',
      baseline: BASE,
      'max-drop': '0.01'
    })
    const result = await run(rt)
    expect(result?.passed).toBe(true)
    expect(rt.failed).toEqual([])
    expect(rt.outputs.passed).toBe('true')
    expect(rt.outputs.outcome).toBe('pass')
    expect(rt.outputs['regressed-metrics']).toBe('')
    expect(rt.outputs['report-path']).toBe(path.join('runner-temp', 'llm-eval-report.md'))
    expect(JSON.parse(rt.outputs.deltas ?? '{}')).toHaveProperty('f1')
    expect(rt.summaries[0]).toContain(':white_check_mark: passed')
    expect(rt.written[path.join('runner-temp', 'llm-eval-report.md')]).toBe(rt.summaries[0])
    expect(rt.infos).toContain('No evaluation regression detected')
  })

  it('fails the step on regression', async () => {
    const rt = fakeRuntime({
      results: '__fixtures__/candidate-regression.jsonl',
      baseline: BASE,
      'report-path': 'r.md'
    })
    await run(rt)
    expect(rt.outputs.passed).toBe('false')
    expect(rt.outputs.outcome).toBe('fail')
    expect(rt.outputs['regressed-metrics']).toBe('exact_match,f1')
    expect(rt.outputs['report-path']).toBe('r.md')
    expect(rt.failed).toEqual(['Evaluation regression detected: exact_match, f1'])
  })

  it('names failing budget checks and only warns when fail-on-regression is false', async () => {
    const rt = fakeRuntime({
      results: '__fixtures__/candidate-regression.jsonl',
      baseline: BASE,
      metrics: 'f1',
      'max-drop': '1',
      'max-latency-p95-increase': '0.1',
      'fail-on-regression': 'false'
    })
    await run(rt)
    expect(rt.failed).toEqual([])
    expect(rt.warnings.at(-1)).toBe(
      'Evaluation regression detected: latency p95 increase (fail-on-regression is false)'
    )
  })

  it('prints the report to the log when no job summary is available and warns on unaligned ids', async () => {
    const rt = fakeRuntime(
      {
        results: '__fixtures__/harness-candidate.json',
        baseline: '__fixtures__/harness-baseline.json'
      },
      {},
      false
    )
    await run(rt)
    expect(rt.infos.some((m) => m.startsWith('## LLM evaluation gate'))).toBe(true)

    const partial = fakeRuntime(
      { results: BASE, baseline: '__fixtures__/candidate-pass.jsonl' },
      {
        readFile: async (p) => {
          const text = await readFile(p, 'utf8')
          return p === BASE ? text.split('\n').slice(0, 150).join('\n') : text
        }
      }
    )
    await run(partial)
    expect(partial.warnings[0]).toBe(
      '50 baseline and 0 candidate examples have no counterpart and were excluded'
    )
  })

  it('reports input and file errors through setFailed', async () => {
    const missing = fakeRuntime({ results: 'nope.jsonl', baseline: BASE })
    expect(await run(missing)).toBeUndefined()
    expect(missing.failed[0]).toMatch(/ENOENT/)

    const bad = fakeRuntime({ results: BASE })
    await run(bad)
    expect(bad.failed[0]).toMatch(/set "baseline"/)

    const thrown = fakeRuntime(
      { results: BASE, baseline: BASE },
      {
        readFile: async () => {
          throw 'plain string failure'
        }
      }
    )
    await run(thrown)
    expect(thrown.failed).toEqual(['plain string failure'])
  })

  it('downloads the baseline from an artifact', async () => {
    const artifactApi: ArtifactApi = {
      findInRun: vi.fn(async (_n: string, runId: number) => ({ artifactId: 1, runId })),
      findLatest: vi.fn(async () => ({ artifactId: 2, runId: 3 })),
      download: vi.fn(async () => undefined)
    }
    const factory = vi.fn(() => artifactApi)
    const readSpy = vi.fn((p: string) =>
      readFile(p.includes('llm-eval-baseline') ? BASE : p, 'utf8')
    )
    const rt = fakeRuntime(
      {
        results: '__fixtures__/candidate-pass.jsonl',
        baseline: 'baseline.jsonl',
        'baseline-artifact': 'eval-baseline',
        'baseline-artifact-run-id': '77',
        'github-token': 'tok'
      },
      { artifactApi: factory, readFile: readSpy }
    )
    await run(rt)
    expect(factory).toHaveBeenCalledWith('tok')
    expect(artifactApi.findInRun).toHaveBeenCalledWith('eval-baseline', 77)
    expect(readSpy).toHaveBeenCalledWith(
      path.join('runner-temp', 'llm-eval-baseline', 'baseline.jsonl')
    )
    expect(rt.outputs.passed).toBe('true')

    const latest = fakeRuntime(
      {
        results: '__fixtures__/candidate-pass.jsonl',
        baseline: 'baseline.jsonl',
        'baseline-artifact': 'eval-baseline'
      },
      { artifactApi: () => artifactApi, readFile: readSpy, env: {} }
    )
    await run(latest)
    expect(artifactApi.findLatest).toHaveBeenCalledWith('eval-baseline', '')
    expect(latest.failed).toEqual([])
  })

  describe('pull request comments', () => {
    const inputs = {
      results: '__fixtures__/candidate-pass.jsonl',
      baseline: BASE,
      'comment-on-pr': 'true',
      'github-token': 't'
    }

    it('upserts a comment on pull requests', async () => {
      const target: PullRequestTarget = {
        issueNumber: 12,
        api: {
          list: vi.fn(async () => []),
          create: vi.fn(async () => undefined),
          update: vi.fn(async () => undefined)
        }
      }
      const rt = fakeRuntime(inputs, { pullRequest: () => target })
      await run(rt)
      expect(target.api.create).toHaveBeenCalledOnce()
      expect(rt.infos).toContain('Report comment created on pull request #12')
    })

    it('skips outside pull requests', async () => {
      const rt = fakeRuntime(inputs)
      await run(rt)
      expect(rt.infos.some((m) => m.includes('not for a pull request'))).toBe(true)
    })

    it('warns instead of failing when commenting is not permitted', async () => {
      const rt = fakeRuntime(inputs, {
        pullRequest: () => ({
          issueNumber: 1,
          api: {
            list: async () => {
              throw new Error('Resource not accessible by integration')
            },
            create: async () => undefined,
            update: async () => undefined
          }
        })
      })
      await run(rt)
      expect(rt.failed).toEqual([])
      expect(rt.warnings[0]).toMatch(/Resource not accessible.*pull-requests: write/)
    })

    it('is off by default', async () => {
      const pullRequest = vi.fn(() => null)
      await run(fakeRuntime({ results: inputs.results, baseline: BASE }, { pullRequest }))
      expect(pullRequest).not.toHaveBeenCalled()
    })
  })
})

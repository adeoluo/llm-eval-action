import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  context: {
    repo: { owner: 'octo', repo: 'evals' },
    payload: {} as Record<string, unknown>
  },
  octokit: {
    paginate: vi.fn(),
    rest: {
      actions: { listArtifactsForRepo: vi.fn() },
      issues: { listComments: vi.fn(), createComment: vi.fn(), updateComment: vi.fn() }
    }
  },
  artifactClient: { getArtifact: vi.fn(), downloadArtifact: vi.fn() },
  core: {
    getInput: vi.fn(),
    setOutput: vi.fn(),
    setFailed: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    summary: { addRaw: vi.fn(), write: vi.fn() }
  }
}))

vi.mock('@actions/github', () => ({
  context: mocks.context,
  getOctokit: vi.fn(() => mocks.octokit)
}))
vi.mock('@actions/artifact', () => ({
  DefaultArtifactClient: vi.fn(function DefaultArtifactClient() {
    return mocks.artifactClient
  })
}))
vi.mock('@actions/core', () => mocks.core)

const { createArtifactApi, defaultRuntime, pullRequestTarget } = await import('../src/runtime')

const scratch = path.join(process.cwd(), '.test-output', 'runtime')

describe('createArtifactApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.context.payload = { repository: { default_branch: 'main' } }
  })

  it('finds an artifact in a given run', async () => {
    mocks.artifactClient.getArtifact.mockResolvedValue({ artifact: { id: 42 } })
    const api = createArtifactApi('tok')
    expect(await api.findInRun('base', 9)).toEqual({ artifactId: 42, runId: 9 })
    expect(mocks.artifactClient.getArtifact).toHaveBeenCalledWith('base', {
      findBy: { token: 'tok', workflowRunId: 9, repositoryOwner: 'octo', repositoryName: 'evals' }
    })
    mocks.artifactClient.getArtifact.mockRejectedValue(new Error('not found'))
    expect(await api.findInRun('base', 9)).toBeNull()
  })

  it('picks the newest unexpired artifact on the default branch', async () => {
    mocks.octokit.rest.actions.listArtifactsForRepo.mockResolvedValue({
      data: {
        artifacts: [
          { id: 1, expired: true, workflow_run: { id: 10, head_branch: 'main' } },
          { id: 2, expired: false, workflow_run: { id: 11, head_branch: 'feature' } },
          { id: 3, expired: false, workflow_run: { id: 12, head_branch: 'main' } }
        ]
      }
    })
    const api = createArtifactApi('tok')
    expect(await api.findLatest('base', '')).toEqual({ artifactId: 3, runId: 12 })
    expect(await api.findLatest('base', 'feature')).toEqual({ artifactId: 2, runId: 11 })
    expect(await api.findLatest('base', 'other')).toBeNull()
    mocks.context.payload = {}
    expect(await api.findLatest('base', '')).toEqual({ artifactId: 2, runId: 11 })
  })

  it('downloads into the destination', async () => {
    const api = createArtifactApi('tok')
    await api.download({ artifactId: 5, runId: 6 }, scratch)
    expect(mocks.artifactClient.downloadArtifact).toHaveBeenCalledWith(5, {
      path: scratch,
      findBy: { token: 'tok', workflowRunId: 6, repositoryOwner: 'octo', repositoryName: 'evals' }
    })
    rmSync(scratch, { recursive: true, force: true })
  })

  it('requires a token for REST calls', async () => {
    await expect(createArtifactApi('').findLatest('base', '')).rejects.toThrow(/github-token/)
  })
})

describe('pullRequestTarget', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns null outside pull requests', () => {
    mocks.context.payload = {}
    expect(pullRequestTarget('tok')).toBeNull()
  })

  it('wraps the issues API', async () => {
    mocks.context.payload = { pull_request: { number: 8 } }
    mocks.octokit.paginate.mockResolvedValue([{ id: 1, body: 'x' }])
    const target = pullRequestTarget('tok')
    expect(target?.issueNumber).toBe(8)
    expect(await target?.api.list(8)).toEqual([{ id: 1, body: 'x' }])
    await target?.api.create(8, 'hello')
    await target?.api.update(3, 'edited')
    expect(mocks.octokit.rest.issues.createComment).toHaveBeenCalledWith({
      owner: 'octo',
      repo: 'evals',
      issue_number: 8,
      body: 'hello'
    })
    expect(mocks.octokit.rest.issues.updateComment).toHaveBeenCalledWith({
      owner: 'octo',
      repo: 'evals',
      comment_id: 3,
      body: 'edited'
    })
  })
})

describe('defaultRuntime', () => {
  const original = process.env.GITHUB_STEP_SUMMARY
  beforeEach(() => {
    vi.clearAllMocks()
    rmSync(scratch, { recursive: true, force: true })
  })
  afterEach(() => {
    if (original === undefined) delete process.env.GITHUB_STEP_SUMMARY
    else process.env.GITHUB_STEP_SUMMARY = original
    rmSync(scratch, { recursive: true, force: true })
  })

  it('delegates to @actions/core', () => {
    const rt = defaultRuntime()
    mocks.core.getInput.mockReturnValue('v')
    expect(rt.getInput('x')).toBe('v')
    rt.setOutput('a', 'b')
    rt.setFailed('boom')
    rt.info('i')
    rt.warning('w')
    expect(mocks.core.setOutput).toHaveBeenCalledWith('a', 'b')
    expect(mocks.core.setFailed).toHaveBeenCalledWith('boom')
    expect(mocks.core.info).toHaveBeenCalledWith('i')
    expect(mocks.core.warning).toHaveBeenCalledWith('w')
    expect(rt.env).toBe(process.env)
    expect(rt.artifactApi).toBe(createArtifactApi)
    expect(rt.pullRequest).toBe(pullRequestTarget)
  })

  it('reads and writes files, creating parent directories', async () => {
    const rt = defaultRuntime()
    const file = path.join(scratch, 'deep', 'report.md')
    await rt.writeFile(file, 'content')
    expect(readFileSync(file, 'utf8')).toBe('content')
    mkdirSync(scratch, { recursive: true })
    writeFileSync(path.join(scratch, 'in.txt'), 'data')
    expect(await rt.readFile(path.join(scratch, 'in.txt'))).toBe('data')
  })

  it('writes the job summary only when GITHUB_STEP_SUMMARY is set', async () => {
    const rt = defaultRuntime()
    delete process.env.GITHUB_STEP_SUMMARY
    expect(await rt.writeSummary('# hi')).toBe(false)
    process.env.GITHUB_STEP_SUMMARY = 'summary.md'
    mocks.core.summary.addRaw.mockReturnValue(mocks.core.summary)
    expect(await rt.writeSummary('# hi')).toBe(true)
    expect(mocks.core.summary.addRaw).toHaveBeenCalledWith('# hi', true)
    expect(mocks.core.summary.write).toHaveBeenCalled()
  })
})

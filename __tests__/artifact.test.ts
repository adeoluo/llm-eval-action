import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ArtifactError, downloadBaseline, type ArtifactApi } from '../src/artifact'

const root = path.join(process.cwd(), '.test-output', 'artifact')

function api(
  files: string[],
  found = true
): ArtifactApi & Record<string, ReturnType<typeof vi.fn>> {
  return {
    findInRun: vi.fn(async (_name: string, runId: number) =>
      found ? { artifactId: 11, runId } : null
    ),
    findLatest: vi.fn(async () => (found ? { artifactId: 22, runId: 33 } : null)),
    download: vi.fn(async (_ref, destination: string) => {
      for (const file of files) {
        const full = path.join(destination, file)
        mkdirSync(path.dirname(full), { recursive: true })
        writeFileSync(full, '{}')
      }
    })
  }
}

describe('downloadBaseline', () => {
  beforeEach(() => rmSync(root, { recursive: true, force: true }))
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('finds the single results file when no path is given (latest artifact)', async () => {
    const fake = api(['nested/results.jsonl', 'notes.txt'])
    const file = await downloadBaseline(fake, {
      name: 'base',
      branch: 'main',
      destination: root,
      relativePath: ''
    })
    expect(file).toBe(path.join(root, 'nested', 'results.jsonl'))
    expect(fake.findLatest).toHaveBeenCalledWith('base', 'main')
    expect(fake.download).toHaveBeenCalledWith({ artifactId: 22, runId: 33 }, root)
  })

  it('uses the given run id and relative path', async () => {
    const fake = api(['a.json', 'b.json'])
    const file = await downloadBaseline(fake, {
      name: 'base',
      runId: 5,
      branch: '',
      destination: root,
      relativePath: 'b.json'
    })
    expect(file).toBe(path.join(root, 'b.json'))
    expect(fake.findInRun).toHaveBeenCalledWith('base', 5)
  })

  it('refuses to guess between several results files', async () => {
    await expect(
      downloadBaseline(api(['a.json', 'b.jsonl']), {
        name: 'base',
        branch: '',
        destination: root,
        relativePath: ''
      })
    ).rejects.toThrow(/found 2/)
  })

  it.each([
    [{ runId: 4, branch: '' }, /workflow run 4/],
    [{ branch: 'main' }, /branch "main"/],
    [{ branch: '' }, /this repository/]
  ])('reports a missing artifact %j', async (scope, message) => {
    const promise = downloadBaseline(api([], false), {
      name: 'base',
      destination: root,
      relativePath: '',
      ...scope
    })
    await expect(promise).rejects.toThrow(ArtifactError)
    await expect(
      downloadBaseline(api([], false), {
        name: 'base',
        destination: root,
        relativePath: '',
        ...scope
      })
    ).rejects.toThrow(message)
  })
})

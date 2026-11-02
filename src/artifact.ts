import { readdir } from 'node:fs/promises'
import path from 'node:path'

export interface ArtifactRef {
  artifactId: number
  runId: number
}

export interface ArtifactApi {
  /** Artifact with this name in a specific workflow run. */
  findInRun(name: string, runId: number): Promise<ArtifactRef | null>
  /** Newest unexpired artifact with this name, optionally restricted to a branch. */
  findLatest(name: string, branch: string): Promise<ArtifactRef | null>
  /** Downloads and extracts the artifact into destination. */
  download(ref: ArtifactRef, destination: string): Promise<void>
}

export class ArtifactError extends Error {
  override name = 'ArtifactError'
}

export interface BaselineArtifactRequest {
  name: string
  runId?: number
  branch: string
  destination: string
  /** Path of the results file inside the artifact; empty means "the only JSON/JSONL file". */
  relativePath: string
}

async function findSingleResultsFile(directory: string): Promise<string> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true })
  const files = entries
    .filter((entry) => entry.isFile() && /\.(jsonl?|ndjson)$/i.test(entry.name))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort()
  if (files.length !== 1) {
    throw new ArtifactError(
      `expected exactly one .json or .jsonl file in the baseline artifact, found ${files.length}; set "baseline" to choose one`
    )
  }
  return files[0] as string
}

export async function downloadBaseline(
  api: ArtifactApi,
  request: BaselineArtifactRequest
): Promise<string> {
  const ref =
    request.runId !== undefined
      ? await api.findInRun(request.name, request.runId)
      : await api.findLatest(request.name, request.branch)
  if (ref === null) {
    const scope =
      request.runId !== undefined
        ? `workflow run ${request.runId}`
        : request.branch
          ? `branch "${request.branch}"`
          : 'this repository'
    throw new ArtifactError(`no unexpired artifact named "${request.name}" found for ${scope}`)
  }
  await api.download(ref, request.destination)
  if (request.relativePath !== '') return path.join(request.destination, request.relativePath)
  return findSingleResultsFile(request.destination)
}

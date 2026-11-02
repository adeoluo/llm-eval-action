import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { DefaultArtifactClient } from '@actions/artifact'
import * as core from '@actions/core'
import { context, getOctokit } from '@actions/github'
import type { ArtifactApi } from './artifact'
import type { PullRequestTarget, Runtime } from './main'

function octokitFor(token: string): ReturnType<typeof getOctokit> {
  if (token === '') throw new Error('input "github-token" is empty')
  return getOctokit(token)
}

export function createArtifactApi(token: string): ArtifactApi {
  const { owner, repo } = context.repo
  const client = new DefaultArtifactClient()
  const findBy = (workflowRunId: number) => ({
    token,
    workflowRunId,
    repositoryOwner: owner,
    repositoryName: repo
  })
  return {
    async findInRun(name, runId) {
      try {
        const { artifact } = await client.getArtifact(name, { findBy: findBy(runId) })
        return { artifactId: artifact.id, runId }
      } catch {
        return null
      }
    },
    async findLatest(name, branch) {
      const octokit = octokitFor(token)
      const { data } = await octokit.rest.actions.listArtifactsForRepo({
        owner,
        repo,
        name,
        per_page: 100
      })
      const wanted =
        branch || (context.payload.repository?.default_branch as string | undefined) || ''
      const match = data.artifacts.find(
        (artifact) =>
          !artifact.expired &&
          artifact.workflow_run?.id !== undefined &&
          (wanted === '' || artifact.workflow_run.head_branch === wanted)
      )
      if (match?.workflow_run?.id === undefined) return null
      return { artifactId: match.id, runId: match.workflow_run.id }
    },
    async download(ref, destination) {
      await mkdir(destination, { recursive: true })
      await client.downloadArtifact(ref.artifactId, {
        path: destination,
        findBy: findBy(ref.runId)
      })
    }
  }
}

export function pullRequestTarget(token: string): PullRequestTarget | null {
  const number = context.payload.pull_request?.number
  if (number === undefined) return null
  const octokit = octokitFor(token)
  const { owner, repo } = context.repo
  return {
    issueNumber: number,
    api: {
      async list(issueNumber) {
        return octokit.paginate(octokit.rest.issues.listComments, {
          owner,
          repo,
          issue_number: issueNumber,
          per_page: 100
        })
      },
      async create(issueNumber, body) {
        await octokit.rest.issues.createComment({ owner, repo, issue_number: issueNumber, body })
      },
      async update(commentId, body) {
        await octokit.rest.issues.updateComment({ owner, repo, comment_id: commentId, body })
      }
    }
  }
}

export function defaultRuntime(): Runtime {
  return {
    getInput: (name) => core.getInput(name),
    setOutput: (name, value) => core.setOutput(name, value),
    setFailed: (message) => core.setFailed(message),
    info: (message) => core.info(message),
    warning: (message) => core.warning(message),
    readFile: (filePath) => readFile(filePath, 'utf8'),
    async writeFile(filePath, content) {
      await mkdir(path.dirname(path.resolve(filePath)), { recursive: true })
      await writeFile(filePath, content, 'utf8')
    },
    async writeSummary(markdown) {
      if (!process.env.GITHUB_STEP_SUMMARY) return false
      await core.summary.addRaw(markdown, true).write()
      return true
    },
    env: process.env,
    artifactApi: createArtifactApi,
    pullRequest: pullRequestTarget
  }
}

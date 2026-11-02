import path from 'node:path'
import { analyze } from './analyze'
import { downloadBaseline, type ArtifactApi } from './artifact'
import { upsertComment, type CommentApi } from './comment'
import { parseInputs } from './inputs'
import { parseResults } from './parse'
import { deltasJson, renderReport } from './report'
import type { AnalysisResult } from './types'

export interface PullRequestTarget {
  api: CommentApi
  issueNumber: number
}

export interface Runtime {
  getInput(name: string): string
  setOutput(name: string, value: string): void
  setFailed(message: string): void
  info(message: string): void
  warning(message: string): void
  readFile(filePath: string): Promise<string>
  writeFile(filePath: string, content: string): Promise<void>
  /** Appends Markdown to the job summary; returns false when no summary file is available. */
  writeSummary(markdown: string): Promise<boolean>
  env: Record<string, string | undefined>
  artifactApi(token: string): ArtifactApi
  /** Returns the pull request to comment on, or null outside pull request events. */
  pullRequest(token: string): PullRequestTarget | null
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function run(rt: Runtime): Promise<AnalysisResult | undefined> {
  try {
    const inputs = parseInputs((name) => rt.getInput(name))
    const workspace = rt.env.GITHUB_WORKSPACE ?? process.cwd()
    const temp = rt.env.RUNNER_TEMP ?? workspace

    let baselinePath = inputs.baselinePath
    if (inputs.baselineArtifact !== '') {
      const destination = path.join(temp, 'llm-eval-baseline')
      const request = {
        name: inputs.baselineArtifact,
        branch: inputs.baselineArtifactBranch,
        destination,
        relativePath: inputs.baselinePath
      }
      baselinePath = await downloadBaseline(
        rt.artifactApi(inputs.githubToken),
        inputs.baselineArtifactRunId === undefined
          ? request
          : { ...request, runId: inputs.baselineArtifactRunId }
      )
      rt.info(`Downloaded baseline artifact "${inputs.baselineArtifact}" to ${baselinePath}`)
    }

    const baseline = parseResults(await rt.readFile(baselinePath), baselinePath)
    const candidate = parseResults(await rt.readFile(inputs.resultsPath), inputs.resultsPath)
    const result = analyze(baseline, candidate, inputs.config)
    const { onlyBaseline, onlyCandidate } = result.alignment
    if (onlyBaseline.length > 0 || onlyCandidate.length > 0) {
      rt.warning(
        `${onlyBaseline.length} baseline and ${onlyCandidate.length} candidate examples have no counterpart and were excluded`
      )
    }

    const report = renderReport(result, inputs.title)
    const reportPath = inputs.reportPath || path.join(temp, 'llm-eval-report.md')
    await rt.writeFile(reportPath, report)
    if (!(await rt.writeSummary(report))) rt.info(report)

    rt.setOutput('passed', String(result.passed))
    rt.setOutput('outcome', result.passed ? 'pass' : 'fail')
    rt.setOutput('report-path', reportPath)
    rt.setOutput('deltas', deltasJson(result))
    rt.setOutput('regressed-metrics', result.regressedMetrics.join(','))

    if (inputs.commentOnPr) {
      try {
        const target = rt.pullRequest(inputs.githubToken)
        if (target === null) {
          rt.info(
            'comment-on-pr is enabled but this run is not for a pull request; skipping comment'
          )
        } else {
          const action = await upsertComment(target.api, target.issueNumber, report, inputs.title)
          rt.info(`Report comment ${action} on pull request #${target.issueNumber}`)
        }
      } catch (error) {
        rt.warning(
          `Could not comment on the pull request (${errorMessage(error)}). The token needs "pull-requests: write"; pull requests from forks get a read-only token.`
        )
      }
    }

    if (!result.passed) {
      const failures = [
        ...result.regressedMetrics,
        ...result.extraChecks.filter((check) => !check.passed).map((check) => check.name)
      ]
      const message = `Evaluation regression detected: ${failures.join(', ')}`
      if (inputs.failOnRegression) rt.setFailed(message)
      else rt.warning(`${message} (fail-on-regression is false)`)
    } else {
      rt.info('No evaluation regression detected')
    }
    return result
  } catch (error) {
    rt.setFailed(errorMessage(error))
    return undefined
  }
}

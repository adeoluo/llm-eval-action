# ADR 0004: Least privilege; artifact lookup and comments are opt-in

- Status: accepted
- Date: 2026-11-01

## Context

The action runs inside other people's repositories, often on pull requests from forks.
Asking for broad permissions or personal access tokens makes adoption harder and widens
the impact of a compromised dependency.

## Decision

- The core path (read two files, write the job summary, set outputs) needs only
  `contents: read`.
- Downloading a baseline artifact needs `actions: read` and is used only when
  `baseline-artifact` is set.
- Pull request comments are off by default (`comment-on-pr: false`). When enabled they
  use the workflow's own `GITHUB_TOKEN` and need `pull-requests: write`. A failure to
  comment (for example the read-only token on fork pull requests) is a warning, never a
  failed gate, because the job summary already carries the report.
- One comment per pull request and title, edited in place, identified by a hidden HTML
  marker.

## Consequences

The action never needs a stored secret. Users who want comments on fork pull requests
must use a `pull_request_target` workflow, with the usual care about not checking out and
running untrusted code with a write token. This project does not recommend that setup.

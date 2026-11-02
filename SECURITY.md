# Security Policy

## Reporting a vulnerability

Open a private security advisory on GitHub (Security, then Advisories) or email the
maintainer. Please do not open public issues for vulnerabilities.

## Supported versions

The newest release behind the `v0` tag receives fixes.

## Design notes for users

- The action needs only `contents: read`. `actions: read` is needed only for
  `baseline-artifact`, and `pull-requests: write` only for `comment-on-pr`.
- It uses the workflow's own `GITHUB_TOKEN`; it never needs a personal access token or
  other secret.
- Result files are parsed as data (JSON) and never executed. Report text taken from
  files (ids, metric names, paths) has table delimiters escaped before rendering.
- Pin the action to a full commit SHA if your threat model requires immutable
  dependencies.

## Controls in this repository

- CodeQL (`.github/workflows/codeql.yml`) scans the TypeScript sources.
- GitHub secret scanning is enabled for the public repository.
- Dependencies are locked in `package-lock.json` and installed with `npm ci`.
- CI verifies that the committed `dist/` bundle matches a fresh build of the sources.

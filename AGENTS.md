# AGENTS.md

Working notes for coding agents and contributors in **LLM Eval Action**. The [README](README.md)
explains what the project does and why; this file explains how to change it safely.

## Project

A GitHub Action that gates pull requests on statistically tested LLM evaluation regressions.

## Layout

- `__fixtures__/`: test fixtures
- `__tests__/`: test suite
- `action.yml`: action metadata: inputs, outputs, runtime
- `benchmarks/`: benchmark scripts and recorded results
- `dist/`: compiled action bundle, committed because GitHub Actions runs it directly
- `docs/`: documentation, architecture diagram source and render, design records
- `scripts/`: maintenance scripts (release, assets, data)
- `src/`: library and service source

Key modules:

- `src/align.ts`
- `src/analyze.ts`
- `src/artifact.ts`
- `src/comment.ts`
- `src/index.ts`
- `src/inputs.ts`
- `src/main.ts`
- `src/parse.ts`
- `src/random.ts`: Mulberry32: a small, fast, seedable 32-bit PRNG.
- `src/report.ts`
- `src/runtime.ts`
- `src/stats.ts`
- `src/types.ts`

## Commands

| Command             | Purpose                                                                                               |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| `make help`         | Show this help                                                                                        |
| `make install`      | Install locked dependencies                                                                           |
| `make format`       | Format the sources                                                                                    |
| `make format-check` | Check formatting                                                                                      |
| `make lint`         | Lint with ESLint                                                                                      |
| `make typecheck`    | Type-check with tsc                                                                                   |
| `make test`         | Run the unit tests                                                                                    |
| `make coverage`     | Tests with the coverage gate                                                                          |
| `make build`        | Bundle src/ into dist/index.js                                                                        |
| `make check-dist`   | Fail if dist/ differs from a fresh build                                                              |
| `make bench`        | Reproduce the calibration and runtime tables                                                          |
| `make sample`       | Regenerate docs/sample-report.md                                                                      |
| `make fixtures`     | Regenerate the seeded fixtures                                                                        |
| `make all`          | Everything CI runs                                                                                    |
| `make changelog`    | Regenerate CHANGELOG.md from Conventional Commits (git-cliff)                                         |
| `make cut-release`  | Cut a release locally: version bump, changelog, tag, GitHub release (RELEASE_VERSION=vX.Y.Z optional) |

Run the full local gate (`make all`) before committing; CI runs the same checks.

## Conventions

- Commits follow Conventional Commits (`feat:`, `fix:`, `perf:`, `refactor:`, `docs:`, `test:`, `ci:`, `chore:`).
  The changelog and the next version number are derived from them.
- Every number quoted in the README is produced by a command in this repository. When behavior
  changes, rerun that command and update the number in the same commit.
- When a component is added, removed or renamed, update `docs/architecture/architecture.mmd`
  and re-render `architecture.svg` so the diagram matches the code.
- README sections keep their fixed order. Prose avoids em and en dashes and promotional wording.
- Tests accompany behavior changes; a bug fix comes with a test that fails without it.
- Releases are cut by the maintainer with `make cut-release`, never from CI.

## TypeScript notes

- Node and npm; `npm ci` installs the locked dependencies.
- ESLint and the TypeScript compiler run in strict mode; tests use Vitest.
- Inputs crossing a process boundary are validated with a schema before use.

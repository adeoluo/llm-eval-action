# ADR 0001: TypeScript JavaScript action with a committed rollup bundle

- Status: accepted
- Date: 2026-11-01

## Context

GitHub supports three kinds of actions: Docker container actions, composite actions, and
JavaScript actions. The gate runs on every pull request in consuming repositories, so its
startup time and runner compatibility matter. The statistics must be unit tested.

## Decision

Write the action in TypeScript and run it as a JavaScript action on `node24`. Bundle
`src/` and its dependencies into a single `dist/index.js` with rollup (ES module output)
and commit it, because the runner executes the file from the tagged commit without
installing dependencies. CI rebuilds the bundle and fails when it differs from the
committed one.

## Consequences

- Starts in under a second (0.43 s end to end on the 200-example fixtures, measured
  locally) and runs on Linux, macOS and Windows runners; Docker actions run only on
  Linux and pay an image build or pull.
- No Python or other toolchain is needed on the runner, even when the eval harness that
  produced the results is written in Python.
- The statistics are implemented in TypeScript rather than taken from SciPy. They are
  small (incomplete beta, binomial tail, bootstrap) and are tested against SciPy values.
- Every source change must be followed by `npm run build`; the CI check enforces it.

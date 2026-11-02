# Contributing

## Development setup

Requires Node.js 24 or newer.

```bash
npm ci
make all      # format check, lint, typecheck, tests with coverage gate, build
```

## Workflow

1. Branch from `main` (`feat/...`, `fix/...`, `docs/...`).
2. Use Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).
3. **Rebuild and commit `dist/`** after changing anything in `src/` (`npm run build`). The
   runner executes `dist/index.js` directly, and CI fails if it is out of date.
4. Keep pull requests focused; CI and the self-test workflow must be green before merge.

## Changing the statistics

Every statistical routine in `src/stats.ts` is tested against an external reference
(SciPy, NumPy or a closed form). Add the reference value and how it was computed to the
test when you add or change one. Rerun `npm run bench` and update the README tables if
results change.

## Fixtures

`__fixtures__/*.jsonl` and `harness-baseline.json` / `harness-candidate.json` are produced by
`npx tsx scripts/generate-fixtures.ts` (seeded). `harness-cli-*.json` are real outputs of
`evaluation-harness run --json`.

## Releases

Maintainers tag releases by hand: `vX.Y.Z` on the release commit, and the moving major
tag (`v0` while at 0.x) is moved to the same commit.

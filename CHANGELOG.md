# Changelog

All notable changes are listed here. The project follows semantic versioning; while it is
at 0.x, minor versions may change inputs.

## [0.1.0] - 2026-11-01

### Added

- Paired comparison of per-example results aligned by id, for JSONL, JSON arrays,
  `{examples}` objects and evaluation-harness reports.
- Exact McNemar test for binary metrics, paired t-test for continuous metrics, seeded
  paired bootstrap confidence intervals, Cohen's d_z.
- `significance` and `threshold` gating modes, per-metric `max-drop`, `lower-is-better`.
- Latency p50/p95 and cost deltas with optional budgets.
- Markdown report in the job summary, outputs `passed`, `outcome`, `report-path`,
  `deltas`, `regressed-metrics`.
- Baseline from a workflow artifact; optional pull request comment.

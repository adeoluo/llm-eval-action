# ADR 0002: Paired tests chosen by metric type, plus a paired bootstrap interval

- Status: accepted
- Date: 2026-11-01

## Context

The baseline and the candidate are scored on the same examples. Treating the two runs as
independent samples (for example a two-proportion z-test) ignores that pairing and
overstates the noise, so real regressions go undetected. Metrics come in two kinds:
binary per-example outcomes (exact match, pass@1, judge pass/fail) and continuous scores
(F1, ROUGE, judge ratings).

## Decision

- Align examples by id and work with paired differences.
- Binary metrics (all values 0 or 1 in both runs): exact McNemar test, a binomial test on
  the discordant pairs. It is exact for any `n`, including the small counts typical of
  hand-built eval sets, where the chi-square approximation is unreliable.
- Continuous metrics: paired t-test on the differences.
- Every metric: a percentile paired bootstrap interval for the mean difference, seeded so
  that reports are reproducible, and Cohen's d_z as the effect size.

## Alternatives considered

- **Bootstrap p-value for every metric.** Consistent with the interval, but it is a Monte
  Carlo estimate that cannot resolve very small p-values and cannot be checked against
  closed-form reference values in tests.
- **Permutation (sign-flip) test.** Assumption-light, but also Monte Carlo; a candidate
  for an optional input later.
- **Wilcoxon signed-rank.** Better for ordinal scores; listed in the roadmap.

## Consequences

The p-value (which decides the verdict) and the bootstrap interval come from different
procedures and can disagree near the boundary. The report labels the test used for each
metric, and the limitations section of the README says so.

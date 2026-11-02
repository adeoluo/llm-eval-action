# ADR 0003: Significance mode is the default; max-drop is also a minimum effect size

- Status: accepted
- Date: 2026-11-01

## Context

Teams want a gate that blocks real regressions without blocking unchanged pull requests.
The calibration study in the README shows that failing on any drop (`threshold` mode,
`max-drop: 0`) flags 43 to 49% of unchanged pull requests, and that the false positive
rate of a fixed allowance depends on the size of the eval set.

## Decision

- Two modes. `significance` (default): a metric regresses when its drop exceeds
  `max-drop` and the paired test gives `p < alpha`. `threshold`: a metric regresses when
  its drop exceeds `max-drop`.
- `max-drop` defaults to 0. In significance mode it acts as a minimum effect size: on very
  large eval sets a statistically significant but negligible drop can be allowed by
  setting it.
- Tests are two-sided, and only drops count as regressions, so the false positive rate
  for "flagged as a regression" under no change is about `alpha / 2`.
- A drop beyond `max-drop` that is not significant is shown as a warning in the report.

## Consequences

Small eval sets have low power in significance mode, which the README states with
measured numbers. Users who need every point to count choose `threshold` mode.

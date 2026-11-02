import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../src/random'
import {
  cohensDz,
  isBinary,
  logGamma,
  mcnemarExact,
  mcnemarExactP,
  mean,
  pairedBootstrapCi,
  pairedDifferences,
  pairedTTest,
  quantile,
  regularizedIncompleteBeta,
  sampleSd,
  studentTTwoSidedP
} from '../src/stats'

// Reference values below were computed with SciPy 1.x / NumPy (see README "Testing").
const BASE = [0.62, 0.71, 0.55, 0.8, 0.67, 0.9, 0.48, 0.73]
const CAND = [0.6, 0.75, 0.5, 0.7, 0.66, 0.84, 0.41, 0.7]

describe('mulberry32', () => {
  it('is deterministic for a seed and stays in [0, 1)', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const xs = Array.from({ length: 1000 }, () => a())
    expect(xs).toEqual(Array.from({ length: 1000 }, () => b()))
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...xs)).toBeLessThan(1)
    expect(mean(xs)).toBeCloseTo(0.5, 1)
  })

  it('differs across seeds', () => {
    expect(mulberry32(1)()).not.toEqual(mulberry32(2)())
  })
})

describe('descriptive statistics', () => {
  it('computes mean and sample SD', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5)
    expect(Number.isNaN(mean([]))).toBe(true)
    expect(sampleSd([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.13809, 5)
    expect(sampleSd([3])).toBe(0)
  })

  it('matches NumPy linear quantiles', () => {
    expect(quantile([1, 2, 3, 4, 10], 0.5)).toBe(3)
    expect(quantile([1, 2, 3, 4, 10], 0.95)).toBeCloseTo(8.8, 12)
    expect(quantile([10, 1, 4, 3, 2], 0.25)).toBe(2)
    expect(Number.isNaN(quantile([], 0.5))).toBe(true)
    expect(() => quantile([1], 1.5)).toThrow(RangeError)
  })

  it('pairs differences and rejects unequal lengths', () => {
    expect(pairedDifferences([1, 2], [3, 1])).toEqual([2, -1])
    expect(() => pairedDifferences([1], [1, 2])).toThrow(RangeError)
  })

  it('detects binary vectors', () => {
    expect(isBinary([0, 1, 1, 0])).toBe(true)
    expect(isBinary([0, 0.5])).toBe(false)
  })
})

describe('special functions', () => {
  it('logGamma matches known values', () => {
    expect(logGamma(10.5)).toBeCloseTo(13.940625219403762, 10)
    expect(logGamma(0.3)).toBeCloseTo(1.0957979948180754, 10)
    expect(logGamma(5)).toBeCloseTo(Math.log(24), 12)
  })

  it('regularized incomplete beta matches SciPy betainc', () => {
    expect(regularizedIncompleteBeta(0.4, 2.5, 3.5)).toBeCloseTo(0.4869041915261173, 10)
    expect(regularizedIncompleteBeta(0.9, 2.5, 3.5)).toBeCloseTo(
      1 - regularizedIncompleteBeta(0.1, 3.5, 2.5),
      12
    )
    expect(regularizedIncompleteBeta(0, 1, 1)).toBe(0)
    expect(regularizedIncompleteBeta(1, 1, 1)).toBe(1)
  })

  it('Student t two-sided p-values match closed forms and SciPy', () => {
    expect(studentTTwoSidedP(1, 1)).toBeCloseTo(0.5, 12)
    expect(studentTTwoSidedP(1, 2)).toBeCloseTo(1 - 1 / Math.sqrt(3), 12)
    expect(studentTTwoSidedP(2.5, 10)).toBeCloseTo(0.03144684423660882, 10)
    expect(studentTTwoSidedP(1.96, 1000)).toBeCloseTo(0.05027318495574869, 10)
    expect(studentTTwoSidedP(-0.3, 3)).toBeCloseTo(0.783763292039919, 10)
    expect(studentTTwoSidedP(Infinity, 5)).toBe(0)
  })
})

describe('paired t-test', () => {
  it('matches scipy.stats.ttest_rel', () => {
    const result = pairedTTest(pairedDifferences(BASE, CAND))
    expect(result.df).toBe(7)
    expect(result.t).toBeCloseTo(-2.485250608738542, 10)
    expect(result.pValue).toBeCloseTo(0.0418868139372642, 10)
  })

  it('handles degenerate inputs', () => {
    expect(pairedTTest([0.5]).pValue).toBe(1)
    expect(pairedTTest([0, 0, 0]).pValue).toBe(1)
    const constant = pairedTTest([-0.1, -0.1, -0.1])
    expect(constant.pValue).toBe(0)
    expect(constant.t).toBe(-Infinity)
    expect(pairedTTest([0.2, 0.2]).t).toBe(Infinity)
  })
})

describe('McNemar exact test', () => {
  it('matches a hand-computed case: b = 10, c = 2', () => {
    // Discordant pairs n = 12. Two-sided p = 2 * P(X <= 2), X ~ Binomial(12, 1/2)
    // = 2 * (C(12,0) + C(12,1) + C(12,2)) / 2^12 = 2 * (1 + 12 + 66) / 4096 = 158 / 4096.
    expect(mcnemarExactP(10, 2)).toBeCloseTo(158 / 4096, 15)
    expect(mcnemarExactP(2, 10)).toBeCloseTo(0.03857421875, 15)
  })

  it('matches scipy binomtest for b = 19, c = 2 and caps at 1', () => {
    expect(mcnemarExactP(19, 2)).toBeCloseTo(0.00022125244140625, 15)
    expect(mcnemarExactP(5, 5)).toBe(1)
    expect(mcnemarExactP(0, 0)).toBe(1)
  })

  it('uses log-space terms for more than 1000 discordant pairs', () => {
    const p = mcnemarExactP(480, 620)
    expect(p / 2.7131381093006898e-5).toBeCloseTo(1, 8)
  })

  it('counts discordant pairs from paired vectors', () => {
    const baseline = [1, 1, 1, 0, 0, 1, 1]
    const candidate = [0, 0, 1, 1, 0, 0, 1]
    const result = mcnemarExact(baseline, candidate)
    expect(result.regressions).toBe(3)
    expect(result.improvements).toBe(1)
    // n = 4, k = 1: 2 * (1 + 4) / 16 = 0.625
    expect(result.pValue).toBeCloseTo(0.625, 15)
  })
})

describe("Cohen's d (paired)", () => {
  it('equals mean difference over SD of differences', () => {
    expect(cohensDz(pairedDifferences(BASE, CAND))).toBeCloseTo(-0.878668779193509, 10)
  })

  it('is null when undefined', () => {
    expect(cohensDz([1])).toBeNull()
    expect(cohensDz([0.1, 0.1])).toBeNull()
  })
})

describe('paired bootstrap CI', () => {
  const diffs = pairedDifferences(BASE, CAND)
  const options = { samples: 5000, seed: 7, confidenceLevel: 0.95 }

  it('is reproducible for a fixed seed', () => {
    expect(pairedBootstrapCi(diffs, options)).toEqual(pairedBootstrapCi(diffs, options))
  })

  it('brackets the observed mean and lies within the data range', () => {
    const [lo, hi] = pairedBootstrapCi(diffs, options)
    const m = mean(diffs)
    expect(lo).toBeLessThan(m)
    expect(hi).toBeGreaterThan(m)
    expect(lo).toBeGreaterThanOrEqual(Math.min(...diffs))
    expect(hi).toBeLessThanOrEqual(Math.max(...diffs))
    expect(hi).toBeLessThan(0)
  })

  it('approximates the normal-theory interval for a large sample', () => {
    const rand = mulberry32(99)
    const big = Array.from({ length: 2000 }, () => rand() - 0.45)
    const [lo, hi] = pairedBootstrapCi(big, { samples: 4000, seed: 1, confidenceLevel: 0.95 })
    const se = sampleSd(big) / Math.sqrt(big.length)
    expect(hi - lo).toBeCloseTo(2 * 1.96 * se, 2)
  })

  it('is narrower at a lower confidence level, collapses for constants, and handles empty input', () => {
    const [lo95, hi95] = pairedBootstrapCi(diffs, options)
    const [lo80, hi80] = pairedBootstrapCi(diffs, { ...options, confidenceLevel: 0.8 })
    expect(hi80 - lo80).toBeLessThan(hi95 - lo95)
    expect(pairedBootstrapCi([0.25, 0.25, 0.25], options)).toEqual([0.25, 0.25])
    expect(pairedBootstrapCi([], options).every(Number.isNaN)).toBe(true)
  })
})

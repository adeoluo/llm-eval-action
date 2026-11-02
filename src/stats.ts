import { mulberry32 } from './random'

export function mean(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN
  let sum = 0
  for (const v of values) sum += v
  return sum / values.length
}

/** Sample standard deviation (n - 1 denominator). */
export function sampleSd(values: readonly number[]): number {
  if (values.length < 2) return 0
  const m = mean(values)
  let ss = 0
  for (const v of values) ss += (v - m) ** 2
  return Math.sqrt(ss / (values.length - 1))
}

/** Quantile with linear interpolation between order statistics (NumPy's default method). */
export function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) return Number.NaN
  if (q < 0 || q > 1) throw new RangeError(`quantile q must be in [0, 1], got ${q}`)
  const sorted = [...values].sort((a, b) => a - b)
  return quantileSorted(sorted, q)
}

function quantileSorted(sorted: readonly number[], q: number): number {
  const h = (sorted.length - 1) * q
  const lo = Math.floor(h)
  const hi = Math.ceil(h)
  const a = sorted[lo] as number
  const b = sorted[hi] as number
  return a + (h - lo) * (b - a)
}

export function pairedDifferences(
  baseline: readonly number[],
  candidate: readonly number[]
): number[] {
  if (baseline.length !== candidate.length) {
    throw new RangeError('paired samples must have equal length')
  }
  return candidate.map((c, i) => c - (baseline[i] as number))
}

export interface BootstrapOptions {
  samples: number
  seed: number
  confidenceLevel: number
}

/**
 * Percentile confidence interval for the mean paired difference (candidate - baseline).
 * Resamples example indices with replacement so each draw keeps baseline and candidate
 * scores for the same example together.
 */
export function pairedBootstrapCi(
  differences: readonly number[],
  { samples, seed, confidenceLevel }: BootstrapOptions
): [number, number] {
  const n = differences.length
  if (n === 0) return [Number.NaN, Number.NaN]
  const rand = mulberry32(seed)
  const means = new Float64Array(samples)
  for (let s = 0; s < samples; s++) {
    let sum = 0
    for (let i = 0; i < n; i++) sum += differences[Math.floor(rand() * n)] as number
    means[s] = sum / n
  }
  means.sort()
  const tail = (1 - confidenceLevel) / 2
  const sorted = Array.from(means)
  return [quantileSorted(sorted, tail), quantileSorted(sorted, 1 - tail)]
}

const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7
]

export function logGamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x)
  const z = x - 1
  let a = LANCZOS[0] as number
  const t = z + 7.5
  for (let i = 1; i < 9; i++) a += (LANCZOS[i] as number) / (z + i)
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a)
}

function betaContinuedFraction(x: number, a: number, b: number): number {
  const maxIter = 300
  const eps = 3e-16
  const fpmin = 1e-300
  const qab = a + b
  const qap = a + 1
  const qam = a - 1
  let c = 1
  let d = 1 - (qab * x) / qap
  if (Math.abs(d) < fpmin) d = fpmin
  d = 1 / d
  let h = d
  for (let m = 1; m <= maxIter; m++) {
    const m2 = 2 * m
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2))
    d = 1 + aa * d
    if (Math.abs(d) < fpmin) d = fpmin
    c = 1 + aa / c
    if (Math.abs(c) < fpmin) c = fpmin
    d = 1 / d
    h *= d * c
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2))
    d = 1 + aa * d
    if (Math.abs(d) < fpmin) d = fpmin
    c = 1 + aa / c
    if (Math.abs(c) < fpmin) c = fpmin
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < eps) break
  }
  return h
}

/** Regularized incomplete beta function I_x(a, b). */
export function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const lnFront =
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x)
  const front = Math.exp(lnFront)
  if (x < (a + 1) / (a + b + 2)) return (front * betaContinuedFraction(x, a, b)) / a
  return 1 - (front * betaContinuedFraction(1 - x, b, a)) / b
}

/** Two-sided p-value of Student's t statistic with df degrees of freedom. */
export function studentTTwoSidedP(t: number, df: number): number {
  if (!Number.isFinite(t)) return 0
  return regularizedIncompleteBeta(df / (df + t * t), df / 2, 0.5)
}

/** Treats an SD that is pure floating-point noise relative to the mean as zero. */
function isNegligible(sd: number, m: number): boolean {
  return sd <= 1e-12 * Math.max(1, Math.abs(m))
}

export interface PairedTTest {
  t: number
  df: number
  pValue: number
}

export function pairedTTest(differences: readonly number[]): PairedTTest {
  const n = differences.length
  if (n < 2) return { t: 0, df: Math.max(n - 1, 0), pValue: 1 }
  const m = mean(differences)
  const sd = sampleSd(differences)
  const df = n - 1
  if (isNegligible(sd, m)) {
    return m === 0 ? { t: 0, df, pValue: 1 } : { t: m > 0 ? Infinity : -Infinity, df, pValue: 0 }
  }
  const t = m / (sd / Math.sqrt(n))
  return { t, df, pValue: studentTTwoSidedP(t, df) }
}

function logChoose(n: number, k: number): number {
  return logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1)
}

export interface McNemarResult {
  /** Discordant pairs where baseline passed and candidate failed. */
  regressions: number
  /** Discordant pairs where baseline failed and candidate passed. */
  improvements: number
  pValue: number
}

/**
 * Exact (binomial) McNemar test on paired binary outcomes. Under the null the discordant
 * pairs split as Binomial(b + c, 1/2); the two-sided p-value doubles the smaller tail.
 */
export function mcnemarExact(
  baseline: readonly number[],
  candidate: readonly number[]
): McNemarResult {
  let regressions = 0
  let improvements = 0
  baseline.forEach((b, i) => {
    const c = candidate[i] as number
    if (b === 1 && c === 0) regressions++
    else if (b === 0 && c === 1) improvements++
  })
  return { regressions, improvements, pValue: mcnemarExactP(regressions, improvements) }
}

export function mcnemarExactP(b: number, c: number): number {
  const n = b + c
  if (n === 0) return 1
  const k = Math.min(b, c)
  let tail = 0
  if (n <= 1000) {
    // Exact recurrence C(n, i + 1) = C(n, i) * (n - i) / (i + 1), scaled by 2^-n.
    let term = 2 ** -n
    for (let i = 0; i <= k; i++) {
      tail += term
      term = (term * (n - i)) / (i + 1)
    }
  } else {
    for (let i = 0; i <= k; i++) tail += Math.exp(logChoose(n, i) - n * Math.LN2)
  }
  return Math.min(1, 2 * tail)
}

/** Cohen's d for paired samples (d_z): mean difference over the SD of differences. */
export function cohensDz(differences: readonly number[]): number | null {
  if (differences.length < 2) return null
  const sd = sampleSd(differences)
  if (isNegligible(sd, mean(differences))) return null
  return mean(differences) / sd
}

export function isBinary(values: readonly number[]): boolean {
  return values.every((v) => v === 0 || v === 1)
}

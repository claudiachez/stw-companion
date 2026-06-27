import type {
  TrendBucket, RegimeSleeveKey, RegimeLabel, RegimeRead,
} from '../types/macro';

// ── Regime sleeve weights (Environment Score) ───────────────────────
// GEX is a tactical overlay weighted alongside macro structure — bearish GEX
// downgrades confidence but cannot alone flip Risk-Off when trend + credit hold.
export const SLEEVE_WEIGHTS: Record<RegimeSleeveKey, number> = {
  trend: 0.30,
  volatility: 0.20,
  credit: 0.15,
  rates_dollar: 0.15,
  gex: 0.20,
};

// ── Trend / Market Structure (Module 4) ─────────────────────────────
export interface TrendBucketMeta {
  /** Short label for a row / chip, e.g. "Momentum". */
  label: string;
  /** Group-header label, e.g. "ABOVE 9 · 21 · 200 — MOMENTUM". */
  groupLabel: string;
  /** 0–100 sub-score this bucket contributes to the trend sleeve. */
  score: number;
}

export const TREND_BUCKET_META: Record<TrendBucket, TrendBucketMeta> = {
  momentum:         { label: 'Momentum',           groupLabel: 'ABOVE 9 · 21 · 200 — MOMENTUM',              score: 90 },
  healthy_pullback: { label: 'Healthy Pullback',   groupLabel: 'ABOVE 21 · 200, BELOW 9 — HEALTHY PULLBACK', score: 70 },
  mid_caution:      { label: 'Mid-Term Caution',   groupLabel: 'ABOVE 200, BELOW 9 · 21 — MID-TERM CAUTION', score: 50 },
  bear_rally:       { label: 'Recovery Attempt',   groupLabel: 'BELOW 200, ABOVE 9/21 — BEAR-MARKET RALLY',  score: 35 },
  risk_off:         { label: 'Risk-Off Trend',     groupLabel: 'BELOW 9 · 21 · 200 — RISK-OFF',              score: 10 },
};

export const TREND_BUCKET_ORDER: TrendBucket[] = [
  'momentum', 'healthy_pullback', 'mid_caution', 'bear_rally', 'risk_off',
];

/**
 * Classify a close vs its 9/21/200 MAs into one of the five structure buckets.
 * Returns null when any MA is missing (insufficient history). The key v2 fix is
 * the `bear_rally` bucket: below the 200D but bouncing above 9/21D is NOT bullish.
 */
export function trendBucket(
  close: number | null,
  ma9: number | null,
  ma21: number | null,
  ma200: number | null,
): TrendBucket | null {
  if (close === null || ma9 === null || ma21 === null || ma200 === null) return null;
  const a9 = close > ma9;
  const a21 = close > ma21;
  const a200 = close > ma200;
  if (a200) {
    if (a9 && a21) return 'momentum';
    if (a21 && !a9) return 'healthy_pullback';
    return 'mid_caution'; // above 200 but below 21 (and maybe 9)
  }
  return (a9 || a21) ? 'bear_rally' : 'risk_off';
}

/** Short status word for a 0–100 trend sleeve score (for the score strip / chips). */
export function trendSleeveLabel(score: number | null): string {
  if (score === null) return '—';
  if (score >= 80) return 'Strong';
  if (score >= 60) return 'Constructive';
  if (score >= 45) return 'Caution';
  if (score >= 30) return 'Weak';
  return 'Risk-Off';
}

export function trendSubScore(bucket: TrendBucket | null): number | null {
  return bucket === null ? null : TREND_BUCKET_META[bucket].score;
}

/** Trend sleeve score = average of the active (non-null) per-symbol sub-scores. */
export function trendSleeveScore(buckets: (TrendBucket | null)[]): number | null {
  const scores = buckets.map(trendSubScore).filter((s): s is number => s !== null);
  if (scores.length === 0) return null;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

// ── Environment Score + regime band ─────────────────────────────────
/**
 * Weighted sum of available sleeve scores. A missing sleeve (null) has its
 * weight redistributed proportionally across the present sleeves, so the score
 * stays meaningful while modules are still being built / data is unavailable.
 */
export function environmentScore(
  sleeves: { key: RegimeSleeveKey; score: number | null }[],
): number | null {
  const present = sleeves.filter((s) => s.score !== null);
  if (present.length === 0) return null;
  const totalWeight = present.reduce((a, s) => a + SLEEVE_WEIGHTS[s.key], 0);
  if (totalWeight === 0) return null;
  const sum = present.reduce((a, s) => a + (s.score as number) * SLEEVE_WEIGHTS[s.key], 0);
  return Math.round(sum / totalWeight);
}

const REGIME_BANDS: { min: number; label: RegimeLabel; tradingMode: string }[] = [
  { min: 75, label: 'Risk-On',                  tradingMode: 'Normal sizing, breakouts acceptable, less need for hedges' },
  { min: 60, label: 'Constructive / Selective', tradingMode: 'Favor strongest setups only' },
  { min: 45, label: 'Cautious / Neutral',       tradingMode: 'Reduce chase, wait for reclaim levels, tighter stops' },
  { min: 30, label: 'Defensive',                tradingMode: 'Smaller size, hedges allowed, avoid weak charts' },
  { min: 0,  label: 'Risk-Off',                 tradingMode: 'Capital preservation, mostly cash/hedges, only tactical trades' },
];

export function regimeBand(score: number): RegimeRead {
  const band = REGIME_BANDS.find((b) => score >= b.min) ?? REGIME_BANDS[REGIME_BANDS.length - 1];
  return { score, label: band.label, tradingMode: band.tradingMode };
}

// ── Module 5: Volatility / Stress ───────────────────────────────────
// All sub-scores are 0–100 where HIGHER = LESS stress (more risk-on), so they
// compose with the other risk-on sleeves in the Environment Score.

/** VIX level → calm score. <15 calm, 15–20 normal, 20–25 elevated, >25 severe. */
export function vixScore(vix: number | null): number | null {
  if (vix === null) return null;
  if (vix < 15) return 90;
  if (vix < 20) return 55;
  if (vix < 25) return 30;
  return 10;
}

/** VVIX (vol-of-vol / tail risk) → calm score. <85 calm, 85–100 elevated, >100 fear. */
export function vvixScore(vvix: number | null): number | null {
  if (vvix === null) return null;
  if (vvix < 85) return 85;
  if (vvix < 100) return 50;
  return 20;
}

/** IV-premium ratio (VIX ÷ 30D realized vol) → score. <0.90 calm, 0.90–1.25 normal, >1.25 fear. */
export function ivPremiumScore(ratio: number | null): number | null {
  if (ratio === null) return null;
  if (ratio < 0.90) return 85;
  if (ratio <= 1.25) return 55;
  return 20;
}

/**
 * VIX 5-day direction → score. Falling fast = calming (high), rising fast = fear (low).
 * `delta` is the absolute change in VIX points over ~5 trading days.
 */
export function vixDirectionScore(delta: number | null): number | null {
  if (delta === null) return null;
  if (delta <= -1) return 80;   // falling
  if (delta < 2) return 50;     // roughly flat
  return 20;                    // rising fast
}

/** Volatility / Stress sleeve score = average of the available sub-scores. */
export function volatilityStressScore(parts: (number | null)[]): number | null {
  const present = parts.filter((p): p is number => p !== null);
  if (present.length === 0) return null;
  return Math.round(present.reduce((a, b) => a + b, 0) / present.length);
}

/** Short status word for a 0–100 stress sleeve score (higher = calmer). */
export function stressLabel(score: number | null): string {
  if (score === null) return '—';
  if (score >= 70) return 'Calm';
  if (score >= 45) return 'Normal';
  if (score >= 25) return 'Elevated';
  return 'Stress';
}

/**
 * Percentile rank (0–100) of `value` within `series` — the share of observations
 * at or below it. Lets "VIX 19" read as calm-in-context vs elevated-in-context.
 */
export function percentileRank(value: number, series: number[]): number | null {
  if (series.length === 0) return null;
  const below = series.filter((v) => v <= value).length;
  return Math.round((below / series.length) * 100);
}

// ── Module 6: Credit / Liquidity ────────────────────────────────────
// v1 uses HYG as a credit PROXY (it mixes credit risk with ETF flows + duration;
// ICE BofA HY OAS is the cleaner input, deferred). Higher = credit confirming.

/** HYG vs 50D MA + today's direction → credit score. */
export function creditHygScore(aboveMa50: boolean, rising: boolean): number {
  if (aboveMa50) return rising ? 80 : 60; // confirming / mild caution
  return rising ? 45 : 20;                // stabilizing-mixed / warning
}

export function creditLabel(score: number | null): string {
  if (score === null) return '—';
  if (score >= 70) return 'Confirming';
  if (score >= 50) return 'Mild Caution';
  if (score >= 35) return 'Mixed';
  return 'Warning';
}

// ── Module 7: Rates + Dollar Headwinds ──────────────────────────────
// US10Y is a YIELD, not a price-trend asset. Higher score = less headwind.

/**
 * 10-yr yield score. `delta5` is the 5-day change in yield POINTS (e.g. -0.12 = 12bp drop).
 * Falling yields are NOT always bullish: a fast drop while vol/credit stress is
 * rising is flight-to-safety, scored neutral-low rather than as a growth tailwind.
 */
export function us10yScore(yieldPct: number | null, delta5: number | null, stressRising: boolean): number | null {
  if (yieldPct === null) return null;
  const fallingFast = delta5 !== null && delta5 <= -0.10;
  const falling = delta5 !== null && delta5 < 0;
  const rising = delta5 !== null && delta5 > 0;
  if (fallingFast && stressRising) return 30;        // flight to safety
  if (yieldPct < 4.30) return falling ? 80 : 65;     // tailwind for growth
  if (yieldPct <= 4.50) return 55;                   // neutral / watch
  return rising ? 20 : 35;                           // headwind
}

/** Dollar (UUP) score. Below both 9 & 21D = tailwind; above both = headwind. */
export function uupScore(aboveMa9: boolean, aboveMa21: boolean): number {
  if (!aboveMa9 && !aboveMa21) return 80;
  if (aboveMa9 && aboveMa21) return 20;
  return 50;
}

/** Rates + Dollar sleeve score = average of the available sub-scores. */
export function ratesDollarScore(parts: (number | null)[]): number | null {
  const present = parts.filter((p): p is number => p !== null);
  if (present.length === 0) return null;
  return Math.round(present.reduce((a, b) => a + b, 0) / present.length);
}

export function ratesDollarLabel(score: number | null): string {
  if (score === null) return '—';
  if (score >= 60) return 'Tailwind';
  if (score >= 40) return 'Neutral';
  return 'Headwind';
}

// ── Module 8: GEX / Positioning (tactical overlay) ──────────────────
// The host-authored bias text is free-form; normalize it case-insensitively.

/** GEX bias text → 0–100 score. Bullish 90 · Flat 55 · Conflicted 35 · Bearish 10. */
export function gexScore(bias: string | null | undefined): number | null {
  if (!bias) return null;
  const b = bias.toLowerCase();
  if (b.includes('bull')) return 90;
  if (b.includes('bear')) return 10;
  if (b.includes('conflict') || b.includes('mixed')) return 35;
  return 55; // flat / neutral / unknown
}

/** Canonical one-word label for a GEX bias. */
export function gexBiasLabel(bias: string | null | undefined): string {
  if (!bias) return '—';
  const b = bias.toLowerCase();
  if (b.includes('bull')) return 'Bullish';
  if (b.includes('bear')) return 'Bearish';
  if (b.includes('conflict') || b.includes('mixed')) return 'Conflicted';
  return 'Flat';
}

/** Short trade implication from the bias. */
export function gexImplication(bias: string | null | undefined): string {
  const label = gexBiasLabel(bias);
  switch (label) {
    case 'Bullish':    return 'Breakouts acceptable; dips into support can be bought.';
    case 'Bearish':    return 'Avoid chasing longs until a reclaim above the GEX pivot.';
    case 'Conflicted': return 'Two-sided tape — wait for a level to break before committing.';
    case 'Flat':       return 'Range-bound; fade extremes into the marked levels.';
    default:           return 'No current positioning read.';
  }
}

// ── Module 9: Risk Appetite — Breadth ───────────────────────────────
/** RSP/SPY relative strength → breadth score. Equal-weight leading = the average
 *  stock is confirming the cap-weighted tape (greed); lagging = narrow (fear). */
export function breadthScore(aboveMa: boolean, rising: boolean): number {
  if (aboveMa) return rising ? 80 : 60;
  return rising ? 45 : 25;
}

// ── Realized volatility (promoted from useSentimentGauge) ────────────
/**
 * Annualized 30-day realized volatility (%) from a daily close series:
 *   realizedVol30 = stdev(last 30 ln(close[t]/close[t-1])) · sqrt(252) · 100
 * Needs ≥31 closes (30 log-returns). Used for the IV-premium ratio (VIX ÷ HV).
 */
export function hv30(closes: number[]): number | null {
  if (closes.length < 31) return null;
  const slice = closes.slice(-31);
  const logRets = slice.slice(1).map((c, i) => Math.log(c / slice[i]));
  const mean = logRets.reduce((a, b) => a + b, 0) / logRets.length;
  const variance = logRets.reduce((a, b) => a + (b - mean) ** 2, 0) / logRets.length;
  return Math.sqrt(variance * 252) * 100;
}

import type {
  TrendBucket, RegimeSleeveKey, RegimeLabel, RegimeRead, TrendDirection,
  MacroEvent, EventImportance, EventRiskLevel, EventOverlayState, EventRiskRead,
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

/**
 * Risk Appetite gauge weights (sum to 100%) — the single source of truth
 * shared by the live gauge (useSentimentGauge) and the daily snapshot writer
 * (macro-snapshot.ts), so the persisted 5D/20D trend tracks the same number
 * the gauge displays instead of drifting out of sync.
 */
export const RISK_APPETITE_WEIGHTS = {
  momentum: 0.18,
  vix: 0.16,
  ivPremium: 0.16,
  vvix: 0.12,
  gex: 0.18,
  credit: 0.10,
  breadth: 0.10,
} as const;

export type RiskAppetiteInputs = Partial<Record<keyof typeof RISK_APPETITE_WEIGHTS, number | null>>;

/** Weighted average over whichever inputs are present (missing redistributes); null if none are. */
export function riskAppetiteScore(scores: RiskAppetiteInputs): number | null {
  const keys = Object.keys(RISK_APPETITE_WEIGHTS) as (keyof typeof RISK_APPETITE_WEIGHTS)[];
  const active = keys.filter((k) => scores[k] !== null && scores[k] !== undefined);
  const totalWeight = active.reduce((a, k) => a + RISK_APPETITE_WEIGHTS[k], 0);
  if (active.length === 0 || totalWeight === 0) return null;
  const sum = active.reduce((a, k) => a + (scores[k] as number) * RISK_APPETITE_WEIGHTS[k], 0);
  return Math.round(sum / totalWeight);
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

// ── 5D Trend Engine (P2) ─────────────────────────────────────────────
// Pure direction classifier consumed by useMacroTrendHistory (packages/ui).
// `delta` = score change over the current lookback window (e.g. 5 trading
// days); `priorDelta` = the same-length window immediately before it, used to
// detect a reversal (sign flip) rather than just a continuing trend.

const TREND_FLAT_BAND = 3;   // |delta| below this reads as flat / no clean signal
const TREND_STRONG_BAND = 10; // |delta| at or above this reads as "strong"

/**
 * Classify a score's directional move. A flat-vs-flat or thin signal returns
 * `'flat'` (rendered as "Mixed" in the regime banner) — this is the expected
 * state until enough trading-day history has accrued, not a bug.
 */
export function classifyTrendDirection(
  delta: number | null,
  priorDelta: number | null,
): TrendDirection {
  if (delta === null) return 'flat';
  if (priorDelta !== null) {
    if (priorDelta <= -TREND_FLAT_BAND && delta >= TREND_FLAT_BAND) return 'reversing_up';
    if (priorDelta >= TREND_FLAT_BAND && delta <= -TREND_FLAT_BAND) return 'reversing_down';
  }
  if (delta >= TREND_STRONG_BAND) return 'strong_improvement';
  if (delta >= TREND_FLAT_BAND) return 'improving';
  if (delta <= -TREND_STRONG_BAND) return 'strong_deterioration';
  if (delta <= -TREND_FLAT_BAND) return 'deteriorating';
  return 'flat';
}

/** Banner-level descriptor — collapses the 7 directions to the 5 the spec calls for. */
export function regimeDirectionLabel(direction: TrendDirection): string {
  switch (direction) {
    case 'strong_improvement':
    case 'improving': return 'Improving';
    case 'strong_deterioration':
    case 'deteriorating': return 'Deteriorating';
    case 'reversing_up': return 'Reversing Up';
    case 'reversing_down': return 'Reversing Down';
    default: return 'Mixed';
  }
}

/** Per-row phrase for trend-table badges, e.g. "SPY  Caution  5D ↓ weakening". */
export function trendDirectionPhrase(direction: TrendDirection): string {
  switch (direction) {
    case 'strong_improvement': return 'strong improvement';
    case 'improving': return 'improving';
    case 'strong_deterioration': return 'strong deterioration';
    case 'deteriorating': return 'weakening';
    case 'reversing_up': return 'reversing up';
    case 'reversing_down': return 'reversing down';
    default: return 'flat';
  }
}

/** Arrow glyph for a direction — pairs with `trendDirectionPhrase` in badges. */
export function trendDirectionArrow(direction: TrendDirection): '↑' | '↓' | '→' {
  if (direction === 'strong_improvement' || direction === 'improving' || direction === 'reversing_up') return '↑';
  if (direction === 'strong_deterioration' || direction === 'deteriorating' || direction === 'reversing_down') return '↓';
  return '→';
}

// ── Module 3: Macro Event Risk (P3) ──────────────────────────────────
// Pure classification over a list of scheduled/released calendar events
// (sourced by useMacroEvents/macro-events.ts — MarketWatch primary, FXStreet
// secondary). Never reads an event in isolation for its risk LEVEL — but the
// surrounding setup/market-reaction narrative is composed by the card, not
// here, since this layer has no access to VIX/US10Y/SPY context.
const VERY_HIGH_EVENT_PATTERNS = [
  /\bcpi\b/i, /\bconsumer price index\b/i, /\bpce\b/i, /\bpersonal consumption expenditures\b/i,
  /\bfomc\b/i, /\bfed(?:eral)? (?:interest rate|funds rate) decision\b/i, /\bpowell\b/i,
  /\bnonfarm payrolls\b/i, /\bnfp\b/i, /\bunemployment rate\b/i,
];
const HIGH_EVENT_PATTERNS = [/\bppi\b/i, /\bproducer price index\b/i, /\baverage hourly earnings\b/i];
const MEDIUM_EVENT_PATTERNS = [
  /\bjobless claims\b/i, /\bretail sales\b/i, /\bism manufacturing\b/i, /\bism services\b/i,
  /\btreasury auction\b/i, /\bbond auction\b/i, /\b\d+-(?:year|month|week) (?:note|bond|bill) auction\b/i,
];

/** Classify an event's importance tier from its name, per the spec's events-to-track table. */
export function eventImportance(eventName: string): EventImportance {
  if (VERY_HIGH_EVENT_PATTERNS.some((re) => re.test(eventName))) return 'very_high';
  if (HIGH_EVENT_PATTERNS.some((re) => re.test(eventName))) return 'high';
  if (MEDIUM_EVENT_PATTERNS.some((re) => re.test(eventName))) return 'medium';
  return 'low';
}

/** First numeric token in a calendar print, e.g. "0.4%" → 0.4, "175K" → 175. */
function parseEventValue(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = s.match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

/** actual − consensus, when both parse as numeric; null otherwise (text prints or pre-release). */
export function eventSurprise(actual: string | null, consensus: string | null): number | null {
  const a = parseEventValue(actual);
  const c = parseEventValue(consensus);
  return a === null || c === null ? null : a - c;
}

const EVENT_WATCH_HOURS = 48;
const HIGH_RISK_HOURS = 24;
const REACTION_OVERLAY_HOURS = 72; // ~1-3 trading days; fades after unless structure changed
const SHOCK_RELATIVE_SURPRISE = 0.2; // |surprise| ≥ 20% of |consensus| reads as a meaningful beat/miss

function hoursBetween(aIso: string, bMs: number): number {
  return (new Date(aIso).getTime() - bMs) / 3_600_000;
}

/**
 * Classify the current event-risk overlay from a list of calendar rows.
 * A released event (has `actual`) drives a Reaction Overlay for up to ~3
 * trading days; otherwise the nearest upcoming Very-High/High event sets
 * Event Watch (24-48h out) or High Event Risk (within 24h). No major event
 * within 48h → 'none'/'low'.
 */
export function classifyEventRisk(events: MacroEvent[], now: Date = new Date()): EventRiskRead {
  const nowMs = now.getTime();

  const releasedRecent = events
    .filter((e) => e.actual !== null && e.actual !== '')
    .map((e) => ({ e, ageHours: -hoursBetween(e.releaseTimeEt, nowMs) }))
    .filter((x) => x.ageHours >= 0 && x.ageHours <= REACTION_OVERLAY_HOURS)
    .sort((a, b) => a.ageHours - b.ageHours);

  if (releasedRecent.length > 0) {
    const { e } = releasedRecent[0];
    const surprise = eventSurprise(e.actual, e.consensus);
    const consensusVal = parseEventValue(e.consensus);
    const relSurprise = surprise !== null && consensusVal !== null
      ? Math.abs(surprise) / Math.max(Math.abs(consensusVal), 0.01)
      : null;
    const isShock = relSurprise !== null && relSurprise >= SHOCK_RELATIVE_SURPRISE;
    const riskLevel: EventRiskLevel = isShock ? 'shock' : e.importance === 'very_high' || e.importance === 'high' ? 'high' : 'medium';
    return { overlay: 'reaction_overlay', riskLevel, event: e, surprise };
  }

  const upcoming = events
    .filter((e) => e.actual === null || e.actual === '')
    .map((e) => ({ e, hoursOut: hoursBetween(e.releaseTimeEt, nowMs) }))
    .filter((x) => x.hoursOut >= 0)
    .sort((a, b) => a.hoursOut - b.hoursOut);

  const nextMajor = upcoming.find((x) => x.e.importance === 'very_high' || x.e.importance === 'high');
  if (nextMajor && nextMajor.hoursOut <= HIGH_RISK_HOURS) {
    return { overlay: 'high_event_risk', riskLevel: 'high', event: nextMajor.e, surprise: null };
  }
  if (nextMajor && nextMajor.hoursOut <= EVENT_WATCH_HOURS) {
    return { overlay: 'event_watch', riskLevel: 'medium', event: nextMajor.e, surprise: null };
  }
  const nextAny = upcoming[0] ?? null;
  if (nextAny && nextAny.hoursOut <= EVENT_WATCH_HOURS) {
    return { overlay: 'event_watch', riskLevel: 'medium', event: nextAny.e, surprise: null };
  }
  return { overlay: 'none', riskLevel: 'low', event: nextAny?.e ?? null, surprise: null };
}

/** Status-strip / banner label for an overlay state. */
export function eventOverlayLabel(overlay: EventOverlayState): string {
  switch (overlay) {
    case 'none': return 'No major event risk';
    case 'event_watch': return 'Event Watch';
    case 'high_event_risk': return 'High Event Risk';
    case 'reaction_overlay': return 'Reaction Overlay';
    case 'fading': return 'Fading';
  }
}

/** Display label for an importance tier, e.g. "Very High". */
export function eventImportanceLabel(importance: EventImportance): string {
  switch (importance) {
    case 'very_high': return 'Very High';
    case 'high': return 'High';
    case 'medium': return 'Medium';
    case 'low': return 'Low';
  }
}

// ── Module 11: Sector Rotation ───────────────────────────────────────
// The 11 SPDR sector ETFs, reusing the Module 4 trend-bucket logic (same
// 9/21/200 MA grouping) plus relative strength vs SPY. XLSR (equal-weight
// sector meta-ETF) is intentionally excluded — it derives from the same XL_
// sector data, so including it would double-count rather than add a signal.
export const SECTOR_ETFS: { symbol: string; name: string }[] = [
  { symbol: 'XLK',  name: 'Technology' },
  { symbol: 'XLV',  name: 'Health Care' },
  { symbol: 'XLF',  name: 'Financials' },
  { symbol: 'XLE',  name: 'Energy' },
  { symbol: 'XLI',  name: 'Industrials' },
  { symbol: 'XLY',  name: 'Consumer Discretionary' },
  { symbol: 'XLP',  name: 'Consumer Staples' },
  { symbol: 'XLU',  name: 'Utilities' },
  { symbol: 'XLRE', name: 'Real Estate' },
  { symbol: 'XLB',  name: 'Materials' },
  { symbol: 'XLC',  name: 'Communication Services' },
];

/** Trading-day lookback windows for the RS-vs-SPY columns. */
export const RS_LOOKBACKS = { week: 5, oneMonth: 21, threeMonth: 63, sixMonth: 126, oneYear: 252 } as const;

/**
 * Relative strength of a series vs a benchmark over `lookback` trading days:
 * (seriesReturn − benchmarkReturn) in percentage points. Null if either series
 * doesn't have enough history for that lookback yet.
 */
export function relativeStrength(closes: number[], benchmarkCloses: number[], lookback: number): number | null {
  if (closes.length <= lookback || benchmarkCloses.length <= lookback) return null;
  const now = closes[closes.length - 1];
  const prior = closes[closes.length - 1 - lookback];
  const bNow = benchmarkCloses[benchmarkCloses.length - 1];
  const bPrior = benchmarkCloses[benchmarkCloses.length - 1 - lookback];
  if (!prior || !bPrior) return null;
  const seriesReturn = (now / prior - 1) * 100;
  const benchmarkReturn = (bNow / bPrior - 1) * 100;
  return Math.round((seriesReturn - benchmarkReturn) * 10) / 10;
}

// ── Module 10: AI Recap — weekly key ────────────────────────────────
// Shared by useWeeklyRecap.ts (client read) and macro-recap.ts (server write) so
// both sides agree on which row is "this week"'s without duplicating the format.
export function isoWeekKey(date: Date = new Date()): string {
  const jan1 = new Date(date.getFullYear(), 0, 1);
  const week = Math.ceil(((date.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
  return `${date.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

// ── Module 4: Trend / Market Structure ──────────────────────────────
// The 9/21/200 MA framework lives ONLY here (VIX → Volatility, US10Y → Rates).
export type TrendBucket =
  | 'momentum'
  | 'healthy_pullback'
  | 'mid_caution'
  | 'bear_rally'
  | 'risk_off';

export interface MacroIndicator {
  symbol: string;
  name: string;
  close: number | null;
  chg: number | null;
  chgPct: number | null;
  ma9: number | null;
  ma21: number | null;
  ma200: number | null;
  /** Structure bucket from close vs 9/21/200 MAs; null if insufficient history. */
  bucket: TrendBucket | null;
}

// ── Module scoring (Market Regime) ──────────────────────────────────
/** The five weighted regime sleeves + event risk (which is an overlay, not weighted). */
export type MacroModuleKey =
  | 'trend'
  | 'volatility'
  | 'credit'
  | 'rates_dollar'
  | 'gex'
  | 'event_risk';

/** Only the five sleeves that contribute to the Environment Score. */
export type RegimeSleeveKey = 'trend' | 'volatility' | 'credit' | 'rates_dollar' | 'gex';

/** 5-day acceleration / reversal classification (filled by the trend engine, P2). */
export type TrendDirection =
  | 'strong_improvement'
  | 'improving'
  | 'flat'
  | 'deteriorating'
  | 'strong_deterioration'
  | 'reversing_up'
  | 'reversing_down';

export interface MacroModuleScore {
  key: MacroModuleKey;
  label: string;
  /** 0–100; higher = more risk-on / less stress. null = unavailable. */
  score: number | null;
  /** Short status word for the chip/strip, e.g. "Caution", "Elevated". */
  detail?: string;
  oneDayDelta?: number | null;
  fiveDayDelta?: number | null;
  twentyDayDelta?: number | null;
  trendDirection?: TrendDirection;
}

export type RegimeLabel =
  | 'Risk-On'
  | 'Constructive / Selective'
  | 'Cautious / Neutral'
  | 'Defensive'
  | 'Risk-Off';

export interface RegimeRead {
  score: number;
  label: RegimeLabel;
  /** Plain-language guidance from the trading-mode table. */
  tradingMode: string;
}

// ── Module 3: Macro Event Risk (overlay) ────────────────────────────
// Temporary overlay on the regime read — never a permanent score change.
export type EventImportance = 'low' | 'medium' | 'high' | 'very_high';
export type EventRiskLevel = 'low' | 'medium' | 'high' | 'shock';
export type EventOverlayState = 'none' | 'event_watch' | 'high_event_risk' | 'reaction_overlay' | 'fading';

/** One scheduled/released economic-calendar row (MVP source: MarketWatch, FXStreet as secondary). */
export interface MacroEvent {
  eventName: string;
  /** ISO datetime of the scheduled/actual release, Eastern Time. */
  releaseTimeEt: string;
  /** The period the print covers, e.g. "May 2026". Null if not given. */
  period: string | null;
  actual: string | null;
  consensus: string | null;
  previous: string | null;
  importance: EventImportance;
  /** Where this row was scraped from, e.g. "MarketWatch", "FXStreet". */
  source: string;
  /** When the source page was fetched (ISO) — distinct from the release time itself. */
  sourceTimestamp: string;
}

/** The classified overlay read — which event (if any) is driving it, and how hot. */
export interface EventRiskRead {
  overlay: EventOverlayState;
  riskLevel: EventRiskLevel;
  /** The single most relevant event driving the current overlay; null only when overlay is 'none'. */
  event: MacroEvent | null;
  /** actual − consensus, when both parse as numeric; null otherwise (non-numeric prints, or pre-release). */
  surprise: number | null;
}

// ── Module 9: Risk Appetite gauge ───────────────────────────────────
export interface SentimentInput {
  label: string;
  weight: number;
  score: number | null;
  description: string;
}

export interface SentimentScore {
  total: number | null;
  inputs: SentimentInput[];
}

// ── Module 10: AI Recap / Trading Mode ──────────────────────────────
// A full week-close note + next-week expectations, grounded ONLY in the data
// passed to the generator (no fabricated figures).
export interface MacroRecap {
  /** Punchy hook line — the week's defining contradiction/theme. */
  headline: string;
  /** Main weekly narrative — 2–4 paragraphs, separated by blank lines. */
  verdict: string;
  /** The dominant theme of the week (1–2 paragraphs). */
  bigStory: string;
  /** Bull / base / bear reads for the week ahead. */
  scenarios: { bull: string; base: string; bear: string };
  /** Next-week game plan / expectations (1–2 paragraphs). */
  playbook: string;
  /** Key levels one-liner, e.g. "Watch 7,435 above and 7,339 below." */
  watching: string;
  /** Selective / Defensive / Risk-On … keyed off the regime band. */
  tradingMode: string;
  /** Closing punch line. */
  finalWord: string;
  /** ISO timestamp this recap was generated, attached client-side from the row/response. */
  generatedAt?: string | null;
}

/** A module's read passed to the recap generator. */
export interface RecapModule {
  score: number | null;
  label: string;
  fiveDayDelta?: number | null;
}

export interface RecapLevelSet {
  resistance: number | null;
  gex1: number | null;
  put_support: number | null;
  key_target?: number | null;
  downside_risk?: number | null;
}

/** Grounding context for a richer, non-fabricated narrative. */
export interface MacroRecapContext {
  indicators?: { symbol: string; name: string; bucket: string | null; close: number | null; chgPct: number | null }[];
  volatility?: { vix: number | null; vvix: number | null; ivPremium: number | null } | null;
  riskAppetite?: { total: number | null; inputs: { label: string; score: number | null }[] } | null;
  gex?: {
    bias: string;
    biasNote: string;
    lastUpdated: string;
    spx?: RecapLevelSet | null;
    qqq?: RecapLevelSet | null;
  } | null;
}

/** Request body for the macro-recap Netlify function. */
export interface MacroRecapRequest {
  regime: { score: number | null; label: string; tradingMode: string; fiveDayDelta?: number | null };
  modules: {
    trend: RecapModule;
    volatility: RecapModule;
    credit: RecapModule;
    ratesDollar: RecapModule;
    gex: RecapModule;
  };
  context?: MacroRecapContext;
  eventRisk?: {
    level: string;
    event: string;
    time: string;
    consensus?: string;
    previous?: string;
    overlay?: string;
  } | null;
  /** Optional editor steering text for this regeneration, e.g. "focus more on credit stress". Admin-only. */
  note?: string;
}

// ── Module 11: Sector Rotation ──────────────────────────────────────
export interface SectorRotationRow {
  symbol: string;
  name: string;
  close: number | null;
  ma9: number | null;
  ma21: number | null;
  ma200: number | null;
  bucket: TrendBucket | null;
  /** Relative strength vs SPY (percentage points) over each lookback; null if too little history. */
  rsWeek: number | null;
  rs1M: number | null;
  rs3M: number | null;
  rs6M: number | null;
  rs1Y: number | null;
}

// ── User prefs ──────────────────────────────────────────────────────
export interface MacroPrefs {
  visibleIndicators: string[];
}

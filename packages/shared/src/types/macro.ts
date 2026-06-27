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
export interface MacroEventRisk {
  eventId: string;
  eventName: string;
  importance: 'low' | 'medium' | 'high' | 'very_high';
  releaseTime: string;
  actual?: number | string;
  consensus?: number | string;
  previous?: number | string;
  surprise?: number | string;
  status: 'upcoming' | 'released' | 'reaction_overlay' | 'expired';
  riskLevel: 'low' | 'medium' | 'high' | 'shock';
  marketComment?: string;
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

// ── Module 10: AI Recap ─────────────────────────────────────────────
export interface MacroRecap {
  summary: string;
  keyLevel: number | null;
  keyLevelNote: string;
  bottomLine: string;
}

// ── User prefs ──────────────────────────────────────────────────────
export interface MacroPrefs {
  visibleIndicators: string[];
}

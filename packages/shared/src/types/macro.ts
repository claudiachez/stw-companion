export type MacroSignal = 'bullish' | 'caution' | 'bearish' | 'na';

export type MacroTier = 'momentum' | 'mid-caution' | 'risk-off';

export interface MacroIndicator {
  symbol: string;
  name: string;
  close: number | null;
  chg: number | null;
  chgPct: number | null;
  ma9: number | null;
  ma21: number | null;
  ma200: number | null;
  signal: MacroSignal;
  tier: MacroTier | null;
  /** For US10Y: treat close as yield %, key level 4.5 */
  isYield?: boolean;
}

export type MacroRegime = 'RISK-ON' | 'CAUTIOUS / NEUTRAL' | 'RISK-OFF' | 'LOADING';

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

export interface MacroRecap {
  summary: string;
  keyLevel: number | null;
  keyLevelNote: string;
  bottomLine: string;
}

export interface MacroPrefs {
  visibleIndicators: string[];
}

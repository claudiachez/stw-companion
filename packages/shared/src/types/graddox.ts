export type SignalVerdict = 'green' | 'yellow' | 'red';
// Host-authored bias text is free-form (e.g. 'bullish', 'bearish', 'flat',
// 'conflicted'); the UI normalizes it case-insensitively, so keep this a string.
export type BiasLabel = string;

export interface LevelSet {
  resistance: number | null;
  gex1: number | null;
  put_support: number | null;
  key_target?: number | null;
  downside_risk?: number | null;
  note?: string;
}

export interface Signal {
  trigger: string;
  trade: string;
  exp: string;
  logic: string;
  verdict: SignalVerdict;
}

export interface LogEntry {
  time: string;
  content: string;
}

// One row in the `graddox` table = one day's GEX read. `spx`/`qqq` are JSONB
// LevelSets; `signals`/`log` are JSONB arrays. `spx_price`/`qqq_price` are the
// captured spot at `last_updated` (SPX scale; SPY level cards divide by 10).
export interface GraddoxData {
  id: number;
  date: string;
  last_updated: string;
  bias: BiasLabel;
  bias_note: string;
  spx: LevelSet;
  qqq: LevelSet;
  spx_price: number | null;
  qqq_price: number | null;
  signals: Signal[];
  log: LogEntry[];
}

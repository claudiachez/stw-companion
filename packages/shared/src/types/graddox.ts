export type SignalVerdict = 'green' | 'yellow' | 'red';
export type BiasLabel = 'bullish' | 'bearish' | 'flat' | 'flat-to-up' | 'flat-to-down';

export interface LevelSet {
  resistance: number;
  gex1: number;
  put_support: number;
  key_target?: number;
  downside_risk?: number;
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

export interface GraddoxData {
  date: string;
  last_updated: string;
  bias: BiasLabel;
  bias_note: string;
  spx_price: number | null;
  qqq_price: number | null;
  spx: LevelSet;
  qqq: LevelSet;
  signals: Signal[];
  log: LogEntry[];
}

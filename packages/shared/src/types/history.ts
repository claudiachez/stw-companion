import type { ActionType, ConvictionLevel } from './holding';

export interface HoldingTransaction {
  id: number;
  ticker: string;
  leg: number;
  action: ActionType;
  event_date: string;
  weight: number | null;
  position_detail: string | null;
  price: number | null;
  pnl_pct: number | null;
  notes: string | null;
  created_at: string;
}

export type ConvictionSource = 'discord' | 'streaming' | 'manual';

export interface ConvictionComment {
  id: number;
  ticker: string;
  event_date: string;
  conviction_level: ConvictionLevel;
  comment: string;
  source: ConvictionSource;
  user_id: string | null;
  created_at: string;
}

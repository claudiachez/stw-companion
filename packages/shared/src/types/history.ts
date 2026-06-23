import type { ActionType, ConvictionLevel } from './holding';

// Audit log of holdings weight/action changes. After migration 035 this table is narrowed to
// its core responsibility — `leg`, `position_detail`, `price`, `pnl_pct` are dropped (per-leg
// detail now lives in `legs`/`leg_transactions`).
export interface HoldingTransaction {
  id: number;
  ticker: string;
  /** Owning trader (NOT NULL after migration 026). */
  trader_id: string;
  action: ActionType;
  event_date: string;
  weight: number | null;
  notes: string | null;
  created_at: string;
}

export type ConvictionSource = 'discord' | 'streaming' | 'manual';

export interface ConvictionComment {
  id: number;
  ticker: string;
  /** Owning trader (NOT NULL after migration 026). */
  trader_id: string;
  event_date: string;
  conviction_level: ConvictionLevel;
  comment: string;
  source: ConvictionSource;
  user_id: string | null;
  created_at: string;
}

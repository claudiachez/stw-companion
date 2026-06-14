import type { ActionType, ConvictionLevel } from './holding';
import type { Direction } from '../utils/positions';

export interface HoldingTransaction {
  id: number;
  ticker: string;
  /** Owning trader (NOT NULL after migration 026). */
  trader_id: string;
  leg: number;
  action: ActionType;
  event_date: string;
  weight: number | null;
  position_detail: string | null;
  price: number | null;
  pnl_pct: number | null;
  notes: string | null;
  /** Trade direction override; null = use inferDirection(position_detail). */
  direction?: Direction | null;
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

import { getSupabase } from '../../lib/supabase';
import { getTraderId, STW } from '../traders/api';
import type { HoldingTransaction, ConvictionComment, Direction } from '@stw/shared';

export interface IbkrLeg {
  symbol: string;
  strike: number;
  right: 'C' | 'P';
  expiry: string;
  entry: number;
  price: number | null;
  pnl_pct: number | null;
}

export interface Holding {
  rank: number;
  ticker: string;
  name: string;
  conviction: number;
  basket: string;
  last_action: string;
  action_date: string | null;
  initial_weight: number | null;
  current_weight: number | null;
  position_detail: string | null;
  summary: string | null;
  bullets: string[] | null;
  dd_updated_at: string | null;   // when DD/thesis/conviction was last refreshed (runs + stream)
  updated_at: string | null;
  last_price: number | null;
  last_price_at: string | null;
  last_pnl_pct: number | null;
  last_pnl_at: string | null;
  ibkr_legs: IbkrLeg[] | null;
  exit_price: number | null;
  exit_pnl_pct: number | null;
  direction: Direction | null;
}

export async function fetchHoldings(): Promise<Holding[]> {
  const { data, error } = await getSupabase()
    .from('holdings')
    .select('*')
    .order('rank', { ascending: true });

  if (error) throw error;
  return (data ?? []) as Holding[];
}

export async function fetchHoldingTransactions(ticker: string): Promise<HoldingTransaction[]> {
  const { data, error } = await getSupabase()
    .from('holding_transactions')
    .select('*')
    .eq('ticker', ticker)
    .order('leg', { ascending: true })
    .order('event_date', { ascending: true });

  if (error) throw error;
  return (data ?? []) as HoldingTransaction[];
}

export async function fetchConvictionComments(ticker: string): Promise<ConvictionComment[]> {
  const { data, error } = await getSupabase()
    .from('conviction_comments')
    .select('*')
    .eq('ticker', ticker)
    // Unified Commentary feed is newest-first by when the row was written.
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as ConvictionComment[];
}

// trader_id is stamped here (not in the forms) so the "app writes are STW" rule lives in
// one place. NOT NULL after migration 026.
export async function insertHoldingTransaction(
  row: Omit<HoldingTransaction, 'id' | 'created_at' | 'trader_id'>
): Promise<void> {
  const trader_id = await getTraderId(STW);
  // Idempotent on the dedupe key (migration 036): a manual entry + the routine processing the
  // same event collapse to one row (last write wins) instead of duplicating.
  const { error } = await getSupabase()
    .from('holding_transactions')
    .upsert({ ...row, trader_id }, { onConflict: 'ticker,trader_id,action,event_date' });
  if (error) throw error;
}

export async function insertConvictionComment(
  row: Omit<ConvictionComment, 'id' | 'created_at' | 'trader_id'>
): Promise<void> {
  const trader_id = await getTraderId(STW);
  const { error } = await getSupabase().from('conviction_comments').insert({ ...row, trader_id });
  if (error) throw error;
}

export async function deleteHoldingTransaction(id: number): Promise<void> {
  const { error } = await getSupabase().from('holding_transactions').delete().eq('id', id);
  if (error) throw error;
}

export async function deleteConvictionComment(id: number): Promise<void> {
  const { error } = await getSupabase().from('conviction_comments').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchMaxLeg(ticker: string): Promise<number> {
  const { data, error } = await getSupabase()
    .from('holding_transactions')
    .select('leg')
    .eq('ticker', ticker)
    .order('leg', { ascending: false })
    .limit(1);

  if (error) throw error;
  return data?.[0]?.leg ?? 1;
}

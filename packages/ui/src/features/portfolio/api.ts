import { getSupabase } from '../../lib/supabase';

// Normalize OCC-style option symbols that may still be stored in the DB
// from before the server-side fix: "ADEA  260918C00035000" → "ADEA".
// Safe for clean tickers (no digits → returned as-is).
export function cleanUnderlying(raw: string): string {
  const s = raw.trim();
  if (/\d/.test(s)) {
    const ticker = s.split(/\s+/)[0].replace(/\d.*$/, '');
    if (ticker) return ticker;
  }
  return s;
}

export interface UserPosition {
  id:                 string;
  user_id:            string;
  underlying:         string;
  asset_class:        string;   // 'STK' | 'OPT'
  conid:              string;
  quantity:           number | null;
  avg_cost:           number | null;
  mark_price:         number | null;
  unrealized_pnl:     number | null;
  unrealized_pnl_pct: number | null;
  strike:             number | null;
  put_call:           string | null;
  expiry:             string | null;
  multiplier:         number;
  last_synced_at:     string;
}

export interface IbkrSettings {
  ibkr_flex_token: string | null;
  ibkr_query_id:   string | null;
}

export async function fetchUserPositions(userId: string): Promise<UserPosition[]> {
  const { data, error } = await getSupabase()
    .from('user_positions')
    .select('*')
    .eq('user_id', userId)
    .order('underlying', { ascending: true });
  if (error) throw error;
  return (data ?? []) as UserPosition[];
}

/** A single filled trade from the user's IBKR account (user_executions, append-only log). */
export interface UserExecution {
  id:           string;
  underlying:   string;
  symbol:       string;
  asset_class:  string;        // 'STK' | 'OPT'
  side:         string;        // 'BUY' | 'SELL'
  quantity:     number | null; // signed (sells negative)
  price:        number | null; // fill price
  commission:   number | null;
  strike:       number | null;
  put_call:     string | null;
  expiry:       string | null; // 'yyyyMMdd'
  multiplier:   number;
  executed_at:  string;        // ISO
}

export async function fetchUserExecutions(userId: string): Promise<UserExecution[]> {
  const { data, error } = await getSupabase()
    .from('user_executions')
    .select('id,underlying,symbol,asset_class,side,quantity,price,commission,strike,put_call,expiry,multiplier,executed_at')
    .eq('user_id', userId)
    .order('executed_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as UserExecution[];
}

export async function fetchIbkrSettings(userId: string): Promise<IbkrSettings> {
  const { data, error } = await getSupabase()
    .from('profiles')
    .select('ibkr_flex_token, ibkr_query_id')
    .eq('user_id', userId)
    .single();
  if (error) throw error;
  return data as IbkrSettings;
}

export async function saveIbkrSettings(
  userId: string,
  settings: IbkrSettings,
): Promise<void> {
  const { error } = await getSupabase()
    .from('profiles')
    .update({ ibkr_flex_token: settings.ibkr_flex_token, ibkr_query_id: settings.ibkr_query_id })
    .eq('user_id', userId);
  if (error) throw error;
}

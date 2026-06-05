import { getSupabase } from '../../lib/supabase';

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

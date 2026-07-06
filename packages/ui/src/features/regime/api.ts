import { getSupabase } from '../../lib/supabase';

export interface RegimeDailyRow {
  trading_date: string;
  instrument: string;
  close: number | null;
  sma200: number | null;
  trend_state: 'GREEN' | 'RED' | 'UNKNOWN';
  vix_close: number | null;
  vix3m_close: number | null;
  vol_state: 'GREEN' | 'RED' | 'UNKNOWN';
  engine_version: string;
}

/** Latest `regime_daily` row for a given trend instrument (e.g. STW's proxy, 'IWM'). */
export async function fetchLatestRegime(instrument: string): Promise<RegimeDailyRow | null> {
  const { data, error } = await getSupabase()
    .from('regime_daily')
    .select('trading_date, instrument, close, sma200, trend_state, vix_close, vix3m_close, vol_state, engine_version')
    .eq('instrument', instrument)
    .order('trading_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as RegimeDailyRow | null;
}

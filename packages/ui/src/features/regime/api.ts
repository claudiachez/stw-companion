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
  rv20_annualized: number | null;
  engine_version: string;
}

/** Latest `regime_daily` row for a given trend instrument (e.g. STW's proxy, 'IWM'). */
export async function fetchLatestRegime(instrument: string): Promise<RegimeDailyRow | null> {
  // Require a COMPLETE reading: FRED publishes VIX/VIX3M with a ~1-day lag, so the
  // current day's row lands with price + rv20 but null vix_close/vix3m_close until a
  // later run — grabbing that partial row left the regime light's Vol / Multiplier /
  // VIX / VIX3M blank. Pick the latest row that actually carries the vol inputs.
  const { data, error } = await getSupabase()
    .from('regime_daily')
    .select('trading_date, instrument, close, sma200, trend_state, vix_close, vix3m_close, vol_state, rv20_annualized, engine_version')
    .eq('instrument', instrument)
    .not('vix_close', 'is', null)
    .not('vix3m_close', 'is', null)
    .order('trading_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as RegimeDailyRow | null;
}

import { useQuery } from '@tanstack/react-query';
import { getSupabase } from '../lib/supabase';

// Reads the app_config table (migration 040's split defaults; migration 052's
// ibkr_live_trading_enabled kill switch) — one row per key, value always numeric.
// RLS grants SELECT to all authenticated users; only cc@claudiachez.com may write.
async function fetchAppConfig(): Promise<Record<string, number>> {
  const { data, error } = await getSupabase().from('app_config').select('key, value');
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((row) => [row.key as string, row.value as number]));
}

export function useAppConfig() {
  const { data = {}, isLoading } = useQuery({
    queryKey: ['app_config'],
    queryFn: fetchAppConfig,
    staleTime: 5 * 60 * 1000,
  });

  return {
    config: data,
    loading: isLoading,
    /** Admin-only "Open/Close via IBKR" kill switch (migration 052) — off by default. */
    ibkrLiveTradingEnabled: data.ibkr_live_trading_enabled === 1,
    /** Capital-allocation defaults (migration 053) for the IBKR order modal's quantity suggestion. */
    totalCapital: data.total_capital ?? 0,
    defaultSharesDeployPct: data.default_shares_deploy_pct ?? 0,
    defaultOptionsDeployPct: data.default_options_deploy_pct ?? 0,
  };
}

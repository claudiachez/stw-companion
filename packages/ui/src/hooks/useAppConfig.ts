import { useQuery } from '@tanstack/react-query';
import { SLEEVE_WEIGHTS } from '@stw/shared';
import type { RegimeSleeveKey } from '@stw/shared';
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

  // Market Regime sleeve weights (migration 061), stored as percent integers.
  // Falls back to the hardcoded SLEEVE_WEIGHTS (×100) per-key until seeded, so
  // the regime never breaks on a missing row. environmentScore normalizes by
  // the total, so the percent scale is equivalent to the fraction defaults.
  const regimeWeights: Record<RegimeSleeveKey, number> = {
    trend: data.regime_weight_trend ?? SLEEVE_WEIGHTS.trend * 100,
    volatility: data.regime_weight_volatility ?? SLEEVE_WEIGHTS.volatility * 100,
    credit: data.regime_weight_credit ?? SLEEVE_WEIGHTS.credit * 100,
    rates_dollar: data.regime_weight_rates_dollar ?? SLEEVE_WEIGHTS.rates_dollar * 100,
    gex: data.regime_weight_gex ?? SLEEVE_WEIGHTS.gex * 100,
  };

  return {
    config: data,
    loading: isLoading,
    /** Admin-configurable Market Regime sleeve weights (percent scale). */
    regimeWeights,
    /** Admin-only "Open/Close via IBKR" kill switch (migration 052) — off by default. */
    ibkrLiveTradingEnabled: data.ibkr_live_trading_enabled === 1,
    /** Capital-allocation defaults (migration 053) for the IBKR order modal's quantity suggestion. */
    totalCapital: data.total_capital ?? 0,
    defaultSharesDeployPct: data.default_shares_deploy_pct ?? 0,
    defaultOptionsDeployPct: data.default_options_deploy_pct ?? 0,
  };
}

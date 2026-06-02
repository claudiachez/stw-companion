import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

export type DataFreshness = 'fresh' | 'aging' | 'stale' | 'unknown';

export function getFreshness(d: Date | null): DataFreshness {
  if (!d) return 'unknown';
  const h = (Date.now() - d.getTime()) / 3_600_000;
  if (h < 6) return 'fresh';
  if (h < 48) return 'aging';
  return 'stale';
}

export function useDataStatus() {
  return useQuery({
    queryKey: ['data-status'],
    queryFn: async () => {
      // Prefer last_pnl_at (IBKR sync time) over updated_at (manual edit time)
      const { data } = await supabase
        .from('holdings')
        .select('last_pnl_at, updated_at')
        .order('last_pnl_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .single();
      return data?.last_pnl_at
        ? new Date(data.last_pnl_at)
        : data?.updated_at
        ? new Date(data.updated_at)
        : null;
    },
    staleTime: 5 * 60 * 1000,
  });
}

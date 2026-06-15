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
      // Prefer the newest IBKR leg mark (sync time) over holdings.updated_at (manual edit time).
      const [{ data: mark }, { data: holding }] = await Promise.all([
        supabase
          .from('legs')
          .select('mark_price_at')
          .order('mark_price_at', { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('holdings')
          .select('updated_at')
          .order('updated_at', { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle(),
      ]);
      return mark?.mark_price_at
        ? new Date(mark.mark_price_at)
        : holding?.updated_at
        ? new Date(holding.updated_at)
        : null;
    },
    staleTime: 5 * 60 * 1000,
  });
}

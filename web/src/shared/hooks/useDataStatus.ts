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
      const { data } = await supabase
        .from('holdings')
        .select('updated_at')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();
      return data?.updated_at ? new Date(data.updated_at) : null;
    },
    staleTime: 5 * 60 * 1000,
  });
}

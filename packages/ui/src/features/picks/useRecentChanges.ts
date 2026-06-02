import { useQuery } from '@tanstack/react-query';
import { getSupabase } from '../../lib/supabase';

export interface RecentChange {
  id: number;
  ran_at: string;
  run_type: string;
  summary: string | null;
  digest: string | null;
}

/**
 * Latest portfolio-change digest(s) for the Portfolio Overview panel. Reads the
 * subscriber-safe `recent_changes` view (migration 008), which projects run_log
 * without exposing its admin-only operational columns.
 */
export function useRecentChanges(limit = 1) {
  return useQuery<RecentChange[]>({
    queryKey: ['recent-changes', limit],
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('recent_changes')
        .select('id, ran_at, run_type, summary, digest')
        .order('ran_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as RecentChange[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

import { useQuery } from '@tanstack/react-query';
import { getSupabase } from '../../lib/supabase';

export interface LatestRun {
  ran_at: string;
  run_type: string;
}

/**
 * Newest routine run across ALL run_log rows — including runs that found no new signal (which
 * `recent_changes` hides because it filters `digest IS NOT NULL`). Drives the "last checked"
 * freshness disclosure on the Overview, so an older change date doesn't read as stale data.
 * Reads the subscriber-safe `latest_run` view (migration 044).
 */
export function useLatestRun() {
  return useQuery<LatestRun | null>({
    queryKey: ['latest-run'],
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('latest_run')
        .select('ran_at, run_type')
        .maybeSingle();
      if (error) throw error;
      return (data as LatestRun) ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });
}

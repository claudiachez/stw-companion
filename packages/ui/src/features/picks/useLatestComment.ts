import { useQuery } from '@tanstack/react-query';
import type { ConvictionComment } from '@stw/shared';
import { getSupabase } from '../../lib/supabase';

/**
 * The single most-recent HOST conviction note for a ticker (`user_id IS NULL`), for the
 * "Latest Comments" block. Fed by both Discord and streaming runs (they append
 * conviction_comments rows). Subscribers' personal notes (`user_id != null`) are excluded
 * so a personal note never hijacks the featured slot — they still appear in the history.
 * The featured row's id is passed to ConvictionTimeline's `excludeId` so it isn't shown twice.
 */
export function useLatestComment(ticker: string) {
  return useQuery<ConvictionComment | null>({
    queryKey: ['latest-comment', ticker],
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('conviction_comments')
        .select('*')
        .eq('ticker', ticker)
        .is('user_id', null)
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      return ((data ?? [])[0] as ConvictionComment) ?? null;
    },
    staleTime: 30_000,
    enabled: !!ticker,
  });
}

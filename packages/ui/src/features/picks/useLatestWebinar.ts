import { useQuery } from '@tanstack/react-query';
import { getSupabase } from '../../lib/supabase';

export interface WebinarUpdate {
  /** YYYY-MM-DD of the most recent streaming-sourced conviction batch. */
  eventDate: string;
  /** When that batch was written (newest `created_at` in the batch) — drives the full
   *  `fmtDateTime` "Updated:" stamp on the dashboard. Null if no row carried one. */
  updatedAt: string | null;
  /** Distinct tickers whose conviction note was refreshed in that batch. */
  tickers: string[];
}

/**
 * How recent a webinar batch must be to still surface as "new" on the dashboard.
 * Webinars run a few times a month; after this it stops being a notification and
 * lives on only in each ticker's ConvictionTimeline.
 */
const RECENCY_DAYS = 14;

/**
 * The latest webinar's conviction updates, for the "New Webinar Analysis" banner on
 * the Portfolio Overview. Streaming-sourced public notes (`source='streaming'`,
 * `user_id IS NULL`) are written by the stw-transcripts routine via the summary-archive
 * trigger — one row per holding whose green-card note the webinar refreshed. We take the
 * newest `event_date` and list the tickers in that batch.
 *
 * Note: a position whose summary was *blank* before the webinar isn't archived by the
 * trigger, so a brand-new name introduced in a webinar won't appear here (it surfaces
 * via its "New" action instead). Reads `conviction_comments` directly — already
 * subscriber-readable for public notes (migrations 011/012 RLS).
 */
export function useLatestWebinar() {
  return useQuery<WebinarUpdate | null>({
    queryKey: ['latest-webinar'],
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('conviction_comments')
        .select('ticker, event_date, created_at')
        .eq('source', 'streaming')
        .is('user_id', null)
        .order('event_date', { ascending: false })
        .limit(60);
      if (error) throw error;

      const rows = (data ?? []) as { ticker: string; event_date: string; created_at: string | null }[];
      if (rows.length === 0) return null;

      const eventDate = rows[0].event_date;
      const ageMs = Date.now() - new Date(eventDate + 'T00:00:00').getTime();
      if (ageMs > RECENCY_DAYS * 86_400_000) return null; // older than the recency window

      const batch = rows.filter((r) => r.event_date === eventDate);
      const tickers = Array.from(new Set(batch.map((r) => r.ticker)));
      // Newest write time in the batch — the webinar's ingest moment, shown as the "Updated" stamp.
      const updatedAt = batch.reduce<string | null>((acc, r) => {
        if (!r.created_at) return acc;
        return !acc || r.created_at > acc ? r.created_at : acc;
      }, null);
      return { eventDate, updatedAt, tickers };
    },
    staleTime: 5 * 60 * 1000,
  });
}

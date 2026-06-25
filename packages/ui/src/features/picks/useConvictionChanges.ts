import { useQuery } from '@tanstack/react-query';
import { getSupabase } from '../../lib/supabase';

export type ChangeDir = 'up' | 'down' | 'same' | 'new';

export interface ConvictionChange {
  ticker: string;
  /** Conviction level in the latest batch. */
  level: number;
  /** The level on the most recent comment BEFORE this batch (null = first note for the ticker). */
  prevLevel: number | null;
  dir: ChangeDir;
  /** The batch comment, for a one-line "why" snippet. */
  comment: string;
}

export interface ConvictionBatch {
  /** YYYY-MM-DD of the latest conviction batch (the webinar, falling back to any source). */
  eventDate: string;
  /** Newest write time in the batch → the "Updated:" stamp. */
  updatedAt: string | null;
  /** Per-ticker changes, sorted: upgrades, downgrades, new, then reaffirmed. */
  changes: ConvictionChange[];
  counts: Record<ChangeDir, number>;
}

interface Row {
  ticker: string;
  event_date: string;
  conviction_level: number;
  comment: string;
  created_at: string | null;
  source: string;
}

/** How recent the batch must be to still surface on the Overview (webinars run a few times a month). */
const RECENCY_DAYS = 14;

/**
 * The latest conviction batch, classified by direction — drives the "Conviction Changes" block on
 * the Portfolio Overview. The batch is the newest `event_date` among streaming (webinar) public
 * notes, falling back to any public note. Each ticker's `prevLevel` is the level on its most recent
 * comment from BEFORE that date (across all public sources), so an upgrade/downgrade is a true delta.
 * Reads `conviction_comments` directly (public notes are subscriber-readable; migrations 011/012 RLS).
 */
export function useConvictionChanges() {
  return useQuery<ConvictionBatch | null>({
    queryKey: ['conviction-changes'],
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('conviction_comments')
        .select('ticker, event_date, conviction_level, comment, created_at, source')
        .is('user_id', null)
        .order('event_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(300);
      if (error) throw error;

      const rows = (data ?? []) as Row[];
      if (rows.length === 0) return null;

      // Batch = newest streaming (webinar) event_date; fall back to the newest of any source.
      const eventDate = (rows.find((r) => r.source === 'streaming') ?? rows[0]).event_date;
      const ageMs = Date.now() - new Date(eventDate + 'T00:00:00').getTime();
      if (ageMs > RECENCY_DAYS * 86_400_000) return null;

      // Newest row per ticker within the batch (rows are already event_date/created_at desc).
      const batchSeen = new Set<string>();
      const batch: Row[] = [];
      for (const r of rows) {
        if (r.event_date !== eventDate || batchSeen.has(r.ticker)) continue;
        batchSeen.add(r.ticker);
        batch.push(r);
      }

      const changes: ConvictionChange[] = batch.map((b) => {
        // prior = newest comment for this ticker dated before the batch (any public source).
        const prior = rows.find((r) => r.ticker === b.ticker && r.event_date < eventDate);
        const prevLevel = prior ? prior.conviction_level : null;
        const level = b.conviction_level;
        const dir: ChangeDir =
          prevLevel == null ? 'new' : level > prevLevel ? 'up' : level < prevLevel ? 'down' : 'same';
        return { ticker: b.ticker, level, prevLevel, dir, comment: b.comment };
      });

      const order: Record<ChangeDir, number> = { up: 0, down: 1, new: 2, same: 3 };
      changes.sort((a, b) =>
        order[a.dir] - order[b.dir] || b.level - a.level || a.ticker.localeCompare(b.ticker));

      const counts: Record<ChangeDir, number> = { up: 0, down: 0, new: 0, same: 0 };
      changes.forEach((c) => { counts[c.dir]++; });

      const updatedAt = batch.reduce<string | null>(
        (acc, r) => (r.created_at && (!acc || r.created_at > acc) ? r.created_at : acc), null);

      return { eventDate, updatedAt, changes, counts };
    },
    staleTime: 5 * 60 * 1000,
  });
}

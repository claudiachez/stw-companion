import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSupabase } from '../../lib/supabase';

export type ChangeDir = 'up' | 'down' | 'new' | 'same';

export interface ConvictionChange {
  ticker: string;
  /** Conviction level in the latest batch. */
  level: number;
  /** The level on the most recent comment BEFORE this batch (null = no prior comment). */
  prevLevel: number | null;
  dir: ChangeDir;
  /** The batch comment, for a one-line "why" snippet. */
  comment: string;
  /** Discord/stream message URL of the batch comment (042) → the row's source icon. */
  sourceUrl: string | null;
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
  source_url: string | null;
}

/** Minimal holding shape needed to tell a genuinely-new position from a first-time note. */
export interface HoldingRef {
  ticker: string;
  last_action: string;
  action_date: string | null;
}

/** How recent the batch must be to still surface on the Overview (webinars run a few times a month). */
const RECENCY_DAYS = 14;
/** A no-prior-comment ticker counts as "new" only if it was opened within this window of the batch. */
const NEW_POSITION_DAYS = 30;

function classify(rows: Row[], holdings: HoldingRef[]): ConvictionBatch | null {
  if (rows.length === 0) return null;

  // Batch = newest streaming (webinar) event_date; fall back to the newest of any source.
  const eventDate = (rows.find((r) => r.source === 'streaming') ?? rows[0]).event_date;
  const batchMs = new Date(eventDate + 'T00:00:00').getTime();
  if (Date.now() - batchMs > RECENCY_DAYS * 86_400_000) return null;

  // Newest row per ticker within the batch (rows are already event_date/created_at desc).
  const seen = new Set<string>();
  const batch: Row[] = [];
  for (const r of rows) {
    if (r.event_date !== eventDate || seen.has(r.ticker)) continue;
    seen.add(r.ticker);
    batch.push(r);
  }

  const hMap = new Map(holdings.map((h) => [h.ticker, h]));

  const changes: ConvictionChange[] = batch.map((b) => {
    // prior = newest comment for this ticker dated before the batch (any public source).
    const prior = rows.find((r) => r.ticker === b.ticker && r.event_date < eventDate);
    const prevLevel = prior ? prior.conviction_level : null;
    const level = b.conviction_level;
    let dir: ChangeDir;
    if (prevLevel != null) {
      dir = level > prevLevel ? 'up' : level < prevLevel ? 'down' : 'same';
    } else {
      // No prior conviction note → "new" only if the position itself was recently opened;
      // otherwise it is a first-time note on an existing holding → reaffirmed.
      const h = hMap.get(b.ticker);
      const openedRecently =
        h?.last_action === 'New' && h.action_date != null &&
        batchMs - new Date(h.action_date + 'T00:00:00').getTime() <= NEW_POSITION_DAYS * 86_400_000 &&
        batchMs - new Date(h.action_date + 'T00:00:00').getTime() >= -7 * 86_400_000;
      dir = openedRecently ? 'new' : 'same';
    }
    return { ticker: b.ticker, level, prevLevel, dir, comment: b.comment, sourceUrl: b.source_url };
  });

  const order: Record<ChangeDir, number> = { up: 0, down: 1, new: 2, same: 3 };
  changes.sort((a, b) =>
    order[a.dir] - order[b.dir] || b.level - a.level || a.ticker.localeCompare(b.ticker));

  const counts: Record<ChangeDir, number> = { up: 0, down: 0, new: 0, same: 0 };
  changes.forEach((c) => { counts[c.dir]++; });

  const updatedAt = batch.reduce<string | null>(
    (acc, r) => (r.created_at && (!acc || r.created_at > acc) ? r.created_at : acc), null);

  return { eventDate, updatedAt, changes, counts };
}

/**
 * The latest conviction batch, classified by direction — drives the "Conviction Changes" block on
 * the Portfolio Overview. The batch is the newest `event_date` among streaming (webinar) public
 * notes, falling back to any public note. Each ticker's `prevLevel` is the level on its most recent
 * comment from BEFORE that date, so an upgrade/downgrade is a true delta; a ticker with no prior
 * note is "new" only when its holding was recently opened, else "reaffirmed".
 * Reads `conviction_comments` directly (public notes are subscriber-readable; migrations 011/012 RLS).
 */
export function useConvictionChanges(holdings: HoldingRef[]): ConvictionBatch | null {
  const { data } = useQuery<Row[]>({
    queryKey: ['conviction-changes'],
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('conviction_comments')
        .select('ticker, event_date, conviction_level, comment, created_at, source, source_url')
        .is('user_id', null)
        .order('event_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    staleTime: 5 * 60 * 1000,
  });

  return useMemo(() => classify(data ?? [], holdings), [data, holdings]);
}

import { getSupabase } from '../../lib/supabase';
import type { GraddoxData, Signal, LevelSet, LogEntry } from '@stw/shared';

// Re-export the canonical shared shapes so signal components import from one place.
export type { GraddoxData, Signal, LevelSet, LogEntry };

// The `graddox` table holds one row per day: bias + bias_note, JSONB level sets
// for SPX/QQQ, and JSONB arrays of trade signals and the stream log. The Signals
// view shows the latest day's read.
export async function fetchGraddox(): Promise<GraddoxData | null> {
  const { data, error } = await getSupabase()
    .from('graddox')
    .select('*')
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as Partial<GraddoxData> & {
    spx?: LevelSet | null;
    qqq?: LevelSet | null;
    signals?: Signal[] | null;
    log?: LogEntry[] | null;
  };

  const emptyLevels: LevelSet = { resistance: null, gex1: null, put_support: null };

  return {
    id: row.id ?? 0,
    date: row.date ?? '',
    last_updated: row.last_updated ?? '',
    bias: row.bias ?? '',
    bias_note: row.bias_note ?? '',
    spx: row.spx ?? emptyLevels,
    qqq: row.qqq ?? emptyLevels,
    spx_price: row.spx_price ?? null,
    qqq_price: row.qqq_price ?? null,
    signals: row.signals ?? [],
    log: row.log ?? [],
  };
}

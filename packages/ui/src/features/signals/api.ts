import { getSupabase } from '../../lib/supabase';
import { getTraderId, GRADDOX } from '../traders/api';
import type { GraddoxData, Signal, LevelSet, LogEntry } from '@stw/shared';

// Re-export the canonical shared shapes so signal components import from one place.
export type { GraddoxData, Signal, LevelSet, LogEntry };

// The `signals` table (renamed from `graddox` in migration 028) holds one row per trader
// per day: bias + bias_note, JSONB level sets for SPX/QQQ, the trade signals JSONB
// (`signals_data`), and the stream log. The Signals view shows Graddox's latest day's read.
export async function fetchGraddox(): Promise<GraddoxData | null> {
  const { data, error } = await getSupabase()
    .from('signals')
    .select('*')
    .eq('trader_id', await getTraderId(GRADDOX))
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as Partial<GraddoxData> & {
    spx?: LevelSet | null;
    qqq?: LevelSet | null;
    signals_data?: Signal[] | null;
    log?: LogEntry[] | null;
  };

  const emptyLevels: LevelSet = { resistance: null, gex1: null, put_support: null };

  return {
    id: row.id ?? '',
    date: row.date ?? '',
    last_updated: row.last_updated ?? '',
    bias: row.bias ?? '',
    bias_note: row.bias_note ?? '',
    status_note: row.status_note ?? null,
    spx: row.spx ?? emptyLevels,
    qqq: row.qqq ?? emptyLevels,
    spx_price: row.spx_price ?? null,
    qqq_price: row.qqq_price ?? null,
    signals: row.signals_data ?? [],
    log: row.log ?? [],
  };
}

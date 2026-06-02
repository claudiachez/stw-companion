import { getSupabase } from '../../lib/supabase';

export interface Signal {
  id: number;
  ticker: string;
  date: string;
  bias: string;
  verdict: string | null;
  note: string | null;
  created_at: string;
}

export interface GraddoxLevel {
  id: number;
  ticker: string;
  label: string;
  price: number;
  type: string;
  updated_at: string;
}

export interface GraddoxData {
  signals: Signal[];
  levels: GraddoxLevel[];
}

export async function fetchGraddox(): Promise<GraddoxData> {
  const sb = getSupabase();
  const [signalsRes, levelsRes] = await Promise.all([
    sb
      .from('graddox')
      .select('*')
      .order('date', { ascending: false })
      .limit(50),
    sb
      .from('graddox_levels')
      .select('*')
      .order('ticker', { ascending: true }),
  ]);

  if (signalsRes.error) throw signalsRes.error;
  if (levelsRes.error) throw levelsRes.error;

  return {
    signals: (signalsRes.data ?? []) as Signal[],
    levels: (levelsRes.data ?? []) as GraddoxLevel[],
  };
}

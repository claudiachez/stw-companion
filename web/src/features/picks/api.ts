import { supabase } from '../../lib/supabase';

export interface Holding {
  rank: number;
  ticker: string;
  name: string;
  conviction: number;
  basket: string;
  last_action: string;
  action_date: string | null;
  initial_weight: number | null;
  current_weight: number | null;
  position_detail: string | null;
  summary: string | null;
  bullets: string[] | null;
  updated_at: string | null;
}

export async function fetchHoldings(): Promise<Holding[]> {
  const { data, error } = await supabase
    .from('holdings')
    .select('*')
    .order('rank', { ascending: true });

  if (error) throw error;
  return (data ?? []) as Holding[];
}

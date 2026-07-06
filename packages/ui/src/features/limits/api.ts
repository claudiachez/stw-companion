import { getSupabase } from '../../lib/supabase';

export interface RiskConfigRow {
  user_id: string;
  max_position_pct: number;
  max_sector_pct: number;
  max_gross_pct: number;
  ladder: { drawdownPct: number; targetGrossPct: number }[];
  is_placeholder: boolean;
  updated_at: string;
}

export type AckStatus = 'new' | 'acknowledged' | 'glide_path';
export type ViolationType = 'position' | 'sector' | 'gross';

export interface ViolationAck {
  id: number;
  user_id: string;
  scope: string;
  violation_type: ViolationType;
  status: AckStatus;
  glide_path_note: string | null;
  glide_path_target_date: string | null;
  updated_at: string;
}

export async function fetchRiskConfig(userId: string): Promise<RiskConfigRow | null> {
  const { data, error } = await getSupabase()
    .from('risk_config')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as RiskConfigRow | null;
}

export async function fetchSectorMap(): Promise<Record<string, string>> {
  const { data, error } = await getSupabase().from('ticker_sector_map').select('ticker, sector');
  if (error) throw error;
  const out: Record<string, string> = {};
  for (const row of (data ?? []) as { ticker: string; sector: string }[]) out[row.ticker] = row.sector;
  return out;
}

export async function fetchViolationAcks(userId: string): Promise<ViolationAck[]> {
  const { data, error } = await getSupabase().from('risk_violation_acks').select('*').eq('user_id', userId);
  if (error) throw error;
  return (data ?? []) as ViolationAck[];
}

export async function upsertViolationAck(
  userId: string,
  scope: string,
  violationType: ViolationType,
  status: AckStatus,
  glidePathNote?: string | null,
  glidePathTargetDate?: string | null,
): Promise<void> {
  const { error } = await getSupabase().from('risk_violation_acks').upsert({
    user_id: userId,
    scope,
    violation_type: violationType,
    status,
    glide_path_note: glidePathNote ?? null,
    glide_path_target_date: glidePathTargetDate ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,scope,violation_type' });
  if (error) throw error;
}

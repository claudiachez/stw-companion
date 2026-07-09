import { getSupabase } from '../../lib/supabase';

export interface RiskConfigRow {
  user_id: string;
  max_position_pct: number;
  /** Separate, typically-tighter single-name cap for options exposure (migration 060). */
  max_option_position_pct: number;
  max_sector_pct: number;
  max_gross_pct: number;
  ladder: { drawdownPct: number; targetGrossPct: number }[];
  is_placeholder: boolean;
  /** Account Net Liquidation Value (or equivalent) — DB defaults to a $100,000 placeholder (migration 059), flagged via is_placeholder until the user overrides it. */
  account_equity: number;
  /** Trigger-maintained high-water mark of account_equity — never decreases (migration 059). */
  equity_peak: number | null;
  /** Per-user REGIME_EXIT rule (advisory, migration 063): single-RED → trim to this % / tighten stops to regime_stop_pct; double-RED → reduce gross to regime_doublered_gross_pct. Display-only. */
  regime_trim_to_pct: number;
  regime_stop_pct: number;
  regime_doublered_gross_pct: number;
  /** Vol-targeted sizing config (advisory, migration 065): scalar = vol_target_pct / rv20_annualized, clamped to [floor, cap]. Display-only, consumed by nothing. */
  vol_target_pct: number;
  vol_target_cap: number;
  vol_target_floor: number;
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

// Same placeholder defaults seeded for the operator in migration 055 (+ account_equity
// added in 059) — every subscriber gets the same starting point, then edits their own
// via RiskConfigForm. account_equity also has a DB-level default (migration 059); listed
// here explicitly too so a new row's shape is fully documented in one place.
export const DEFAULT_RISK_CONFIG = {
  max_position_pct: 10,
  max_option_position_pct: 5,
  max_sector_pct: 25,
  max_gross_pct: 100,
  ladder: [{ drawdownPct: -10, targetGrossPct: 70 }, { drawdownPct: -15, targetGrossPct: 50 }],
  account_equity: 100000,
  regime_trim_to_pct: 70,
  regime_stop_pct: 5,
  regime_doublered_gross_pct: 30,
  vol_target_pct: 15,
  vol_target_cap: 1.5,
  vol_target_floor: 0.3,
};

/** Creates a default risk_config row for a user who doesn't have one yet. No-op if one exists. */
export async function ensureRiskConfig(userId: string): Promise<RiskConfigRow> {
  const { data, error } = await getSupabase()
    .from('risk_config')
    .upsert({ user_id: userId, ...DEFAULT_RISK_CONFIG, is_placeholder: true }, { onConflict: 'user_id', ignoreDuplicates: true })
    .select('*')
    .maybeSingle();
  if (error) throw error;
  if (data) return data as RiskConfigRow;
  // ignoreDuplicates means an existing row returns nothing from the upsert — fetch it directly.
  const existing = await fetchRiskConfig(userId);
  return existing!;
}

export async function saveRiskConfig(
  userId: string,
  patch: Partial<Pick<RiskConfigRow, 'max_position_pct' | 'max_option_position_pct' | 'max_sector_pct' | 'max_gross_pct' | 'ladder' | 'account_equity' | 'regime_trim_to_pct' | 'regime_stop_pct' | 'regime_doublered_gross_pct'>>,
): Promise<void> {
  const { error } = await getSupabase()
    .from('risk_config')
    .update({ ...patch, is_placeholder: false, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (error) throw error;
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

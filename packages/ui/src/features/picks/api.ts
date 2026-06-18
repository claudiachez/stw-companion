import { getSupabase } from '../../lib/supabase';
import { getTraderId, STW } from '../traders/api';
import type { ConvictionComment, Leg } from '@stw/shared';

export interface Holding {
  rank: number;
  ticker: string;
  name: string;
  conviction: number;
  basket: string;
  category_id: string | null;
  last_action: string;
  action_date: string | null;
  initial_weight: number | null;
  current_weight: number | null;
  equity_pct: number | null;   // per-position equity:options split (0–1); null → Config default (040)
  summary: string | null;
  bullets: string[] | null;
  dd_updated_at: string | null;   // when DD/thesis/conviction was last refreshed (runs + stream)
  updated_at: string | null;
  // Structured per-leg position rows (migrations 029/030), embedded via a PostgREST nested
  // select. The %-P&L model reads everything off these — there are no more position_detail /
  // ibkr_legs / last_pnl_pct columns.
  legs: Leg[];
}

export async function fetchHoldings(): Promise<Holding[]> {
  const { data, error } = await getSupabase()
    .from('holdings')
    .select('*, legs(*), category:categories(name)')
    .order('rank', { ascending: true });

  if (error) throw error;
  // `basket` is sourced from the joined category (migration 034 drops holdings.basket; the
  // categories were seeded from those exact strings so bColor/filters keep working). Keep the
  // field name — it's the UI's vocabulary ("Sector Distribution", "All Baskets"). Pre-034 the
  // column still exists and equals the category name; uncategorized rows fall back to 'Other'.
  return (data ?? []).map((h) => ({
    ...h,
    basket: (h.category as { name?: string } | null)?.name ?? h.basket ?? 'Other',
    legs: h.legs ?? [],
  })) as Holding[];
}

export interface Category {
  id: string;
  name: string;
}

// Categories for the STW trader, used by the admin edit form to (re)assign a holding's
// category. Full CRUD lives in the admin Manage area (separate work).
export async function fetchCategories(): Promise<Category[]> {
  const trader_id = await getTraderId(STW);
  const { data, error } = await getSupabase()
    .from('categories')
    .select('id, name')
    .eq('trader_id', trader_id)
    .order('name', { ascending: true });

  if (error) throw error;
  return (data ?? []) as Category[];
}

export async function fetchConvictionComments(ticker: string): Promise<ConvictionComment[]> {
  const { data, error } = await getSupabase()
    .from('conviction_comments')
    .select('*')
    .eq('ticker', ticker)
    // Unified Commentary feed is newest-first by when the row was written.
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as ConvictionComment[];
}

// trader_id is stamped here (not in the forms) so the "app writes are STW" rule lives in
// one place. NOT NULL after migration 026.
export async function insertConvictionComment(
  row: Omit<ConvictionComment, 'id' | 'created_at' | 'trader_id'>
): Promise<void> {
  const trader_id = await getTraderId(STW);
  const { error } = await getSupabase().from('conviction_comments').insert({ ...row, trader_id });
  if (error) throw error;
}

export async function deleteConvictionComment(id: number): Promise<void> {
  const { error } = await getSupabase().from('conviction_comments').delete().eq('id', id);
  if (error) throw error;
}

// Admin per-leg weight override — the editor for the writer's 90/10 default split.
export async function updateLegWeight(legId: string, weight: number | null): Promise<void> {
  const { error } = await getSupabase().from('legs').update({ weight }).eq('id', legId);
  if (error) throw error;
}

// ── Admin leg editor (add / edit / remove) ──────────────────────────────────────────────
// Event-sourced (migration 040): a leg's STATE — entry_price, weight, status, exit_price,
// realized_pnl_pct, opened_at/closed_at, initial_weight — is derived by trigger 030 from the
// leg's `leg_transactions` and must NEVER be hand-written. These functions write only the leg's
// STRUCTURAL identity (instrument / strike / expiry / right / direction); everything else flows
// through leg_transactions (see insert/update/deleteLegTransaction below).

// The admin-editable subset of a leg = its structural identity only. trader_id/ticker are fixed.
export type LegEditableFields = Pick<
  Leg,
  'instrument_type' | 'option_strike' | 'option_expiry' | 'option_right' | 'direction'
>;

export async function insertLeg(ticker: string, fields: LegEditableFields): Promise<void> {
  const trader_id = await getTraderId(STW);
  const { error } = await getSupabase().from('legs').insert({ ...fields, ticker, trader_id });
  if (error) throw error;
}

export async function updateLeg(legId: string, fields: LegEditableFields): Promise<void> {
  const { error } = await getSupabase().from('legs').update(fields).eq('id', legId);
  if (error) throw error;
}

// Remove a leg: clear any event-log rows first (FK leg_transactions.leg_id → legs.id), then the
// leg itself.
export async function deleteLeg(legId: string): Promise<void> {
  const sb = getSupabase();
  const { error: txErr } = await sb.from('leg_transactions').delete().eq('leg_id', legId);
  if (txErr) throw txErr;
  const { error } = await sb.from('legs').delete().eq('id', legId);
  if (error) throw error;
}

// ── leg_transactions: the single event log behind both the legs and the timeline ──────────────
export interface LegEvent {
  id: string;
  leg_id: string;
  action_type: 'BUY' | 'SELL' | 'EXERCISED' | 'EXPIRED';
  action_label: string | null;     // host-facing verb: New / Upsized / Trimmed / Closed / Exercised / Expired
  price: number | null;
  weight: number | null;           // a BUY's lot, or a SELL's remaining (0 on full close)
  close_reason: string | null;
  executed_at: string;
  notes: string | null;            // the host's words (routine-written); the admin can append context
  // embedded leg context (for the timeline display)
  leg: {
    ticker: string;
    instrument_type: 'SHARES' | 'OPTION';
    option_strike: number | null;
    option_right: 'CALL' | 'PUT' | null;
    option_expiry: string | null;
  } | null;
}

const LEG_EVENT_COLS =
  'id,leg_id,action_type,action_label,price,weight,close_reason,executed_at,notes';

// The position's evolution — every leg event for a ticker, oldest→newest. Joined to `legs` so the
// timeline reads from the SAME source as the legs (no second, conflicting table).
export async function fetchLegTransactions(ticker: string): Promise<LegEvent[]> {
  const { data, error } = await getSupabase()
    .from('leg_transactions')
    .select(`${LEG_EVENT_COLS},leg:legs!inner(ticker,instrument_type,option_strike,option_right,option_expiry)`)
    .eq('leg.ticker', ticker)
    .order('executed_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as LegEvent[];
}

export type LegEventInput = Pick<LegEvent, 'action_type' | 'action_label' | 'price' | 'weight' | 'close_reason'> & {
  executed_at: string;
  notes?: string | null;
};

// Append an event to a leg. The 040 trigger re-derives the leg's state from all its events.
export async function insertLegTransaction(legId: string, ev: LegEventInput): Promise<void> {
  const trader_id = await getTraderId(STW);
  const { error } = await getSupabase()
    .from('leg_transactions')
    .insert({ leg_id: legId, trader_id, ...ev });
  if (error) throw error;
}

// Edit an existing diary row — the trigger replays and re-derives the leg (so the scoreboard and
// the ledger can never disagree).
export async function updateLegTransaction(id: string, fields: Partial<LegEventInput>): Promise<void> {
  const { error } = await getSupabase().from('leg_transactions').update(fields).eq('id', id);
  if (error) throw error;
}

// Delete a diary row (the DELETE trigger re-derives from the remaining events).
export async function deleteLegTransaction(id: string): Promise<void> {
  const { error } = await getSupabase().from('leg_transactions').delete().eq('id', id);
  if (error) throw error;
}

// Insert a leg and return its new id (needed to attach the opening event).
export async function insertLegReturningId(ticker: string, fields: LegEditableFields): Promise<string> {
  const trader_id = await getTraderId(STW);
  const { data, error } = await getSupabase()
    .from('legs')
    .insert({ ...fields, ticker, trader_id })
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

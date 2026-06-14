/**
 * backfill_legs.ts — one-off backfill of `legs` + opening `leg_transactions` events from
 * `holdings.position_detail` and `holdings.ibkr_legs`, in the weight / %-P&L model.
 *
 * THIS IS NOT A MIGRATION. Run it against the SUPABASE PREVIEW BRANCH only, never prod, after
 * migrations 022–033 are applied there. Migration 034 (dropping holdings.position_detail /
 * ibkr_legs) must NOT be applied until this backfill is confirmed.
 *
 * MODEL (no sizes — see migrations 029/030):
 *   - A leg stores entry_price (parsed `@`), a per-leg WEIGHT, and a mark (from ibkr_legs.price).
 *     There are NO contract counts. P&L is a percentage.
 *   - Per-leg weight isn't in position_detail (the host states it in chat). The backfill applies
 *     his default split, overridable per leg:
 *         mixed (shares + options): shares 90% of the position weight, options split 10% equally
 *         options-only:             position weight split equally across the option legs
 *         shares-only:              100% to the shares leg
 *   - Each leg is seeded with one opening BUY event (price = entry_price, weight = leg weight);
 *     trigger 030 derives status/opened_at. Real open dates / partial trims / closes come from
 *     the richer raw-message replay later — this snapshot backfill seeds the CURRENT open book.
 *   - Month-only option expiries default to the standard 3rd-Friday expiration (overridable).
 *   - Closed holdings (last_action='Closed') are skipped by default (their lifecycle belongs to
 *     the message replay); pass --include-closed to seed them as OPEN legs anyway.
 *
 * Usage:
 *   export SUPABASE_URL="https://<preview-ref>.supabase.co"
 *   export SUPABASE_SERVICE_ROLE_KEY="<preview service role key>"
 *   pnpm dlx tsx scripts/backfill_legs.ts                       # dry run, all open holdings
 *   pnpm dlx tsx scripts/backfill_legs.ts --ticker ADEA          # one ticker
 *   pnpm dlx tsx scripts/backfill_legs.ts --overrides f.json --apply        # interactive apply
 *   pnpm dlx tsx scripts/backfill_legs.ts --overrides f.json --apply --yes  # non-interactive
 *
 * Overrides file (ticker -> overrides; all optional):
 *   {
 *     "ADEA": {
 *       "skip": false,
 *       "opened_at": "2026-06-04",
 *       "expiry_day": { "20260900": 18 },          // resolve a month-only YYYYMM -> day
 *       "leg_weight": { "SHARES": 1.0, "30C-20260918": 3.2 }  // real per-leg weights from chat
 *     }
 *   }
 */

import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { parseOptionLegs, type OptionLeg } from '../packages/shared/src/utils/options';
import { parseCostBasis, inferDirection } from '../packages/shared/src/utils/positions';

// ---------------------------------------------------------------------------
// args + env
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const has = (f: string) => args.includes(f);
const val = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };

const APPLY = has('--apply');
const YES = has('--yes');
const INCLUDE_CLOSED = has('--include-closed');
const ONLY_TICKER = val('--ticker');
const OVERRIDES_PATH = val('--overrides');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (point at the PREVIEW branch).');
  process.exit(1);
}
if (APPLY && !/\b(preview|branch|sandbox)\b/i.test(SUPABASE_URL)) {
  console.warn(`\n⚠️  --apply against ${SUPABASE_URL}\n    Confirm this is NOT production.\n`);
}

type Overrides = Record<string, {
  skip?: boolean;
  opened_at?: string;
  expiry_day?: Record<string, number>;
  leg_weight?: Record<string, number>;
}>;
const overrides: Overrides = OVERRIDES_PATH ? JSON.parse(readFileSync(OVERRIDES_PATH, 'utf8')) : {};

// ---------------------------------------------------------------------------
// Supabase REST helpers (service key — bypasses RLS, like the routines)
// ---------------------------------------------------------------------------
const rest = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1`;
const headers = { apikey: SERVICE_KEY!, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' };

async function getJSON(path: string): Promise<any[]> {
  const r = await fetch(`${rest}/${path}`, { headers });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status} ${await r.text()}`);
  return r.json();
}
async function insertOne(table: string, row: Record<string, unknown>): Promise<any> {
  const r = await fetch(`${rest}/${table}`, {
    method: 'POST', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify(row),
  });
  const body = await r.text();
  if (!r.ok) throw new Error(`POST ${table} → ${r.status} ${body}`);
  const parsed = JSON.parse(body);
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error(`POST ${table} returned empty body: ${body}`);
  return parsed[0];
}

// ---------------------------------------------------------------------------
// types
// ---------------------------------------------------------------------------
// Real prod ibkr_legs shape (price-only; no quantity). `price` is the current mark.
interface IbkrLeg { strike?: number; expiry?: string; right?: string; put_call?: string; entry?: number; price?: number; }
interface Holding {
  ticker: string; trader_id: string; position_detail: string | null;
  ibkr_legs: IbkrLeg[] | null; current_weight: number | null; last_action: string | null;
}
interface PlannedLeg {
  instrument_type: 'SHARES' | 'OPTION';
  option_strike: number | null; option_right: 'CALL' | 'PUT' | null; option_expiry: string | null; // YYYY-MM-DD
  entry_price: number;
  weight: number | null;       // per-leg portfolio weight (90/10 default or override)
  mark_price: number | null;
  mark_source: 'IBKR' | null;
  label: string;
  notes: string[];             // non-blocking notes (defaults applied)
}

// ---------------------------------------------------------------------------
// expiry helpers
// ---------------------------------------------------------------------------
function thirdFriday(year: number, month1: number): number {
  const firstDow = new Date(Date.UTC(year, month1 - 1, 1)).getUTCDay();
  return 1 + ((5 - firstDow + 7) % 7) + 14;
}
function toIsoDate(expiry: string, ov: Overrides[string] | undefined): { iso: string; defaulted: boolean } {
  if (expiry.length === 8) return { iso: `${expiry.slice(0,4)}-${expiry.slice(4,6)}-${expiry.slice(6,8)}`, defaulted: false };
  const yyyy = parseInt(expiry.slice(0,4)), mm = parseInt(expiry.slice(4,6));
  const ovDay = ov?.expiry_day?.[`${expiry}00`];
  const day = ovDay ?? thirdFriday(yyyy, mm);
  return { iso: `${yyyy}-${expiry.slice(4,6)}-${String(day).padStart(2,'0')}`, defaulted: ovDay == null };
}
function normRight(r?: string): 'CALL' | 'PUT' | null { const s=(r??'').toUpperCase(); return s.startsWith('C')?'CALL':s.startsWith('P')?'PUT':null; }

// ---------------------------------------------------------------------------
// build the per-ticker plan (with the 90/10 weight split)
// ---------------------------------------------------------------------------
function planTicker(h: Holding): PlannedLeg[] {
  const ov = overrides[h.ticker];
  const pd = h.position_detail ?? '';
  const ibkr = h.ibkr_legs ?? [];
  const posWeight = h.current_weight ?? 0;

  const shareBasis = parseCostBasis(pd);
  const optLegs = parseOptionLegs(pd, h.ticker);
  const hasShares = shareBasis != null;
  const nOpt = optLegs.length;

  // default split per the host's stated rule (overridable per leg). round to 4dp (weights are %)
  const r4 = (n: number) => Math.round(n * 1e4) / 1e4;
  let sharesWeight = 0, perOptionWeight = 0;
  if (hasShares && nOpt > 0) { sharesWeight = r4(posWeight * 0.9); perOptionWeight = r4((posWeight * 0.1) / nOpt); }
  else if (!hasShares && nOpt > 0) { perOptionWeight = r4(posWeight / nOpt); }
  else if (hasShares) { sharesWeight = posWeight; }

  const out: PlannedLeg[] = [];

  if (hasShares) {
    const w = ov?.leg_weight?.['SHARES'] ?? sharesWeight;
    out.push({
      instrument_type: 'SHARES', option_strike: null, option_right: null, option_expiry: null,
      entry_price: shareBasis!, weight: w, mark_price: null, mark_source: null,
      label: `SHARES @ $${shareBasis}`,
      notes: ov?.leg_weight?.['SHARES'] == null && nOpt > 0 ? ['weight = 90% default'] : [],
    });
  }

  for (const l of optLegs) {
    const { iso, defaulted } = toIsoDate(l.expiry, ov);
    const right = l.right === 'C' ? 'CALL' : 'PUT';
    const ym = iso.replace(/-/g, '').slice(0, 6);
    const match = ibkr.find((il) => Number(il.strike) === l.strike && normRight(il.put_call ?? il.right) === right && (il.expiry ?? '').slice(0,6) === ym);
    const legKey = `${l.strike}${l.right}-${iso.replace(/-/g,'')}`;
    const w = ov?.leg_weight?.[legKey] ?? perOptionWeight;
    const notes: string[] = [];
    if (defaulted) notes.push('expiry day = 3rd Friday default');
    if (ov?.leg_weight?.[legKey] == null) notes.push(`weight = ${hasShares ? '10%/n' : 'even'} default`);
    out.push({
      instrument_type: 'OPTION', option_strike: l.strike, option_right: right, option_expiry: iso,
      entry_price: l.entry, weight: w, mark_price: match?.price ?? null, mark_source: match?.price != null ? 'IBKR' : null,
      label: `$${l.strike}${l.right} ${l.expiry} @ $${l.entry}${match ? ` [mark ${match.price}]` : ''}`,
      notes,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// apply one ticker — insert legs + opening BUY events
// ---------------------------------------------------------------------------
async function applyTicker(h: Holding, plan: PlannedLeg[], ov: Overrides[string] | undefined) {
  const openedAt = `${ov?.opened_at ?? new Date().toISOString().slice(0, 10)}T00:00:00Z`;
  const direction = inferDirection(h.position_detail);
  let wrote = 0;
  for (const p of plan) {
    const leg = await insertOne('legs', {
      ticker: h.ticker, trader_id: h.trader_id, instrument_type: p.instrument_type,
      option_strike: p.option_strike, option_expiry: p.option_expiry, option_right: p.option_right,
      direction, entry_price: p.entry_price, weight: p.weight,
      mark_price: p.mark_price, mark_price_source: p.mark_source,
      mark_price_at: p.mark_price != null ? new Date().toISOString() : null,
    });
    // opening BUY event → trigger derives status/opened_at
    await insertOne('leg_transactions', {
      leg_id: leg.id, trader_id: h.trader_id, action_type: 'BUY',
      price: p.entry_price, weight: p.weight, executed_at: openedAt,
      notes: 'backfill: opening lot from position_detail',
    });
    console.log(`    ✓ ${p.label}  (weight ${p.weight})`);
    wrote++;
  }
  return wrote;
}

function ask(q: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(q, (a) => { rl.close(); res(a.trim().toLowerCase()); }));
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
(async () => {
  let q = 'holdings?select=ticker,trader_id,position_detail,ibkr_legs,current_weight,last_action&ticker=neq.CASH&order=ticker';
  if (ONLY_TICKER) q += `&ticker=eq.${ONLY_TICKER}`;
  const holdings: Holding[] = (await getJSON(q)) as Holding[];

  console.log(`\n${APPLY ? 'APPLY' : 'DRY RUN'} — ${holdings.length} holding(s)\n`);
  let totalLegs = 0, totalWrote = 0, skipped = 0;

  for (const h of holdings) {
    const ov = overrides[h.ticker];
    console.log(`━━ ${h.ticker} (${h.last_action ?? '—'}, position weight ${h.current_weight ?? '—'})`);
    console.log(`   position_detail: ${h.position_detail ?? '(none)'}`);

    if (ov?.skip) { console.log('   → skipped via overrides\n'); skipped++; continue; }
    if (h.last_action === 'Closed' && !INCLUDE_CLOSED) { console.log('   → closed position, skipped (use --include-closed)\n'); skipped++; continue; }

    const plan = planTicker(h);
    if (plan.length === 0) { console.log('   → no parseable legs (review manually)\n'); continue; }
    for (const p of plan) { totalLegs++; console.log(`   - ${p.label}  → weight ${p.weight}${p.notes.length ? '  · ' + p.notes.join('; ') : ''}`); }

    if (!APPLY) { console.log(); continue; }
    let go = YES;
    if (!YES) { const a = await ask(`   write ${plan.length} leg(s) for ${h.ticker}? [y/N/q] `); if (a === 'q') { console.log('\nAborted.'); break; } go = a === 'y' || a === 'yes'; }
    if (go) totalWrote += await applyTicker(h, plan, ov); else console.log('   → skipped');
    console.log();
  }

  console.log('────────────────────────────────────────');
  console.log(`parsed legs: ${totalLegs}  | tickers skipped: ${skipped}`);
  console.log(APPLY ? `legs written: ${totalWrote}` : 'dry run — nothing written. Review weights/dates, then --apply.');
})().catch((e) => { console.error('\nFATAL:', e.message); process.exit(1); });

#!/usr/bin/env node
/**
 * TCA v1 — execution-quality analysis (Week-2 Item 2,
 * plans/20260709_integrity-guardrailsv2.md).
 *
 * Admin / CLI ONLY — no subscriber surface. Joins a subscriber's own IBKR fills
 * (public.user_executions, written by the ibkr-flex Trades ingestion — Item 1)
 * to the host's event-sourced diary (public.leg_transactions ← public.legs) by
 * ticker + side within a bounded window, and prints three descriptive reports:
 *
 *   1. Fill slippage        — operator fill vs. the host's posted alert price
 *                             per matched entry/exit (% and per-position $).
 *   2. Discretionary overlay — the pullback-waiting question: for each host
 *                             entry alert, did the operator enter? entered late
 *                             (entry improvement) vs. never entered (forfeited
 *                             outcome = the position's host return).
 *   3. Exit divergence      — where both closed a shared name: exit date/price
 *                             deltas and return captured vs. the host's return.
 *
 * PRE-REGISTERED, before the numbers are seen: the pullback-waiting question is
 * "does waiting for pullbacks pay?" — total % captured via better entries vs.
 * total % forfeited via missed positions, per month.
 *
 * No statistics theater at current sample sizes: descriptive tables, honest
 * counts, every population labeled. Re-runs monthly.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   node scripts/tca.mjs --user-id=<uuid> [--trader=STW] [--window-days=3] [--json]
 *
 * Reads via the Supabase REST API with the service-role key (no supabase-js
 * dependency — same "direct REST in scripts/functions" convention as the Netlify
 * functions). Read-only; writes nothing.
 */

// ── args + env ────────────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
  }),
);
const USER_ID = args['user-id'];
const TRADER_NAME = args['trader'] ?? 'STW';
const WINDOW_DAYS = parseInt(args['window-days'] ?? '3', 10); // T+N trading days
const AS_JSON = !!args['json'];

const SUPABASE_URL = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/$/, '');
const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();

if (!USER_ID) fail('Missing --user-id=<uuid> (the subscriber whose executions to analyze).');
if (!SUPABASE_URL || !SERVICE_KEY) fail('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars.');

function fail(msg) {
  console.error(`tca: ${msg}`);
  process.exit(1);
}

// ── REST helper ────────────────────────────────────────────────────────────────
async function rest(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) fail(`REST ${res.status} on ${path}: ${await res.text()}`);
  return res.json();
}

// ── date helpers (ET trading date; T+N business-day window) ─────────────────────
// Mirror @stw/shared's tradingDateET intent without importing the barrel: derive
// the calendar date in America/New_York. Business-day windowing ignores holidays
// (a bounded, documented approximation — a match just inside a holiday-adjacent
// window is still a legitimate same-alert fill).
function tradingDateET(iso) {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);
  const p = Object.fromEntries(parts.filter((x) => x.type !== 'literal').map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
function addBusinessDays(ymd, n) {
  const d = new Date(`${ymd}T12:00:00Z`);
  let added = 0;
  while (added < n) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d.toISOString().slice(0, 10);
}
function withinWindow(alertYmd, fillYmd, days) {
  return fillYmd >= alertYmd && fillYmd <= addBusinessDays(alertYmd, days);
}

// ── formatting ──────────────────────────────────────────────────────────────────
const pct = (n) => (n == null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`);
const usd = (n) => (n == null ? '—' : `${n < 0 ? '-' : ''}$${Math.abs(n).toFixed(2)}`);
const monthOf = (ymd) => ymd.slice(0, 7);

// ── load data ─────────────────────────────────────────────────────────────────
async function main() {
  // Resolve the host trader id by name (seeds resolve by name, not uuid — CLAUDE.md).
  const traders = await rest(`traders?select=id,name&name=eq.${encodeURIComponent(TRADER_NAME)}`);
  if (!traders.length) fail(`No trader named "${TRADER_NAME}".`);
  const traderId = traders[0].id;

  // Operator fills (append-only log).
  const execs = await rest(
    `user_executions?select=*&user_id=eq.${USER_ID}&order=executed_at.asc`,
  );

  // Host diary + leg context (ticker/direction/entry/exit live on legs).
  const legs = await rest(
    `legs?select=id,ticker,instrument_type,direction,status,entry_price,exit_price,realized_pnl_pct,option_strike,option_expiry&trader_id=eq.${traderId}`,
  );
  const legById = Object.fromEntries(legs.map((l) => [l.id, l]));
  const diary = await rest(
    `leg_transactions?select=id,leg_id,action_type,price,weight,executed_at,notes&trader_id=eq.${traderId}&order=executed_at.asc`,
  );

  // Normalize: attach ticker/side/date to each host diary row.
  const alerts = diary
    .map((t) => {
      const leg = legById[t.leg_id];
      if (!leg) return null;
      const side = t.action_type === 'BUY' ? 'BUY' : t.action_type === 'SELL' ? 'SELL' : null;
      return {
        ticker: leg.ticker,
        side,
        action_type: t.action_type,
        price: t.price,
        date: tradingDateET(t.executed_at),
        leg,
        notes: t.notes,
      };
    })
    .filter(Boolean);

  const fills = execs.map((e) => ({
    ticker: e.underlying,
    side: e.side,
    price: e.price,
    qty: e.quantity,
    multiplier: e.multiplier ?? 1,
    asset_class: e.asset_class,
    date: tradingDateET(e.executed_at),
    raw: e,
  }));

  if (AS_JSON) {
    console.log(JSON.stringify(runAnalyses(alerts, fills, legById), null, 2));
    return;
  }
  printReport(alerts, fills, legById);
}

// ── analyses ────────────────────────────────────────────────────────────────────
function hostReturnForLeg(leg) {
  // Prefer the trigger-computed realized % (legs.realized_pnl_pct, migration 030);
  // fall back to entry/exit. Open legs' current return needs a live mark this
  // offline script doesn't have → null (labeled unresolved, never guessed).
  if (leg.realized_pnl_pct != null) return leg.realized_pnl_pct;
  if (leg.entry_price == null || leg.entry_price === 0 || leg.exit_price == null) return null;
  const sign = leg.direction === 'short' ? -1 : 1;
  return ((leg.exit_price - leg.entry_price) / leg.entry_price) * 100 * sign;
}

function runAnalyses(alerts, fills, _legById) {
  // 1 + 3 — slippage on matched entries/exits, and exit divergence.
  const matches = [];
  const usedFills = new Set();
  for (const a of alerts) {
    if (!a.side || a.price == null) continue;
    const cand = fills.find(
      (f, i) =>
        !usedFills.has(i) && f.ticker === a.ticker && f.side === a.side &&
        f.price != null && withinWindow(a.date, f.date, WINDOW_DAYS),
    );
    const idx = fills.indexOf(cand);
    if (cand) {
      usedFills.add(idx);
      // For a BUY, paying MORE than the alert is worse (positive slippage); for a
      // SELL, receiving LESS is worse. Normalize so positive = worse for both.
      const rawSlip = ((cand.price - a.price) / a.price) * 100;
      const slipPct = a.side === 'BUY' ? rawSlip : -rawSlip;
      const dollars = (slipPct / 100) * Math.abs(cand.qty ?? 0) * cand.price * (cand.multiplier ?? 1);
      matches.push({ ticker: a.ticker, side: a.side, alertDate: a.date, fillDate: cand.date,
        alertPrice: a.price, fillPrice: cand.price, slipPct, dollars, month: monthOf(a.date) });
    }
  }

  // 2 — discretionary overlay (pullback-waiting), entries only.
  const entryAlerts = alerts.filter((a) => a.side === 'BUY' && a.price != null);
  const overlay = [];
  for (const a of entryAlerts) {
    const entered = fills.find(
      (f) => f.ticker === a.ticker && f.side === 'BUY' && f.price != null && withinWindow(a.date, f.date, WINDOW_DAYS),
    );
    if (entered) {
      // entry improvement: bought cheaper than the alert = positive capture.
      const improvementPct = ((a.price - entered.price) / a.price) * 100;
      overlay.push({ ticker: a.ticker, month: monthOf(a.date), status: 'entered',
        capturedPct: improvementPct, forfeitedPct: null });
    } else {
      const forfeited = hostReturnForLeg(a.leg); // outcome the operator skipped
      overlay.push({ ticker: a.ticker, month: monthOf(a.date), status: 'missed',
        capturedPct: null, forfeitedPct: forfeited });
    }
  }

  const exitDivergence = matches.filter((m) => m.side === 'SELL');

  return { matches, overlay, exitDivergence };
}

function byMonth(rows, key) {
  const out = {};
  for (const r of rows) {
    const v = r[key];
    if (v == null) continue;
    (out[r.month] ??= []).push(v);
  }
  return out;
}
const sum = (a) => a.reduce((s, x) => s + x, 0);
const avg = (a) => (a.length ? sum(a) / a.length : null);

// ── report ───────────────────────────────────────────────────────────────────
function printReport(alerts, fills, legById) {
  const { matches, overlay, exitDivergence } = runAnalyses(alerts, fills, legById);
  const line = '─'.repeat(72);

  console.log(`\nTCA v1 — execution-quality report`);
  console.log(`user_id=${USER_ID}  trader=${TRADER_NAME}  window=T+${WINDOW_DAYS} trading days`);
  console.log(`populations: ${alerts.length} host alert rows · ${fills.length} operator fills`);
  if (fills.length === 0) {
    console.log(`\n(!) No operator executions found. Enable the Flex "Trades" section and run a sync first`);
    console.log(`    (apps/web ibkr-flex → user_executions). Nothing to analyze yet.`);
    return;
  }

  // 1 — Fill slippage
  console.log(`\n${line}\n1. FILL SLIPPAGE (operator fill vs. host alert price; +=worse)\n${line}`);
  if (!matches.length) console.log('  no matched entries/exits in window');
  for (const m of matches) {
    console.log(`  ${m.ticker.padEnd(6)} ${m.side.padEnd(4)} ${m.alertDate}→${m.fillDate}  ` +
      `alert ${m.alertPrice} → fill ${m.fillPrice}  ${pct(m.slipPct).padStart(8)}  ${usd(m.dollars)}`);
  }
  if (matches.length) {
    const slips = matches.map((m) => m.slipPct);
    console.log(`  ── matched=${matches.length}  avg slippage ${pct(avg(slips))}  total ${usd(sum(matches.map((m) => m.dollars)))}`);
  }

  // 2 — Discretionary overlay (pullback-waiting)
  console.log(`\n${line}\n2. DISCRETIONARY OVERLAY — does waiting for pullbacks pay? (pre-registered)\n${line}`);
  const entered = overlay.filter((o) => o.status === 'entered');
  const missed = overlay.filter((o) => o.status === 'missed');
  console.log(`  entries taken=${entered.length}  entries missed=${missed.length}`);
  const capByMonth = byMonth(entered, 'capturedPct');
  const forfByMonth = byMonth(missed, 'forfeitedPct');
  const months = [...new Set([...Object.keys(capByMonth), ...Object.keys(forfByMonth)])].sort();
  console.log(`  ${'month'.padEnd(9)} ${'captured(entries)'.padStart(18)} ${'forfeited(missed)'.padStart(18)}`);
  for (const mo of months) {
    console.log(`  ${mo.padEnd(9)} ${pct(sum(capByMonth[mo] ?? [])).padStart(18)} ${pct(sum(forfByMonth[mo] ?? [])).padStart(18)}`);
  }
  const unresolvedMissed = missed.filter((o) => o.forfeitedPct == null).length;
  if (unresolvedMissed) console.log(`  (${unresolvedMissed} missed names had no resolvable host return — open legs; excluded above)`);
  console.log(`  ── TOTAL captured via better entries ${pct(sum(entered.map((o) => o.capturedPct)))}  ` +
    `vs forfeited via misses ${pct(sum(missed.map((o) => o.forfeitedPct ?? 0)))}`);

  // 3 — Exit divergence
  console.log(`\n${line}\n3. EXIT DIVERGENCE (both closed a shared name)\n${line}`);
  if (!exitDivergence.length) console.log('  no shared exits in window');
  for (const m of exitDivergence) {
    console.log(`  ${m.ticker.padEnd(6)} host exit ${m.alertPrice} @${m.alertDate} → operator ${m.fillPrice} @${m.fillDate}  Δprice ${pct(m.slipPct)}`);
  }
  console.log(`\nNOTE: descriptive only — no expectancy claims at these sample sizes. Re-run monthly.\n`);
}

main().catch((e) => fail(e.message));

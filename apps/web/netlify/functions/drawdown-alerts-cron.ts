/**
 * drawdown-alerts-cron — Item 3 of plans/20260719_drawdown-protection-overhaul.md.
 *
 * The Risk tab shows drawdown warnings, but only when the user is looking. This scheduled fn
 * reaches them off-app so they can ACT ASAP: it runs every 15 min during US market hours,
 * LIVE-PRICES each user's holdings (Finnhub, server-side), evaluates the account drawdown
 * ladder + each per-stock stop ladder, and emails / Discord-DMs the moment one ESCALATES.
 *
 * Host rule (2026-07-19): at most ONE alert per user per day, sent WHEN it happens (not at a
 * fixed time). So the first escalation of the trading day fires immediately; the per-day cap
 * then holds further alerts until the next day (a persisting/again-escalating issue re-alerts
 * the next day). De-dup + cap via risk_alert_state (migration 073): a monotonic `last_level`
 * per (user, kind, scope) drives "is this a NEW escalation", and `last_alerted_at` (compared in
 * ET) drives the once-a-day cap. A recovery to ok deletes the row so a re-entry alerts afresh.
 *
 * LIVE-priced (not synced) so it catches intraday moves — the same @stw/shared engine the Risk
 * tab uses, so cron and screen agree. Falls back to the synced mark for any unquoted leg.
 *
 * Conventions (CLAUDE.md): direct fetch() to Supabase REST + Resend + Discord (no SDKs).
 * `.trim()` every env var. schedule() runs cron on the PROD (main) deploy only. Web-only.
 *
 * Env: VITE_SUPABASE_URL (or SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY; a channel — RESEND_API_KEY
 * + ALERT_FROM_EMAIL and/or a Discord bot token (admin UI integration_secrets, else
 * DISCORD_BOT_TOKEN); VITE_FINNHUB_KEY (or FINNHUB_KEY) for live quotes; optional APP_URL. Until
 * a channel is configured the fn no-ops (advances no state), so it ships dormant.
 */
import type { Handler } from '@netlify/functions';
import { schedule } from '@netlify/functions';
import {
  cashflowAdjustedDrawdownPct, drawdownLadderStatus,
  perStockLadderStatus, reconstructPositionEpisode, liveNlvFromMarks,
  tradingDateET, isTradingDay,
  DEFAULT_PER_STOCK_LADDER, DRAWDOWN_NEAR_BAND_PP,
  type DrawdownStep, type PerStockDrawdownStep, type PositionFill, type LivePositionMark,
} from '@stw/shared';

// ── Supabase REST helpers (service role; RLS-bypassing reads across all users) ──
async function sbGet<T>(url: string, key: string, path: string): Promise<T[]> {
  const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`GET ${path}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<T[]>;
}
async function sbUpsert(url: string, key: string, table: string, row: Record<string, unknown>, onConflict: string): Promise<void> {
  const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`upsert ${table}: ${res.status} ${(await res.text()).slice(0, 200)}`);
}
async function sbDelete(url: string, key: string, table: string, filter: string): Promise<void> {
  const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${table}?${filter}`, {
    method: 'DELETE',
    headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'return=minimal' },
  });
  if (!res.ok) throw new Error(`delete ${table}: ${res.status} ${(await res.text()).slice(0, 200)}`);
}
async function sbInsert(url: string, key: string, table: string, row: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${table}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`insert ${table}: ${res.status} ${(await res.text()).slice(0, 200)}`);
}

async function sendEmail(resendKey: string, from: string, to: string, subject: string, html: string): Promise<string | null> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) return `${res.status} ${(await res.text()).slice(0, 200)}`;
  return null;
}

// Discord DM = two REST calls with the BOT token (Authorization: Bot <token>): open a DM
// channel with the user, then post the message.
async function sendDiscordDm(botToken: string, discordUserId: string, content: string): Promise<string | null> {
  const chanRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
    method: 'POST',
    headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient_id: discordUserId }),
  });
  if (!chanRes.ok) return `open-dm ${chanRes.status} ${(await chanRes.text()).slice(0, 160)}`;
  const channel = (await chanRes.json()) as { id?: string };
  if (!channel.id) return 'open-dm: no channel id';
  const msgRes = await fetch(`https://discord.com/api/v10/channels/${channel.id}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!msgRes.ok) return `send-dm ${msgRes.status} ${(await msgRes.text()).slice(0, 160)}`;
  return null;
}

// Live Finnhub quotes for the union of held tickers, concurrency-limited (free tier = 60/min).
async function fetchQuotes(tickers: string[], key: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!key) return out;
  const CONC = 5;
  for (let i = 0; i < tickers.length; i += CONC) {
    await Promise.all(tickers.slice(i, i + CONC).map(async (t) => {
      try {
        const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(t)}&token=${key}`);
        if (!res.ok) return;
        const d = (await res.json()) as { c?: number };
        if (d.c && d.c > 0) out.set(t, d.c);
      } catch { /* skip a bad symbol */ }
    }));
  }
  return out;
}

// ── row shapes (only the columns we select) ──
interface ConfigRow {
  user_id: string;
  ibkr_nlv: number | null;
  equity_peak: number | null;
  cumulative_cashflow: number | null;
  equity_peak_cashflow: number | null;
  ladder: DrawdownStep[] | null;
  per_stock_ladder: PerStockDrawdownStep[] | null;
  drawdown_near_band_pp: number | null;
}
interface ProfileRow { user_id: string; email: string | null; status: string | null; discord_user_id: string | null; preferences: { drawdownAlertsOptOut?: boolean } | null }
interface PositionRow { user_id: string; underlying: string; asset_class: string; quantity: number | null; avg_cost: number | null; mark_price: number | null; multiplier: number | null }
interface ExecRow { user_id: string; underlying: string; asset_class: string; quantity: number | null; executed_at: string }
interface AlertStateRow { user_id: string; alert_kind: string; scope: string; last_level: number; last_alerted_at: string | null }

/** Monotonic severity level: 0 ok · 1 near · 100 + |rung%| breach (deeper = higher). */
function levelOf(severity: string, activeRungDrawdownPct: number | null): number {
  if (severity === 'breach') return 100 + Math.abs(activeRungDrawdownPct ?? 0);
  if (severity === 'near') return 1;
  return 0;
}

interface Alert { scope: string; kind: 'account_drawdown' | 'per_stock'; line: string }
interface Evaluated { kind: 'account_drawdown' | 'per_stock'; scope: string; level: number }

const handlerImpl: Handler = async () => {
  const url = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  const resendKey = (process.env.RESEND_API_KEY ?? '').trim();
  const fromEmail = (process.env.ALERT_FROM_EMAIL ?? '').trim();
  const finnhubKey = (process.env.VITE_FINNHUB_KEY ?? process.env.FINNHUB_KEY ?? '').trim();
  const appUrl = (process.env.APP_URL ?? '').trim();
  if (!url || !serviceKey) return { statusCode: 500, body: 'Server misconfigured (Supabase env)' };

  const ranAt = new Date().toISOString();
  const todayET = tradingDateET(ranAt);
  const logRun = async (status: string, processed: number, summary: string) => {
    try {
      await sbInsert(url, serviceKey, 'run_log', {
        run_type: 'drawdown-alerts-cron', status, messages_processed: processed, ran_at: ranAt, summary: summary.slice(0, 500),
      });
    } catch { /* run_log is best-effort */ }
  };

  // Only during trading days — skip weekends/holidays (the cron window over-covers RTH).
  if (!isTradingDay(todayET)) return { statusCode: 200, body: 'not a trading day; no-op' };

  // Discord bot token: admin UI value (integration_secrets) wins, else env.
  let discordToken = (process.env.DISCORD_BOT_TOKEN ?? '').trim();
  try {
    const rows = await sbGet<{ value: string | null }>(url, serviceKey, 'integration_secrets?key=eq.discord_bot_token&select=value');
    const dbToken = (rows[0]?.value ?? '').trim();
    if (dbToken) discordToken = dbToken;
  } catch { /* fall back to env */ }

  const emailReady = !!(resendKey && fromEmail);
  const discordReady = !!discordToken;
  if (!emailReady && !discordReady) {
    await logRun('skipped', 0, 'no channel configured (email/Discord) — alerts disabled');
    return { statusCode: 200, body: 'no channel configured; no-op' };
  }

  try {
    const [configs, profiles, positions, execs, states] = await Promise.all([
      sbGet<ConfigRow>(url, serviceKey, 'risk_config?select=user_id,ibkr_nlv,equity_peak,cumulative_cashflow,equity_peak_cashflow,ladder,per_stock_ladder,drawdown_near_band_pp'),
      sbGet<ProfileRow>(url, serviceKey, 'profiles?select=user_id,email,status,discord_user_id,preferences'),
      sbGet<PositionRow>(url, serviceKey, 'user_positions?select=user_id,underlying,asset_class,quantity,avg_cost,mark_price,multiplier&asset_class=eq.STK'),
      sbGet<ExecRow>(url, serviceKey, 'user_executions?select=user_id,underlying,asset_class,quantity,executed_at&asset_class=eq.STK'),
      sbGet<AlertStateRow>(url, serviceKey, 'risk_alert_state?select=user_id,alert_kind,scope,last_level,last_alerted_at'),
    ]);

    const profileBy = new Map(profiles.map((p) => [p.user_id, p]));
    const stateBy = new Map(states.map((s) => [`${s.user_id}|${s.alert_kind}|${s.scope}`, s]));
    // One alert per user per trading DAY (ET): a user is capped if any of their alert rows was
    // already stamped today.
    const alertedTodayByUser = new Set<string>();
    for (const s of states) if (s.last_alerted_at && tradingDateET(s.last_alerted_at) === todayET) alertedTodayByUser.add(s.user_id);

    const posByUser = new Map<string, PositionRow[]>();
    for (const p of positions) { if (!posByUser.has(p.user_id)) posByUser.set(p.user_id, []); posByUser.get(p.user_id)!.push(p); }
    const fillsByUserTicker = new Map<string, PositionFill[]>();
    for (const e of execs) {
      const k = `${e.user_id}|${e.underlying}`;
      if (!fillsByUserTicker.has(k)) fillsByUserTicker.set(k, []);
      fillsByUserTicker.get(k)!.push({ quantity: e.quantity, executedAt: e.executed_at });
    }

    // Live-price the union of held stock tickers once (server-side), so drawdown reflects
    // the intraday move the user would act on — not the last sync.
    const tickers = [...new Set(positions.map((p) => p.underlying))];
    const quotes = await fetchQuotes(tickers, finnhubKey);
    const priceOf = (t: string) => quotes.get(t) ?? null;

    let usersAlerted = 0, sendFailures = 0;
    const failures: string[] = [];

    for (const cfg of configs) {
      const profile = profileBy.get(cfg.user_id);
      if (!profile || profile.status !== 'active' || profile.preferences?.drawdownAlertsOptOut) continue;
      const canEmail = emailReady && !!profile.email;
      const canDiscord = discordReady && !!profile.discord_user_id;
      if (!canEmail && !canDiscord) continue;

      const nearBand = cfg.drawdown_near_band_pp ?? DRAWDOWN_NEAR_BAND_PP;
      const userPositions = posByUser.get(cfg.user_id) ?? [];
      const alerts: Alert[] = [];
      const evaluated: Evaluated[] = [];

      // Account drawdown ladder — LIVE NLV vs the settled peak.
      const marks: LivePositionMark[] = userPositions.map((p) => ({
        assetClass: p.asset_class, underlying: p.underlying, quantity: p.quantity, syncedMark: p.mark_price, multiplier: p.multiplier,
      }));
      const { nlv: liveNlv } = liveNlvFromMarks(cfg.ibkr_nlv, marks, priceOf);
      const ddPct = cashflowAdjustedDrawdownPct(liveNlv, cfg.equity_peak, cfg.cumulative_cashflow, cfg.equity_peak_cashflow);
      if (ddPct !== null) {
        const s = drawdownLadderStatus(cfg.ladder ?? [], ddPct, nearBand);
        const level = levelOf(s.severity, s.activeStep?.drawdownPct ?? null);
        evaluated.push({ kind: 'account_drawdown', scope: 'account', level });
        if (level > (stateBy.get(`${cfg.user_id}|account_drawdown|account`)?.last_level ?? 0)) {
          alerts.push({
            kind: 'account_drawdown', scope: 'account',
            line: s.activeStep
              ? `Portfolio drawdown ${ddPct.toFixed(1)}% — past the ${s.activeStep.drawdownPct}% rung. Your plan: reduce gross exposure toward ${s.activeStep.targetGrossPct}%.`
              : `Portfolio drawdown ${ddPct.toFixed(1)}% — nearing the ${s.nextStep?.drawdownPct ?? ''}% rung.`,
          });
        }
      }

      // Per-stock stop ladders — LIVE price vs entry.
      const ladder = cfg.per_stock_ladder ?? DEFAULT_PER_STOCK_LADDER;
      const byTicker = new Map<string, { qty: number; costW: number; absQty: number; mark: number | null }>();
      for (const p of userPositions) {
        const qty = p.quantity ?? 0;
        if (qty === 0 || p.avg_cost == null) continue;
        const agg = byTicker.get(p.underlying) ?? { qty: 0, costW: 0, absQty: 0, mark: p.mark_price };
        agg.qty += qty; agg.costW += p.avg_cost * Math.abs(qty); agg.absQty += Math.abs(qty); agg.mark = p.mark_price ?? agg.mark;
        byTicker.set(p.underlying, agg);
      }
      for (const [ticker, agg] of byTicker) {
        if (agg.absQty === 0) continue;
        const avgCost = agg.costW / agg.absQty;
        const price = priceOf(ticker) ?? agg.mark;
        if (avgCost <= 0 || price == null) continue;
        const drawdown = ((price - avgCost) / avgCost) * 100;
        const episode = reconstructPositionEpisode(fillsByUserTicker.get(`${cfg.user_id}|${ticker}`) ?? []);
        const reconciles = episode.hasOpenEpisode && Math.abs(episode.reconstructedQty - agg.qty) <= 1e-3;
        const status = perStockLadderStatus(drawdown, agg.qty, reconciles ? episode.peakQty : 0, ladder, nearBand);
        const level = levelOf(status.severity, status.activeRung?.drawdownPct ?? null);
        evaluated.push({ kind: 'per_stock', scope: ticker, level });
        if (level > (stateBy.get(`${cfg.user_id}|per_stock|${ticker}`)?.last_level ?? 0)) {
          alerts.push({
            kind: 'per_stock', scope: ticker,
            line: status.activeRung
              ? `${ticker} down ${drawdown.toFixed(1)}% from entry — past the ${status.activeRung.drawdownPct}% rung. Your plan: hold ≤ ${status.activeRung.holdFractionPct}% of peak size.`
              : `${ticker} down ${drawdown.toFixed(1)}% from entry — nearing the ${status.nextRung?.drawdownPct ?? ''}% rung.`,
          });
        }
      }

      // Send: only if there's a NEW escalation AND the user hasn't been alerted yet today.
      let sent = false;
      if (alerts.length > 0 && !alertedTodayByUser.has(cfg.user_id)) {
        const uid8 = cfg.user_id.slice(0, 8);
        let delivered = false;
        if (canEmail) {
          const subject = `STW Companion — drawdown alert (${alerts.length} item${alerts.length === 1 ? '' : 's'})`;
          const e = await sendEmail(resendKey, fromEmail, profile.email!, subject, renderEmail(alerts, appUrl));
          if (e) { sendFailures += 1; failures.push(`email ${uid8}: ${e}`); } else delivered = true;
        }
        if (canDiscord) {
          const e = await sendDiscordDm(discordToken, profile.discord_user_id!, renderDiscord(alerts, appUrl));
          if (e) { sendFailures += 1; failures.push(`discord ${uid8}: ${e}`); } else delivered = true;
        }
        if (delivered) { sent = true; usersAlerted += 1; alertedTodayByUser.add(cfg.user_id); }
      }

      // Reconcile state. Recovery clears a row. On a send we advance the escalated scopes
      // (level + today's stamp). A capped/undelivered escalation is left PENDING (no write) so
      // it fires as the first alert of the next day. A de-escalation tracks down (keeps stamp).
      const escalated = new Set(alerts.map((a) => `${a.kind}|${a.scope}`));
      for (const e of evaluated) {
        const key = `${cfg.user_id}|${e.kind}|${e.scope}`;
        const prior = stateBy.get(key);
        const storedLevel = prior?.last_level ?? 0;
        try {
          if (e.level === 0) {
            if (prior) await sbDelete(url, serviceKey, 'risk_alert_state', `user_id=eq.${cfg.user_id}&alert_kind=eq.${e.kind}&scope=eq.${encodeURIComponent(e.scope)}`);
          } else if (e.level > storedLevel) {
            if (sent && escalated.has(`${e.kind}|${e.scope}`)) {
              await sbUpsert(url, serviceKey, 'risk_alert_state', { user_id: cfg.user_id, alert_kind: e.kind, scope: e.scope, last_level: e.level, last_alerted_at: ranAt, updated_at: ranAt }, 'user_id,alert_kind,scope');
            }
            // else: capped/undelivered → leave pending for the next day.
          } else if (e.level < storedLevel) {
            await sbUpsert(url, serviceKey, 'risk_alert_state', { user_id: cfg.user_id, alert_kind: e.kind, scope: e.scope, last_level: e.level, last_alerted_at: prior?.last_alerted_at ?? null, updated_at: ranAt }, 'user_id,alert_kind,scope');
          }
        } catch (err) { failures.push(`state ${cfg.user_id.slice(0, 8)}/${e.scope}: ${err instanceof Error ? err.message : String(err)}`); }
      }
    }

    const summary = `alerted ${usersAlerted} user(s)` + (sendFailures ? ` · ${sendFailures} send failure(s)` : '') + (failures.length ? ` · ${failures.join('; ')}` : '');
    await logRun(sendFailures || failures.length ? 'error' : 'ok', usersAlerted, summary);
    return { statusCode: 200, body: summary };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    await logRun('error', 0, `threw: ${detail}`);
    return { statusCode: 500, body: detail };
  }
};

function renderEmail(alerts: Alert[], appUrl: string): string {
  const items = alerts.map((a) => `<li style="margin:0 0 8px;line-height:1.5">${a.line}</li>`).join('');
  const link = appUrl ? `<p style="margin:16px 0 0"><a href="${appUrl}/portfolio?tab=risk" style="color:#16a34a">Open your Risk tab →</a></p>` : '';
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:520px;margin:0 auto;color:#111">
    <h2 style="font-size:16px;margin:0 0 4px">Drawdown alert</h2>
    <p style="font-size:13px;color:#555;margin:0 0 12px">Your account crossed or is nearing a de-risk level you set. This is an advisory heads-up — nothing here places or blocks a trade.</p>
    <ul style="font-size:14px;padding-left:18px;margin:0">${items}</ul>
    ${link}
    <p style="font-size:11px;color:#999;margin:20px 0 0">Advisory only, based on live prices. Manage or turn off these alerts in Settings.</p>
  </div>`;
}

function renderDiscord(alerts: Alert[], appUrl: string): string {
  const items = alerts.map((a) => `• ${a.line}`).join('\n');
  const link = appUrl ? `\n${appUrl}/portfolio?tab=risk` : '';
  return `**Drawdown alert** — your account crossed or is nearing a de-risk level you set.\n${items}${link}\n_Advisory only, based on live prices._`;
}

// Every 15 min, 13:00–21:59 UTC Mon–Fri — covers US regular hours in both EST and EDT; the
// handler skips holidays. schedule() runs cron on the PROD (main) deploy only.
export const handler = schedule('*/15 13-21 * * 1-5', handlerImpl);

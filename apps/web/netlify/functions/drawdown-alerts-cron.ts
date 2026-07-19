/**
 * drawdown-alerts-cron — Item 3 of plans/20260719_drawdown-protection-overhaul.md.
 *
 * The Risk tab shows drawdown warnings, but only when the user is looking. This scheduled
 * fn reaches them off-app: once per trading day (after ibkr-sync-cron has refreshed
 * positions + NLV) it evaluates every user's ACCOUNT drawdown ladder and each PER-STOCK
 * stop ladder, and emails a summary when one ESCALATES — a deeper rung, or ok→near→breach.
 *
 * De-dup via risk_alert_state (migration 073): a monotonic `last_level` per (user, kind,
 * scope). We only send when the current level exceeds the stored one, so a standing breach
 * isn't re-sent daily; a full recovery to ok clears the row so a re-entry alerts afresh.
 *
 * Runs on SYNCED data (ibkr_nlv + stored marks) — correct for a post-sync daily cron; the
 * live-price responsiveness (Item 2) is for the interactive UI. Reuses the SAME pure engine
 * (@stw/shared) as the Risk tab, so the cron and the screen never disagree.
 *
 * Conventions (CLAUDE.md): direct fetch() to Supabase REST + Resend (no @supabase/supabase-js
 * or an email SDK). `.trim()` every env var. schedule() runs cron on the PROD (main) deploy
 * only. Web-only (like ibkr-sync-cron) — no admin copy, so no fn-parity entry.
 *
 * Required Netlify env: VITE_SUPABASE_URL (or SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY,
 * RESEND_API_KEY, ALERT_FROM_EMAIL. Optional: APP_URL (link in the email). Until RESEND_API_KEY
 * is set the fn no-ops (computes nothing durable), so it can ship dormant and be turned on later.
 */
import type { Handler } from '@netlify/functions';
import { schedule } from '@netlify/functions';
import {
  cashflowAdjustedDrawdownPct, drawdownLadderStatus,
  perStockLadderStatus, reconstructPositionEpisode,
  DEFAULT_PER_STOCK_LADDER, DRAWDOWN_NEAR_BAND_PP,
  type DrawdownStep, type PerStockDrawdownStep, type PositionFill,
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
// channel with the user, then post the message. Bot identity is entirely the token, so
// swapping the test bot for the production one is just the env var — no code change.
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
interface AlertStateRow { user_id: string; alert_kind: string; scope: string; last_level: number }

/** Monotonic severity level: 0 ok · 1 near · 100 + |rung%| breach (deeper = higher). */
function levelOf(severity: string, activeRungDrawdownPct: number | null): number {
  if (severity === 'breach') return 100 + Math.abs(activeRungDrawdownPct ?? 0);
  if (severity === 'near') return 1;
  return 0;
}

interface Alert { scope: string; kind: 'account_drawdown' | 'per_stock'; line: string; level: number }

const handlerImpl: Handler = async () => {
  const url = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  const resendKey = (process.env.RESEND_API_KEY ?? '').trim();
  const fromEmail = (process.env.ALERT_FROM_EMAIL ?? '').trim();
  const appUrl = (process.env.APP_URL ?? '').trim();
  if (!url || !serviceKey) return { statusCode: 500, body: 'Server misconfigured (Supabase env)' };

  // Discord bot token: the admin-managed value (integration_secrets, migration 075) wins so
  // the bot can be swapped from the UI; the DISCORD_BOT_TOKEN env is the fallback.
  let discordToken = (process.env.DISCORD_BOT_TOKEN ?? '').trim();
  try {
    const rows = await sbGet<{ value: string | null }>(url, serviceKey, 'integration_secrets?key=eq.discord_bot_token&select=value');
    const dbToken = (rows[0]?.value ?? '').trim();
    if (dbToken) discordToken = dbToken;
  } catch { /* table absent / no rows — fall back to env */ }

  const emailReady = !!(resendKey && fromEmail);
  const discordReady = !!discordToken;

  const ranAt = new Date().toISOString();
  const logRun = async (status: string, processed: number, summary: string) => {
    try {
      await sbInsert(url, serviceKey, 'run_log', {
        run_type: 'drawdown-alerts-cron', status, messages_processed: processed, ran_at: ranAt, summary: summary.slice(0, 500),
      });
    } catch { /* run_log is best-effort */ }
  };

  // Dormant until at least one channel is configured — do nothing durable so the first
  // configured run sends the then-current escalations rather than having silently advanced
  // the state.
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
      sbGet<AlertStateRow>(url, serviceKey, 'risk_alert_state?select=user_id,alert_kind,scope,last_level'),
    ]);

    const profileBy = new Map(profiles.map((p) => [p.user_id, p]));
    const stateBy = new Map(states.map((s) => [`${s.user_id}|${s.alert_kind}|${s.scope}`, s.last_level]));
    const posByUser = new Map<string, PositionRow[]>();
    for (const p of positions) { if (!posByUser.has(p.user_id)) posByUser.set(p.user_id, []); posByUser.get(p.user_id)!.push(p); }
    const fillsByUserTicker = new Map<string, PositionFill[]>();
    for (const e of execs) {
      const k = `${e.user_id}|${e.underlying}`;
      if (!fillsByUserTicker.has(k)) fillsByUserTicker.set(k, []);
      fillsByUserTicker.get(k)!.push({ quantity: e.quantity, executedAt: e.executed_at });
    }

    let usersAlerted = 0, emailsFailed = 0;
    const failures: string[] = [];

    for (const cfg of configs) {
      const profile = profileBy.get(cfg.user_id);
      if (!profile || profile.status !== 'active' || profile.preferences?.drawdownAlertsOptOut) continue;
      // Needs at least one reachable, configured channel, else there's nothing to send to.
      const canEmail = emailReady && !!profile.email;
      const canDiscord = discordReady && !!profile.discord_user_id;
      if (!canEmail && !canDiscord) continue;

      const nearBand = cfg.drawdown_near_band_pp ?? DRAWDOWN_NEAR_BAND_PP;
      const alerts: Alert[] = [];
      // (kind, scope) → current level, so we reconcile state for everything we evaluated.
      const evaluated = new Map<string, { kind: 'account_drawdown' | 'per_stock'; scope: string; level: number }>();
      const note = (kind: 'account_drawdown' | 'per_stock', scope: string, level: number) => evaluated.set(`${kind}|${scope}`, { kind, scope, level });

      // Account drawdown ladder (synced NLV vs the settled peak).
      const ddPct = cashflowAdjustedDrawdownPct(cfg.ibkr_nlv, cfg.equity_peak, cfg.cumulative_cashflow, cfg.equity_peak_cashflow);
      if (ddPct !== null) {
        const s = drawdownLadderStatus(cfg.ladder ?? [], ddPct, nearBand);
        const level = levelOf(s.severity, s.activeStep?.drawdownPct ?? null);
        note('account_drawdown', 'account', level);
        if (level > (stateBy.get(`${cfg.user_id}|account_drawdown|account`) ?? 0)) {
          alerts.push({
            kind: 'account_drawdown', scope: 'account', level,
            line: s.activeStep
              ? `Portfolio drawdown ${ddPct.toFixed(1)}% — past the ${s.activeStep.drawdownPct}% rung. Your plan: reduce gross exposure toward ${s.activeStep.targetGrossPct}%.`
              : `Portfolio drawdown ${ddPct.toFixed(1)}% — nearing the ${s.nextStep?.drawdownPct ?? ''}% rung.`,
          });
        }
      }

      // Per-stock stop ladders.
      const ladder = cfg.per_stock_ladder ?? DEFAULT_PER_STOCK_LADDER;
      const byTicker = new Map<string, { qty: number; costW: number; absQty: number; mark: number | null }>();
      for (const p of posByUser.get(cfg.user_id) ?? []) {
        const qty = p.quantity ?? 0;
        if (qty === 0 || p.avg_cost == null) continue;
        const agg = byTicker.get(p.underlying) ?? { qty: 0, costW: 0, absQty: 0, mark: p.mark_price };
        agg.qty += qty; agg.costW += p.avg_cost * Math.abs(qty); agg.absQty += Math.abs(qty); agg.mark = p.mark_price ?? agg.mark;
        byTicker.set(p.underlying, agg);
      }
      for (const [ticker, agg] of byTicker) {
        if (agg.absQty === 0) continue;
        const avgCost = agg.costW / agg.absQty;
        if (avgCost <= 0 || agg.mark == null) continue;
        const drawdown = ((agg.mark - avgCost) / avgCost) * 100;
        const episode = reconstructPositionEpisode(fillsByUserTicker.get(`${cfg.user_id}|${ticker}`) ?? []);
        const reconciles = episode.hasOpenEpisode && Math.abs(episode.reconstructedQty - agg.qty) <= 1e-3;
        const status = perStockLadderStatus(drawdown, agg.qty, reconciles ? episode.peakQty : 0, ladder, nearBand);
        const level = levelOf(status.severity, status.activeRung?.drawdownPct ?? null);
        note('per_stock', ticker, level);
        if (level > (stateBy.get(`${cfg.user_id}|per_stock|${ticker}`) ?? 0)) {
          alerts.push({
            kind: 'per_stock', scope: ticker, level,
            line: status.activeRung
              ? `${ticker} down ${drawdown.toFixed(1)}% from entry — past the ${status.activeRung.drawdownPct}% rung. Your plan: hold ≤ ${status.activeRung.holdFractionPct}% of peak size.`
              : `${ticker} down ${drawdown.toFixed(1)}% from entry — nearing the ${status.nextRung?.drawdownPct ?? ''}% rung.`,
          });
        }
      }

      // Send a summary on every configured channel if anything escalated. State advances
      // only if at least ONE channel delivered — a total failure retries next run.
      if (alerts.length > 0) {
        const uid8 = cfg.user_id.slice(0, 8);
        let delivered = false;
        if (canEmail) {
          const subject = `STW Companion — drawdown alert (${alerts.length} item${alerts.length === 1 ? '' : 's'})`;
          const e = await sendEmail(resendKey, fromEmail, profile.email!, subject, renderEmail(alerts, appUrl));
          if (e) { emailsFailed += 1; failures.push(`email ${uid8}: ${e}`); } else delivered = true;
        }
        if (canDiscord) {
          const e = await sendDiscordDm(discordToken, profile.discord_user_id!, renderDiscord(alerts, appUrl));
          if (e) { emailsFailed += 1; failures.push(`discord ${uid8}: ${e}`); } else delivered = true;
        }
        if (!delivered) continue; // nothing got through — leave state so it retries
        usersAlerted += 1;
      }

      // Reconcile state: delete on recovery, upsert current level otherwise (stamp the
      // alert time only when we actually escalated this run).
      for (const { kind, scope, level } of evaluated.values()) {
        const alerted = alerts.some((a) => a.kind === kind && a.scope === scope);
        try {
          if (level === 0) {
            await sbDelete(url, serviceKey, 'risk_alert_state', `user_id=eq.${cfg.user_id}&alert_kind=eq.${kind}&scope=eq.${encodeURIComponent(scope)}`);
          } else {
            await sbUpsert(url, serviceKey, 'risk_alert_state', {
              user_id: cfg.user_id, alert_kind: kind, scope, last_level: level,
              ...(alerted ? { last_alerted_at: ranAt } : {}), updated_at: ranAt,
            }, 'user_id,alert_kind,scope');
          }
        } catch (e) { failures.push(`state ${cfg.user_id.slice(0, 8)}/${scope}: ${e instanceof Error ? e.message : String(e)}`); }
      }
    }

    const summary = `alerted ${usersAlerted} user(s)` + (emailsFailed ? ` · ${emailsFailed} send failure(s)` : '') + (failures.length ? ` · ${failures.join('; ')}` : '');
    await logRun(emailsFailed || failures.length ? 'error' : 'ok', usersAlerted, summary);
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
    <p style="font-size:11px;color:#999;margin:20px 0 0">Advisory only, based on your last IBKR sync. Manage or turn off these alerts in Settings.</p>
  </div>`;
}

function renderDiscord(alerts: Alert[], appUrl: string): string {
  // Discord message = markdown, ≤2000 chars. Keep it short + advisory.
  const items = alerts.map((a) => `• ${a.line}`).join('\n');
  const link = appUrl ? `\n${appUrl}/portfolio?tab=risk` : '';
  return `**Drawdown alert** — your account crossed or is nearing a de-risk level you set.\n${items}${link}\n_Advisory only, based on your last IBKR sync._`;
}

export const handler = schedule('30 8 * * 2-6', handlerImpl);

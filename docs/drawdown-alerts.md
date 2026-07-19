# Drawdown alerts — setup & operations

The drawdown-protection alerts (Item 3 of `plans/20260719_drawdown-protection-overhaul.md`).
Advisory/display-only — nothing here places, blocks, or adjusts a trade.

## Channels

| Channel | Status | Where |
|--|--|--|
| **In-app** | ✅ live | My Portfolio → Overview chips (account drawdown + per-stock stops) → link to the Risk tab / stop-filtered Positions. Always on, no config. |
| **Email (Resend)** | ✅ built, **dormant until env is set** | `apps/web/netlify/functions/drawdown-alerts-cron.ts` |
| **Discord-bot DM** | 🔲 not built (see below) | — |

## How the email cron works

- **Schedule:** `30 8 * * 2-6` (30 min after `ibkr-sync-cron`), so it evaluates fresh synced
  data. `schedule()` runs cron on the **prod (`main`) deploy only** — never staging.
- **What it checks:** each user's **account** drawdown ladder + each **per-stock** stop ladder,
  using the same `@stw/shared` engine the Risk tab uses (cron ↔ screen always agree). Runs off the
  last IBKR sync (`ibkr_nlv` + stored marks) — correct for a post-sync daily job.
- **When it emails:** on **escalation only** — a deeper rung, or ok→near→breach. De-dup lives in
  `risk_alert_state` (migration 073): a monotonic `last_level` per (user, kind, scope); an email
  goes out only when the current level exceeds the stored one, and the row is deleted on full
  recovery so a later re-entry alerts afresh. A standing breach is **not** re-sent daily.
- **Who gets it:** profiles with `status = 'active'`, a real email, and computable drawdown.
  Honors an opt-out flag at `profiles.preferences.drawdownAlertsOptOut = true` (no Settings toggle
  wired yet — the fn already respects the flag if set directly).
- **Safety:** until `RESEND_API_KEY` + `ALERT_FROM_EMAIL` are set the fn no-ops and advances **no**
  state, so it ships dormant; the first configured run then sends the then-current escalations.

## Required env (web Netlify site → Site configuration → Environment variables)

| Var | What | Where to get it |
|--|--|--|
| `RESEND_API_KEY` | Resend sending key | resend.com → *API Keys* → create (Sending access). Free tier ≈3,000/mo, 100/day. |
| `ALERT_FROM_EMAIL` | The "From" address | Any address on a **domain you've verified in Resend** (*Domains* → add domain → SPF/DKIM DNS records), e.g. `alerts@yourdomain`. Resend rejects an unverified-domain sender. |
| `APP_URL` *(optional)* | Web app base URL | Your subscriber site's public URL (Netlify → that site → *Site overview*). Only builds the "Open your Risk tab →" link; omit to drop it. |

Quick smoke test before verifying a domain: Resend allows `onboarding@resend.dev` as the sender,
but it only delivers to the Resend account owner's email. Verify your domain before real
subscribers are in scope.

## Discord-bot DM — what it would take

The repo's existing Discord wiring is **inbound only** (the routines read STW's channels for
commentary — `traders.discord_user_id`, `channels.discord_channel_id`). Outbound DMs to
subscribers are a separate build. Requirements:

1. **A Discord application + bot** (discord.com/developers → New Application → Bot) → a
   `DISCORD_BOT_TOKEN`. Send-only DMs use the **REST API** (`POST /users/@me/channels` to open a
   DM, then `POST /channels/{id}/messages`) — no gateway websocket needed.
2. **A shared server.** Discord only lets a bot DM a user who **shares a server** with it, so every
   subscriber must be in your Discord server (the bot joins it too).
3. **Per-user linking.** We need each subscriber's **Discord user ID** stored (a new
   `profiles.discord_user_id` for subscribers — today only `traders` has one). Cleanest is a Discord
   **OAuth2 "identify"** link flow in Settings; alternatively the user pastes their Discord ID.
4. **User privacy setting.** The subscriber must allow DMs from server members, or the send fails.

**Trade-off vs email:** per-user and no deliverability/spam concerns, but it requires every
subscriber to (a) be in the server, (b) link Discord, (c) allow DMs — real friction, and not
everyone uses Discord. So it's best as an **addition** for Discord-active users, not a replacement
for email. The alert-evaluation + de-dup engine (`risk_alert_state`) is channel-agnostic, so adding
Discord is just a second send path in the same cron.

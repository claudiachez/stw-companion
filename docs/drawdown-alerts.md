# Drawdown alerts — setup & operations

The drawdown-protection alerts (Item 3 of `plans/20260719_drawdown-protection-overhaul.md`).
Advisory/display-only — nothing here places, blocks, or adjusts a trade.

## Channels

| Channel | Status | Where |
|--|--|--|
| **In-app** | ✅ live | My Portfolio → Overview chips (account drawdown + per-stock stops) → link to the Risk tab / stop-filtered Positions. Always on, no config. |
| **Email (Resend)** | ✅ built, **dormant until env is set** | `apps/web/netlify/functions/drawdown-alerts-cron.ts` |
| **Discord-bot DM** | ✅ built (test bot), **dormant until env + linking** | same cron; linked in Settings → Alert delivery |

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
| Discord bot token | Bot token for DM alerts | **Preferred: the admin UI** — apps/admin → Config → *Discord alert bot* (stored in `integration_secrets`, admin-only, write-only). Swapping the **test bot** for another is done there, no redeploy. `DISCORD_BOT_TOKEN` env is a fallback if the UI value is unset. Get the token at discord.com/developers → your app → Bot → Reset/Copy Token. |
| `APP_URL` *(optional)* | Web app base URL | Your subscriber site's public URL (Netlify → that site → *Site overview*). Builds the "Open your Risk tab →" link in both email + Discord; omit to drop it. |

Each channel is independent: set email vars for email, `DISCORD_BOT_TOKEN` for Discord, or both.
The cron sends on every configured+linked channel and only advances its de-dup state if at least
one delivered.

Quick smoke test before verifying a domain: Resend allows `onboarding@resend.dev` as the sender,
but it only delivers to the Resend account owner's email. Verify your domain before real
subscribers are in scope.

## Discord-bot DM — how it's wired (test bot)

The repo's existing Discord wiring is **inbound only** (the routines read STW's channels for
commentary — `traders.discord_user_id`, `channels.discord_channel_id`). This is the separate
**outbound** path: the alert cron DMs a subscriber via a bot. Built as a **test bot** for now — it
will be swapped for the production bot later, which is just changing `DISCORD_BOT_TOKEN` (the bot's
identity is entirely the token; no code change).

**To turn it on:**
1. **Create a Discord app + bot** (discord.com/developers → New Application → Bot). Copy the token —
   the **Bot Token** from the *Bot* tab (NOT the *Public Key* on General Information; that's only for
   verifying inbound interactions and can't send). Enable the **GUILD_MEMBERS** privileged intent on
   the Bot tab (needed to resolve a username → id). Send-only DMs use the **REST API** (`POST
   /users/@me/channels` then `POST /channels/{id}/messages`) — no gateway/websocket.
2. **Add the bot to your server + set the server ID.** Discord only lets a bot DM a user who
   **shares a server** with it. In **apps/admin → Config → Discord alert bot**, paste the **bot
   token** and the **server (guild) ID** (right-click the server → Copy Server ID) → Save. The UI
   token overrides `DISCORD_BOT_TOKEN` env, so the bot is **swapped from the UI** with no redeploy.
3. **Link the user by username.** Each subscriber enters their **Discord username** in **Settings →
   Alert delivery → Link** (as Whop shows it). The `discord-link` fn resolves it to the numeric id by
   searching the server's members (bot token, server-side) and stores `profiles.discord_user_id` (DM
   target) + `discord_username` (display). *Interim* — once Whop is wired it feeds both directly and
   this manual link goes away (see decisions.md "flow through WHOP").
4. **Allow DMs.** The user must be in the server and allow DMs from server members, or the send fails.

**Trade-off vs email:** per-user, no deliverability/spam concerns, but requires each subscriber to
(a) be in the server, (b) link Discord, (c) allow DMs — real friction, and not everyone uses
Discord. Best as an **addition** for Discord-active users, not a replacement for email. The
evaluation + de-dup engine (`risk_alert_state`) is channel-agnostic — Discord is just a second send
path in the same cron.

## Still open
- A Discord **OAuth link flow** (replace the manual ID paste).
- A Settings **opt-out toggle** for email (the cron already honors `preferences.drawdownAlertsOptOut`).

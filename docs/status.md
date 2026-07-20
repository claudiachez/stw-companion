# Current status

> The transient snapshot — what's in flight, what's pending, what's next. Updated every session
> (by `/wrap-up`). Durable rules live in CLAUDE.md; dated history in docs/session-history.md.

## State
- All product code through **PR #149** is on `staging`. **A `staging → main` promotion is PENDING**
  (host-approved required) — `origin/main..origin/staging` is **33 commits**. It carries the earlier
  batch (AM recap + GEX at 8:32 #140, GEX QUICK-READ parser #141, GEX freshness guard #142, Account
  Value NLV line #143) **plus the entire drawdown-protection overhaul** (#145–#149). **Scheduled fns
  only run on the `main` deploy** — so none of the crons below fire on prod until the promotion.
- **Migrations at `076`.** Applied: 072/073/075 on **PROD + sandbox**; 074/076 on **PROD only**
  (sandbox has no `profiles` table — partial schema DB). All verified present this session.
- CI (typecheck/lint/test/fn-parity) green on every merged PR. Run `/stw-review` before opening one.

## Drawdown-protection overhaul — DONE (plans/20260719_drawdown-protection-overhaul.md)
All four items shipped + polish (details in docs/decisions.md + docs/drawdown-alerts.md):
- **1 — Drawdown always shown** on the Risk tab + amber `near` band (user-set `drawdown_near_band_pp`).
- **2 — Drawdown READ off LIVE prices** (Option A: live "now", peak stays synced). One-source
  exception recorded; `ibkr_nlv` still the % denominator.
- **3 — Alerts:** in-app (Overview chips), **email (Resend)** + **Discord DM** via
  `drawdown-alerts-cron` — runs **every 15 min in market hours, live-priced, one alert per user per
  day** (fires when a rung crosses). Discord token/guild managed in **admin → Config**; subscriber
  links by **username** in Settings → Alert delivery (resolved by the `discord-link` fn).
- **4 — Per-stock drawdown ladder** (reduce-to-% of peak, trim-aware via `user_executions`).

## Pending host actions
1. **`staging → main` promotion** (approval-gated) — required for ALL scheduled fns to run on prod,
   including the new alert cron. Nothing sends until this lands.
2. **To enable off-app alerts** (set on the **web** Netlify site): `RESEND_API_KEY` + `ALERT_FROM_EMAIL`
   (email); Discord bot token + server (guild) ID in **admin → Config → Discord alert bot**; enable the
   bot's **GUILD_MEMBERS** intent + invite it to the STW server. `VITE_FINNHUB_KEY` is already set.
   Dormant (no-op) until a channel is configured.

## Next work
1. **Whop integration** (the locked direction — docs/decisions.md "flow through WHOP"): app access
   mirrors Whop membership (`/me/has_access` + `membership.activated`/`deactivated` webhooks and/or
   Login-with-Whop), and Whop feeds `profiles.discord_user_id`/`discord_username`. Do NOT build a
   separate auth or Discord-OAuth — it would contradict this. The manual username-link is interim.
2. **Parked follow-ups:** a Settings **email opt-out** toggle (the cron already honors
   `preferences.drawdownAlertsOptOut`); the RegimeLight ↔ Macro-trend one-source fix (SPY shows
   Momentum on Risk vs Healthy Pullback on Macro — two independent close fetches; pre-existing).

## Notes
- `ibkr_nlv` refreshes on every sync (`ibkr_nlv_at` stamps it); only `cumulative_cashflow` is
  import-only. `risk_config.updated_at` is stale/unrelated — never use it as an as-of.

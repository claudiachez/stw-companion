# STW Companion — Claude Code Guide

> **⚠️ START HERE — branch.** **`staging` is the active trunk** — all feature work happens here.
> **`staging` is ~112 commits ahead of `main` as of 2026-07-10** (check `git log --oneline
> origin/main..origin/staging | wc -l` for the exact count) (last completed promotion was PR #66 on
> 2026-07-05). A `staging → main` PR is a separate, approval-gated production deploy; **do not open one
> without explicit host approval**, even if staging looks ready.
> **⏳ A `staging → main` production-promotion PR ([#81](https://github.com/claudiachez/stw-companion/pull/81))
> is OPEN and pending merge** (host-approved). If it has merged by your session, `staging`≈`main` and the
> FRED/GICS work is LIVE — run the post-deploy verification in its PR body (esp. confirm `FRED_API_KEY`
> is set on the Netlify **production** context, and that a fresh `macro_daily_snapshots` row carries
> `engine_version=macro-snapshot-2.0.0`). If it's still open, the work below is staging-only.
> **No other open PRs.** This session merged **PR #78** (FRED feeds re-platform + Macro UI), **PR #79**
> (GICS taxonomy + `sector-map-sync`), and **PR #80** (docs refresh: new `docs/feeds.md`, rewritten
> `docs/workflow.md`, FRED-updated macro guides, lowercase doc filenames). Branches cleaned up. Cut a
> normal feature branch from `staging` for new work.
> Migrations run to **062 on `staging`**, applied on **both PROD and sandbox** (058 is PROD-only —
> sandbox has no `tiers`/`profiles` tables to apply it to; this is a known, permanent gap, not
> pending work). This session added **061** (regime sleeve weights → `app_config`) and **062**
> (`ticker_sector_map` re-seeded Finnhub-label → **GICS-11 + ETF/Cash**) — **both applied to PROD +
> sandbox, verified identical**.
> `app_config.ibkr_live_trading_enabled` = **`0` on both PROD and sandbox** (last confirmed 2026-07-05).
> **New Netlify env var this session: `FRED_API_KEY`** (server-side, no `VITE_` prefix) — set on both
> sites; the macro index feeds + Event Risk depend on it. If migrations stop well short of 062 you are on a stale checkout, re-sync.
> **First commands every session:** `git fetch origin && git checkout staging && git pull --ff-only`.
> Sanity check: `supabase/migrations/` should go up to `062_ticker_sector_map_gics.sql`,
> `packages/shared/src/constants/sectors.ts` and `packages/shared/src/utils/fred.ts` should exist, and
> `plans/` files are **date-prefixed** (`YYYYMMDD_<name>`) — if any is missing, you're on a stale
> checkout. Then **cut a feature branch** before making any change:
> `git checkout -b claude/<short-feature-name>`. **Never commit directly to `staging`** — work on
> the branch, push it, open a PR back to `staging` (host merges/approves).
> (Note: `memory/` lives in local `~/.claude/`, NOT in the repo — never reference it in a prompt meant
> for a remote session; put anything a future session needs into the repo.)

## Ground Rules
- If instructions seem to conflict, **always ask before doing anything**
- **Never commit directly to `staging`** — cut a `claude/<feature>` branch first, every session (see
  Branch Strategy). `staging` auto-deploys on every push, so direct commits put unreviewed/in-progress
  work straight onto the deployed staging site.
- Never force-push or reset `staging` or `main`
- Never push to `main` without explicit approval — that is production
- Write shared styling/logic/data **once** in the shared packages, never twice across apps
- **Every timestamp uses `fmtDateTime` from `@stw/shared`** — never `toLocaleString`/`toLocaleTimeString` or a local date helper (see Conventions → Timestamps)
- **All UI changes must work on mobile** — design for ≤390px first; test layouts at narrow width before pushing
- **Refer to the host generically in prose, never by name** — specs, code comments, reports, and
  commit message bodies say "the host" (confirmed as a standing rule, 2026-07-05), matching existing
  practice throughout this file. Exception: literal technical identifiers that must stay accurate to
  be useful (an RLS policy's email, an org/task UUID) — those aren't narrative attribution and are fine
  as-is.
- **After ~10 commits in a chat**, run the Session Close routine (see section below)

---

## Current Status — Data-feeds re-platform (FRED) + GICS sector taxonomy (handoff 2026-07-10)

**Everything this session is on `staging` only, NOT production** (`staging` ~107 ahead of `main`). Two
PRs merged to `staging`, both branches cleaned up: **PR #78** (feeds re-platform + Macro UI) and
**PR #79** (GICS taxonomy + sync). Migrations **061 + 062 applied to PROD + sandbox** (verified). The
detailed inventory + rationale live in [`plans/20260707_data_feeds_inventory_and_plan.md`](plans/20260707_data_feeds_inventory_and_plan.md).

> ⚠️ The older TwelveData-centric macro narratives further down this file (2026-07-05 regime-badge /
> rate-limit story) are **superseded** by the FRED re-platform — macro *indices* no longer use
> TwelveData. See **Conventions → Macro data sources** for the current, authoritative wiring.

**[PR #78](https://github.com/claudiachez/stw-companion/pull/78) — feeds re-platform onto FRED + Macro UI:**
- **Macro indices → FRED** (free, ~120/min, authoritative), replacing the throttled TwelveData free tier:
  VIX→`VIXCLS`, VIX3M→`VXVCLS`, US10Y→`DGS10` (already %, no ×10 hack), credit→`BAMLH0A0HYM2` (real HY
  OAS spread, an upgrade over the HYG proxy), dollar→`DTWEXBGS`. FRED is server-only (no CORS) so the
  browser reads it through the `fred` Netlify proxy; the `macro-snapshot` + `regime-daily` writers call
  FRED directly. **TwelveData is now equity-daily-closes only** (trend ETFs + sector-rotation constituents).
- **VIX3M via FRED fixes `regime-daily`'s permanent `vol_state='UNKNOWN'`.**
- **VVIX removed entirely** — no free feed serves it; it was perpetually null (per the "no
  permanently-empty field" convention). Risk-Appetite gauge weights rescaled; value materially unchanged.
- **Event Risk rebuilt on FRED's release calendar** (`/fred/release/dates` per release_id: CPI 10 · PCE 54
  · NFP 50 · GDP 53 · PPI 46) + a static FOMC list — **the MarketWatch/cheerio scrape is retired** (`cheerio`
  is now an unused dep, safe to drop). No consensus/actual values (a calendar can't give them), so
  `classifyEventRisk`'s surprise/shock path no-ops; the upcoming-event windows work fully.
- **Market Internals** — Volatility/Stress + Credit/Liquidity + Rates+Dollar folded from three stacked
  cards into ONE compact `MarketInternalsCard` table (score + name + status left, key values right).
- **Macro tooltips** restructured (one line per indicator via a shared `<Help>` wrapper); the Market
  Regime tooltip shows the **live** configured weights.
- **Regime sleeve weights are admin-configurable** (migration 061 → `app_config`; Admin Config → "Market
  Regime weights"). `engineScore`/`environmentScore` take an optional weights param.
- **Every macro module footer now shows a full `fmtDateTime` "Updated:" stamp** (was date-only on some).
- `macro-snapshot` engine bumped to `macro-snapshot-2.0.0`.

**[PR #79](https://github.com/claudiachez/stw-companion/pull/79) — GICS sector taxonomy + auto-refresh:**
- **Canonical taxonomy = GICS-11 + ETF + Cash** (`packages/shared/src/constants/sectors.ts`). `resolveSector()`
  = `TICKER_GICS` override → else `FINNHUB_GICS` fold (Finnhub industries roll up to GICS along the real
  hierarchy) → else null. `ticker_sector_map` now stores GICS values (migration **062** re-seeded the 53
  rows: IT 25 · Industrials 20 · Cons. Disc. 3 · Comm. Services 2 · Financials 2 · Energy 1; + CASH→Cash,
  ARKK/SQQQ→ETF). VIAV hand-corrected to IT.
- **`sector-map-sync`** (web Netlify fn, weekdays 22:00 UTC + manual) auto-populates the map for newly-opened
  `holdings` tickers (Finnhub `profile2` fold), closing the gap where a new ticker (e.g. CCXI) had no sector.
- **ETF/Cash excluded from Risk sector concentration** (never a bucket, never `unevaluated`).
- **Admin Config**: Capital allocation + Live IBKR trading merged into one "Capital allocation & live
  trading (Admin only)" card.

**`apps/web` + `apps/admin` live-verification recipe (reused this session — the way to see either app
render):** the editor account `cc@claudiachez.com` is Google-OAuth-only, and the preview browser blocks
the OAuth redirect. To log into a local dev server, temporarily set a bcrypt password via SQL
(`update auth.users set encrypted_password = crypt('<tmp>', gen_salt('bf')) where email =
'cc@claudiachez.com'`), sign in with email+password, then **revert immediately** — to **NULL** on PROD
(it's OAuth-only), or to the **captured original hash** on sandbox (it HAS a password; `select
encrypted_password` first, restore it verbatim). `apps/web/.env.local` (gitignored; PROD URL + anon key)
already exists; `VITE_FINNHUB_KEY` is empty there but present in `apps/admin/.env.local` + `apps/web/.env`.
Everything this session was verified in-browser at 390px + 1280px against the real book (both apps);
password/hash restored exactly each time.

**Previous handoff (2026-07-05) — TwelveData rate-limit bug fixed + shipped to production, unchanged
since.** This session found the REAL reason the per-ticker regime badge never rendered: it
was never the "daily quota exhausted" cause diagnosed on 2026-07-03 — that was a real, separate event,
but the actual structural bug (still present after that quota reset) is that `tdBatchCloses()` bundled
many symbols into one comma-joined TwelveData call assuming that avoided the free tier's rate limit;
TwelveData actually bills **1 credit per symbol, not per HTTP call**, so any batch over 8 symbols
429'd unconditionally, every time — this was also silently degrading the already-shipped Macro tab
(Sector Rotation, Trend Structure, Volatility/Stress, Sentiment Gauge breadth all fire their own
uncoordinated batch calls on load). Fixed by chunking to ≤8 symbols with ~65s pacing (see "New this
session" below) — verified at the network level (429→200, pacing recovers across chunk boundaries),
merged to `staging` via PR #65, then promoted `staging → main` via PR #66 (host-approved) — **the
regime badge fix is live in production, but its actual visual render (the trend-structure chip
appearing on a held ticker) was NOT re-confirmed in-browser after the fix** — a cold load takes
several minutes to fully populate (paced ≤8 symbols/65s), so re-check on a real session rather than
assuming. The IBKR order flow remains **functionally verified in the browser but never tested against
a real IB Gateway** (no Gateway access from this environment) — unchanged from last session, still in
Next Steps. Below that, the Macro Dashboard v2 work from the 2026-07-02 handoff is unchanged — no
app/repo code changed there since except the rate-limit fix. That prior session (2026-07-02) also did
**out-of-repo routine maintenance only** (no commits):
fixed a dedup bug in the `stw-transcripts` routine (it edits Discord posts in place — see Data
Ingestion section for the durable rule), processed the missed Episode 29 webinar, and added a
verbatim portfolio-update archive step to `stw-friday-weighting`. None of this touched
`packages/`/`apps/`/`supabase/migrations/` — see Data Ingestion below if picking this up, otherwise
skip straight to Next Steps. The Macro tab's full v2 rebuild (spec:
[`plans/20260627_macro_dashboard_spec.md`](plans/20260627_macro_dashboard_spec.md)) is now **feature-complete and
QA-verified on `staging`** — all 11 modules, including the two that were previously deferred (P2 5D
trend engine, P3 Event Risk) and Sector Rotation. Read the spec first if extending any module.

**Architecture (the v2 fix):** the old single MA table mixed trend, stress, rates and positioning into
one bucket. Now each module answers one question, and the **Market Regime is a weighted score**, not a
row count: `Trend 30% · Volatility 20% · Credit 15% · Rates+Dollar 15% · GEX 20%` → 5 regime bands
(75+ Risk-On … 0–29 Risk-Off). **VIX and US10Y are NOT trend rows** — VIX lives in Volatility/Stress,
US10Y in Rates+Dollar. Pure scorers + 94 unit tests in `packages/shared/src/utils/macro.ts`.

**Built + on staging (`packages/ui/src/features/macro/`):**
- **Module 1 Regime Banner** (`RegimeBanner.tsx`) — score-derived band + trading-mode line; 5D direction descriptor slot wired (filled by P2).
- **Module 2 Module Score Strip** (`ModuleScoreStrip.tsx`) — per-sleeve score at a glance; 5D-delta slot (P2).
- **Module 4 Trend / Market Structure** (`TrendStructureTable.tsx`) — SPY/QQQ default, IWM/RSP/VEA optional (click ticker to toggle, no expert gate); **5-bucket** logic incl. *bear-market rally* (below 200D but bouncing ≠ bullish).
- **Module 5 Volatility / Stress** (`VolatilityStressCard.tsx`) — VIX, VVIX, IV Premium; percentile + 5D direction.
- **Module 6 Credit / Liquidity** (`CreditLiquidityCard.tsx`) — HYG proxy (labeled; HY OAS later).
- **Module 7 Rates + Dollar** (`RatesDollarCard.tsx`) — US10Y yield + UUP; flight-to-safety cross-check (falling yields during stress ≠ bullish).
- **Module 8 GEX / Positioning** (`GexPositioningCard.tsx`) — Graddox bias score + **SPY (SPX÷10) and QQQ** levels + trigger/implication.
- **Module 9 Risk Appetite** (`SentimentGauge.tsx`) — renamed from Sentiment; **`react-gauge-component`** library gauge; two-column (gauge ┃ breakdown); 7 inputs (Dollar dropped, Breadth added, percentile VVIX); each row shows its fear/greed word.
- **Module 10 Recap** (`MacroRecapCard.tsx` + `macro-recap.ts`) — **daily market note**, updated twice per weekday: pre-market AM (8am ET, `macro-recap-am.ts`) and post-market PM (4:30pm ET, `macro-recap-pm.ts`). Headline · verdict · big story · bull/base/bear · playbook · watching levels · final word. Grounded ONLY in passed data (no fabricated figures), Sonnet→Haiku fallback. **Persisted cross-device in Supabase** (`macro_daily_recaps`, migration 051, keyed by `date + session`). Written only by the scheduled functions or the admin Regenerate button (editor-only gate, hard 403); subscribers only ever read. Admin site has a session selector (AM/PM) on the Regenerate button. Both web and admin have their own `macro-recap.ts` function (site-scoped). The old `macro_weekly_recaps` table (migration 049) remains in the DB but nothing writes to it — can be dropped later.
- **Module 11 Sector Rotation** (`SectorRotationCard.tsx` + `useSectorRotation.ts`) — 11 SPDR sectors as per-sector cards, ranked leader-to-laggard by structure + 1M RS; each card has a `recharts` radar (RS vs SPY across Week/1M/3M/6M/1Y) plus "Leaders"/"Setting Up" chip rows (that sector's own constituents, not STW holdings). Built on `claude/sector-rotation-tooltips`, merged via **PR #61**.
- **P2 — 5D trend engine** (`useMacroTrendHistory.ts`) — reads daily snapshots from `macro_daily_snapshots` (migration 048), written by the `macro-snapshot` Netlify scheduled function at 4:30pm ET weekdays. Drives the banner's 5D direction descriptor, score-strip 5D deltas, and gauge 5D delta. **Now Supabase-backed (PR #73, `staging`), not per-browser localStorage — see Conventions → "5D trend engine" for the current behavior + the PROD-writer-stale caveat.**
- **P3 — Macro Event Risk** (`useMacroEvents.ts` + `macro-events` fn + `MacroEventRiskCard.tsx`) — CPI/PCE/FOMC/NFP overlay, wired into `MacroView.tsx`.
- **Help**: every module header has a collapsible ⓘ (`ModuleHeader`) — tap to expand a "what/why/how" blurb; collapsed by default.

**DB — migrations 048–051 applied on both PROD and sandbox (re-verified 2026-07-02):**
- `048_macro_daily_snapshots` — written by `macro-snapshot` scheduled fn (4:30pm ET weekdays); table
  includes its own `module_scores`/`indicator_scores` JSONB columns directly (no separate scores migration)
- `049_macro_weekly_recaps` — legacy, nothing writes to it now (replaced by 051)
- `050_run_log_latest_view` — **unrelated feature**: a subscriber-safe `run_log_latest` view (one row
  per `run_type`) backing the GEX Signals "Checked: …" stamp. (Earlier handoffs called this
  "050_macro_snapshot_scores" — that migration doesn't exist; this was a documentation error, now fixed.)
- `051_macro_daily_recaps` — written by `macro-recap-am/pm` scheduled fns + admin Regenerate; RLS read-only for `authenticated`

**⚠️ Unverified this session:** `macro_daily_snapshots` (048) was still **empty on PROD** as of
2026-07-02 ~7:48pm ET, well after the 4:30pm ET scheduled run and after the `macro-snapshot.ts` fix
(commit `3aa5528`) was pushed to `staging` earlier the same day. `macro_daily_recaps` (051) DID get a
fresh PM row that day, confirming scheduled functions are firing on this branch/site — so either the
snapshot function needs another scheduled cycle to prove out, or it's still failing silently. **Check
`macro_daily_snapshots` for a row dated 2026-07-02 or later before trusting the 5D trend engine.**

**Netlify env vars required:**
- Web site: `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, `VITE_TWELVEDATA_KEY`, `VITE_FINNHUB_KEY`, **`FRED_API_KEY`** (server-side, no `VITE_` — macro indices + Event Risk)
- Admin site: `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, **`FRED_API_KEY`**
- Optional: `MACRO_RECAP_MODEL` (overrides default claude-sonnet-4-6 → haiku fallback)
- **All Netlify functions now use `.trim()` on env vars** to guard against pasted-key whitespace.

**✅ Production deploy done (2026-07-05):** `staging → main` promoted via PR #66 (host-approved) —
everything since the 2026-06-23 event-sourcing promotion, including PRs #50–#65 and all Macro
Dashboard v2 + QA + regime-badge/IBKR-trading + rate-limit-fix work, is now live on production.
`staging` and `main` are identical as of this handoff. Any future promotion still needs **explicit
approval** — this is a standing rule, not resolved by precedent.

**Event-sourcing migration plan is CLOSED (on `main` since 2026-06-23) — do not reopen.** The weight model,
locked decisions, and Phase-5 routine semantics below remain authoritative reference.

**Why:** the old editor was split-brain — it wrote BOTH `legs` (directly) and `leg_transactions`, which
fought on save, diverged, and stamped synthetic dates. Now committed to **true event-sourcing**:
`leg_transactions` (**the diary**) is the only hand-written source; `legs` (**the scoreboard**) is a pure
trigger-derived projection. The editor + ledger write ONLY events.

**Weight model (host-confirmed, corrected 2026-06-18):** a diary row's `weight` = that leg's **lot**
(BUY) or **remaining** (SELL, 0 on full close). **BUYs accumulate** → `legs.weight = Σ BUY lots − sells`.
So **Initial position weight = Σ open legs' lots** (computed from the diary = `positionWeight().current`;
tracks current lots, falls after a trim) and **Current position weight = `holdings.current_weight`** —
the live weight **the routines restate weekly** (NOT Σ legs). Both display read-only in the editor; the
hand-typed `initial_weight` field is gone and the editor no longer writes `initial_weight`/`current_weight`
(routines own current; legs own initial). The earlier "Current = Σ open legs; Initial = typed" wording was
wrong — host confirmed the swap. The 90:10 (equity:options) / 20:80
(short:long) split is only the **default** for computing lots when the host gives a total with no per-leg
detail — held in `app_config`, with a per-position override on `holdings.equity_pct`.

**Phase 1 DONE ✅ + verified on SANDBOX** (`040_sandbox_verify.sql`):
- **Migration `040_legs_event_sourcing.sql`** — `leg_transactions += action_label`; `holdings +=
  equity_pct`; new `app_config` table (split defaults 0.90 / 0.20); **trigger 030 rewritten** to fire on
  INSERT/UPDATE/DELETE, replay the diary, accumulate BUY lots, and **book realized on trims** (slice-weighted).
  Requires **037 + 039** first. (`host_quote` was added then removed — Notes is the single field.)
- `@stw/shared`: `deriveLegWeights` rewritten (90:10 / 20:80, expiry-aware, pins preserved) + new
  `positionWeight()` (Σ open legs). 45 tests green.

**Phase 2 DONE ✅ + verified on SANDBOX (browser):**
- **`PositionEditor`** = position fields + `equity_pct`; **Current weight computed** (read-only), **Initial
  weight editable**; open legs shown read-only (leg CRUD lives in the ledger — one edit surface).
  "Last Action Date" label; each open leg shows its open date.
- **`LegTimeline` = editable Transaction History ledger** (writes only `leg_transactions`): `+ Add event`
  (incl. new legs: Instrument {Shares/Call/Put} + Direction {Long/Short}), per-row ✎/✕ edit/delete,
  columns **Date · Action · Details · Price · Weight · Notes** (Details holds "Shares"/`$30C Sep '26`;
  one **Notes** column), newest-first, table on desktop / cards on mobile, **open/closed/all toggle**,
  **closed-leg rows dimmed** + "Closed"/"Expired" muted gray.
- **Resizable split** in `PicksView` — drag the divider between the list and the detail (15–80%) on
  desktop. **On mobile, the opened detail takes over the full screen** instead — the sub-tabs and filter
  bar hide entirely (`mobileDetail` in `PicksView.tsx`), and `onClose` returns to the list. This is the
  canonical list+detail pattern for any list+detail surface, not just Ticker Details: desktop shows both
  panes side-by-side; mobile never crams both into a narrow viewport — one pane takes over at a time.

**Phase 3 DONE ✅ + verified on SANDBOX (CXDO/IRDM):** detail-card P&L split per asset class, never
blended — **Open** shows Shares/Options return + lot; **Closed** shows per-asset return + portfolio
contribution. `closedPnlPct` + `closedPnlContribution` + `hasClosedPnl` in `@stw/shared`.

**Post-import holdings fix (Next Step #2) DONE ✅ on SANDBOX:**
- **`last_action`/`action_date` derived from each ticker's latest diary event** (`plans/20260618_post_import_holdings_fix.sql`).
  Same-day conversion ties (ADEA/CXDO/FIVN/GDYN/SHLS) resolve to the keep-open `New`; `Expired` →
  `Closed` at the holding level (last_action has no "Expired"). (At import time AMZN/HOOD/TSLA had no
  legs and were skipped — but that was a transient state, NOT a rule; **the host has since added real
  legs to the legacy names on PROD (2026-06-23)**. See the legacy-positions decision below.)
- **Baskets/categories** assigned from the 6/18 sector groupings; 3 new categories created
  (**AI Fraud / Verified Identity**, **Space & Satellite**, **Nuclear**); **IRDM moved Defense → Space & Satellite**.
- **Initial weight for fully-closed positions** now shows the closed legs' entry lots instead of blank —
  new shared helper **`displayInitialWeight`** wired into BOTH `HoldingDetail` (detail card) and
  `PositionEditor`. ARKK reads `1% → 0%`. 54 tests + typecheck green.
- **`revert_legacy_category.sql` applied** — removed the mistaken "Legacy Positions" category;
  AMZN/HOOD/TSLA are Uncategorized (Legacy is their **conviction tier**, not a sector).

**DB state — BOTH environments now on the event model (2026-06-19):**
- **PROD (`usmqbohcjcyszjxxvnqu`):** 038 + 039 + 040 + the import + `post_import_holdings_fix.sql`
  applied. **Verified: 42 legs / 60 diary rows**, last_action/action_date/baskets correct, reconciles to
  6/18. **STILL TODO on PROD: run `revert_legacy_category.sql`** — PROD has a *pre-existing* "Legacy
  Positions" category (old system) that AMZN/HOOD/TSLA still use; the env-agnostic revert clears it.
  Conviction on PROD is left to the routines (some cores not yet tier 5).
- **SANDBOX (`uolabcgbnrkhzpwuvzlk`):** same scripts + the revert all applied. Admin dev `.env.local` →
  sandbox, so **localhost reads/writes the sandbox directly**. 25 tickers / 42 legs.
- **PROD import gotchas (baked into `plans/20260619_prod_import/*` + the SQL files):** (1) PROD's STW
  `trader_id` = `64a779f9-13ba-4cb4-824b-d70dcab3a49b` (sandbox = `9ec36b89-…`); seeds now resolve the
  trader **by name**. (2) The Supabase SQL editor threw "Failed to fetch" on the one big import — it was
  split into 9 small files in **`plans/20260619_prod_import/`** (run `1_wipe` → `8_legs` → `9_weights` in order).
  (3) The wipe deletes **all** legs (PROD carried 28 stale ones from the old 029/030 system) with the
  `trg_leg_transactions_sync` trigger disabled during the delete.

**Decisions locked (see spec):** event-sourced; ledger-only leg editing (inline modal editing **deferred**);
one Notes column; trims book realized; >2 option legs split even; ledger newest-first; **a "convert to
shares" close is a real cash sale → book the option's actual exit price as realized P&L, never $0** (host
2026-06-18); **ledger Action verb = bold green for OPEN-leg events, plain gray for CLOSED-leg events**;
**P&L is split by asset class (Shares vs Options), never blended** — Open shows per-asset return + lot;
Closed shows per-asset return + **portfolio contribution** (return × sold weight), so a +600% option on a
thin slice reads as its true ~+3.6% portfolio impact (host 2026-06-18). P&L Breakdown is open-legs-only.
**"Legacy" is a conviction tier (Tier 6 / `c0`), NOT a sector/category** (host 2026-06-19). **Legacy /
low-conviction does NOT mean "no legs/data"** — every position the host actually holds carries leg +
transaction data regardless of tier, **especially while still open**; the host added real legs to the
legacy names (AMZN/HOOD/TSLA) on PROD (host 2026-06-23). So a tier-0 holding with open legs is normal —
never treat low conviction as a reason to leave a held position without legs. **Conviction is
owned by the routines** — set in the streaming run, never in a seed/migration (so the post-import fix does
NOT touch conviction; the 6/18 stars OSS/VPG/SYNA/VIAV/NBIS/ENS/AMKR/LEU/AMZN/TSLA are the routines' job).

**Decisions locked — admin IBKR trading (host 2026-07-03):** real order placement is **admin-only,
local-proxy-only, single-account** — extending it to arbitrary subscribers is explicitly out of scope
without a separate legal/compliance review and a different integration entirely (IBKR's Client Portal
Web API, or Alpaca's OAuth trading API per `plans/20260524_mobile-transition.md`); don't build toward it
incrementally. **Legs stay weight-only (%) forever** — real share/contract quantities are never derived
from weight and are always entered directly at order time (there is no plan to add share/contract
counts to the `legs`/`leg_transactions` schema). A confirmed broker fill is the only thing allowed to
patch a diary row's price after the fact — the requested/limit price never is, same rule as every other
close in this ledger.

**Decisions locked — risk limits engine (host 2026-07-08):** `risk_config.account_equity` defaults
to a **$100,000 placeholder** for every new row (migration 059's `DEFAULT`, not left `null`) —
same "seed a placeholder, flag it via `is_placeholder`, let the user override" pattern already used
for the threshold defaults (migration 055), not a special case. `equity_peak` is a
**trigger-maintained high-water mark** (`fn_risk_config_track_equity_peak`) that only ever
increases — this is a genuinely derived value (same "scoreboard is a pure trigger-derived
projection" pattern as `legs`/`leg_transactions`), **not** the "fail loud, never silently coalesce"
pattern migration 054 uses for the closed-weight invariant; don't conflate the two triggers'
philosophies. The drawdown ladder is validated but **never blocking** — inline warnings
(monotonicity; position ≤ sector ≤ gross) render but Save stays enabled, matching this engine's
standing "flags only, nothing here places or blocks a trade" framing everywhere else. **Any UI
that shows a `risk_config`-derived percentage (gross exposure, position/sector concentration) must
use `config.account_equity` as the denominator, never re-derive it from the same positions being
evaluated** — that was the exact tautology bug found and fixed (gross exposure read
~100% unconditionally because the numerator and denominator were the same sum).

**Decisions locked — risk limits engine v2 (host 2026-07-08, this session):**
- **Four severity tiers, not two.** `ViolationSeverity` = `ok | near | breach | unevaluated`
  (`packages/shared/src/utils/limits.ts`, `classifySeverity`): **near** fires at ≥80% of a limit
  (incl. AT the limit — a 100%/100% bar reads amber, never green, since breaches are already too
  late); **unevaluated** is missing data (an unmapped sector) and must **never be counted as a
  breach** (a permanent red flag trains the operator to ignore the engine). `StatusPill` already has
  matching `near`/`unevaluated` variants — reach for them, don't invent new colors.
- **Separate, tighter options cap.** `risk_config.max_option_position_pct` (migration 060, default
  **5%** vs the 10% general position default) caps any single underlying's OPTIONS exposure —
  options carry more risk per dollar. Pure scorer `optionPositionConcentration` rolls up only option
  legs (`PositionInput.isOption`). It's **display-only** on the Risk tab (there's no `option` value
  in `risk_violation_acks.violation_type`, so no acknowledge/glide-path workflow for it).
- **The Risk surface is its own destination, not a collapsible block.** On My Portfolio it's the
  "Risk" sub-nav tab and renders expanded directly (no ▶ toggle). Each concept (gross / position /
  option / sector) carries a one-line what-and-why explanation. Exceptions-first is the resting view
  (breach + near + unevaluated shown; "Show all" reveals the OK rows).

**Event-sourcing plan docs (`plans/`, now date-prefixed):** `20260618_legs_event_sourcing_redesign.md`
(spec) · `20260618_import_open_positions.sql` (clean open-position import) ·
`20260618_post_import_holdings_fix.sql` (post-import seed) · `20260618_revert_legacy_category.sql`
(drops the bad Legacy category) · `20260618_040_sandbox_verify.sql` (trigger test) ·
`20260618_legs_inspect.sql` (inspect legs/diary) · `20260618_zzadea_populate.sql` (seed test fixture).

**Tooling:** `pnpm` not on PATH — use `corepack pnpm …` or `~/.local/bin/pnpm`. No local Postgres (can't
run DDL locally — apply migrations via the Supabase SQL editor). Prod service key (read-only checks) at
`~/Documents/Claude/Scheduled/.supabase-service-key`. Sandbox anon key in `apps/admin/.env.local`.

**Phase 5 DONE ✅ (2026-06-19) — routines on the 040 event model** (out-of-repo
`~/Documents/Claude/Scheduled/*`; SKILL.md edits, not committed). All four updated:
- **morning + afternoon:** STEP 2.3 / STEP 3 rewritten — diary `leg_transactions` (`action_label` +
  `notes`=host's verbatim words) + **direct `holdings` PATCH** of `last_action`/`action_date`/
  `current_weight`; **`holding_transactions` path retired** (the still-live 033 trigger auto-logs a
  harmless audit row). **Lot semantics:** BUY weight = lot **added**, SELL = **remaining** (cost basis).
  **Split (90:10 / 20:80 from `app_config` + `holdings.equity_pct`) is initial-sizing fallback only —
  existing legs are NEVER re-split.** Upsize = keep existing legs, add the increment to the **named**
  leg (FIVN worked example baked in). Contract→shares = close option at real exit (never $0) + new
  shares leg **inherits the replaced leg's weight** (net-neutral); same-day close+open keeps the
  position open (`last_action` = the opening verb). Trim uses **cost-basis remaining**; an appreciated
  winner stated only in market % → **flag**, don't guess. `action_date` = the host's action date,
  written only by a real action.
- **friday-weighting:** direct `current_weight` PATCH (no `Hold` rows); **truth-up mismatch (snapshot ≠
  Σ lots, e.g. IRDM +600%) → flag, never rewrite lots**; legs reconcile adds missing only; **new STEP
  4d status-aging** — `action_date` older than the **previous** snapshot → `last_action='Hold'`
  (`action_date` preserved); Closed/Expired terminal.
- **transcripts:** conviction note — routine-owned, **mutable both ways on an explicit signal incl.
  promoting a Legacy (0)**; never inferred from sizing.
- **One-time SQL applied (PROD + sandbox):** `plans/20260619_conviction_618_stars.sql` (8 stars → tier 5;
  AMZN/TSLA stay 0) + `plans/20260619_fix_fivn_shares_weight.sql` (FIVN shares lot 3.5→2.5, net-neutral 6.0%).
- **PENDING (host) — NOT a repo task, doesn't affect the apps:** the stale **`gradoxx-daily-summary`**
  Cowork scheduled task (duplicates morning PART 1's Graddox) is an **orphaned backend object** — it
  still fires ~9am but has no working delete UI (absent from Cowork→Scheduled; its task page 404s; the
  delete API is desktop-client-gated). Task UUID `8377c152-0ffa-474d-9ec0-2281a92edb26`, org Claudia Chez
  `aea1699f-e0b8-4ed4-80b9-4abb5d0a7711`; the underlying skill is `skill_01UY6zPNf9Do8eR4voyUvtm6`. Being
  cleared via Anthropic support / desktop skill-delete. Also smoke-test the routines on their next live runs.

## From the 2026-07-05 session (staging → main — committed, pushed, promoted)

Picked up where 2026-07-03 left off: re-checked the regime badge, found the real bug behind it, fixed
it, shipped it to production, then separately investigated + fixed a live data-integrity report.

- **Root-caused + fixed the TwelveData rate-limit bug** (`packages/ui/src/features/macro/maCache.ts`,
  `useSectorRotation.ts`) — the regime badge was STILL blank after the 2026-07-03 daily-quota window
  reset, confirming it was a different, deeper bug: `tdBatchCloses()` assumed bundling many symbols
  into one comma-joined TwelveData call avoided the free tier's rate limit. It doesn't — TwelveData
  bills **1 credit per symbol, not per HTTP call** (confirmed directly: "12 API credits used, limit
  8"), so any batch over 8 symbols 429'd unconditionally, forever, regardless of waiting. This was
  ALSO silently degrading the already-shipped Macro tab (Sector Rotation's 12-symbol sector batch,
  Trend Structure's SPY/QQQ/IWM/RSP/VEA, Volatility's VIX/VVIX, Rates+Dollar's UUP, Sentiment Gauge's
  ~15 breadth stocks all fire independently on load with no shared rate budget). Fixed by chunking
  `tdBatchCloses` to ≤8 symbols per call, paced ~65s apart (shared constants with the existing
  `fetchClosesChunked` helper, whose own default delay of 2000ms was also too short and got corrected
  to match). **Verified at the network level** in-browser: confirmed chunked requests return 200
  instead of 429, and pacing correctly recovers across chunk boundaries — but did NOT re-open a ticker
  detail page afterward to visually confirm the badge chip itself renders (a cold load takes several
  minutes to fully populate at this pacing). **Tradeoff accepted by host:** first Picks/Macro load each
  day is slow (several minutes) instead of failing outright; cached 24h after. One narrow residual gap:
  two independently-paced hooks (Sector Rotation + Ticker Regime) can still collide at their handoff
  boundary and drop one chunk for that session — those few tickers just show no badge until the next
  paced cycle or next day's cache refresh, no crash. Typecheck + 152 tests green. Merged via
  [PR #65](https://github.com/claudiachez/stw-companion/pull/65).
- **`staging → main` promoted** via [PR #66](https://github.com/claudiachez/stw-companion/pull/66)
  (host-approved) — 104 commits, everything since the 2026-06-23 event-sourcing promotion is now live
  in production, including this session's fix.
- **Investigated a host-reported data-integrity concern from a prior session** ("VPG and TENB each have
  two identical duplicate OPEN legs... MITK has 3 OPEN legs... LEU has a probable year-typo in
  action_date"). Verified directly against PROD (`usmqbohcjcyszjxxvnqu`) rather than trusting the old
  claim or the host's own screenshot-based re-check:
  - **VPG/TENB "duplicate legs" — false alarm, confirmed.** Each has exactly 2 distinct `legs` rows
    (one SHARES + one OPTION) opened the same day as a single combo entry — different `leg_id`,
    different `instrument_type`/strike. Not a parser bug; a normal shares+option combo position. The
    prior claim almost certainly misread "same ticker, same date" without checking instrument type.
  - **MITK "3 open legs" — real, but legitimate.** SHARES (2.9%) + two different-expiry calls ($12.5C
    Nov'26 1.8%, $12.5C Jan'27 1.7%) — a deliberately layered position built via separate
    Upsized/rolled ledger events (notes confirm "raising total weighting to 6.4%" = 2.9+1.8+1.7). Not
    a duplicate.
  - **LEU year-typo — confirmed real, and fixed on both PROD + sandbox.** The host had already
    corrected the leg's open date in the UI (`legs.opened_at`/`leg_transactions.executed_at` both
    correctly read 2025-05-21), but **`holdings.action_date` is a separate write path** — the
    editor's own `PositionEditor.tsx` exposes it as an independently-editable field — and it still
    read `2026-05-21`, a year off. Corrected directly via SQL to `2025-05-21` on both PROD and
    sandbox (kept `last_action` untouched: `Hold` on PROD, `New` on sandbox — only the date was
    wrong). **Standing lesson, now in Conventions below:** fixing a leg's date via the ledger does
    NOT auto-correct `holdings.action_date` — always check both when correcting a date.

## Next Steps

0. **★ Production promotion PR [#81](https://github.com/claudiachez/stw-companion/pull/81)
   (`staging → main`, 112 commits) is OPEN and host-approved — likely merged by your session.**
   **DB is ready** — migrations through 062 on PROD + sandbox. The scheduled writers
   (`macro-snapshot` v2.0.0, `sector-map-sync`) only fire on the `main` deploy, so they go live on merge.
   **If merged, VERIFY on production:** (a) `FRED_API_KEY` is set on the Netlify **production** context
   of both sites (else FRED cells go `—`); (b) a fresh `macro_daily_snapshots` row carries
   `engine_version = macro-snapshot-2.0.0` + non-null trend/vol/credit + a `run_log` row; (c)
   `sector-map-sync` mapped CCXI (`run_log`); (d) the Macro tab renders live FRED data + the regime
   badge shows on a held ticker. **If still open, don't merge without re-confirming host approval.**

1. **✅ DONE — data feeds + sector taxonomy (PRs #78/#79, this session).** Macro indices re-platformed
   onto FRED, Event Risk on FRED's calendar, VVIX dropped, GICS-11 taxonomy + `sector-map-sync`,
   admin-configurable regime weights. Migrations 061 + 062 applied to both environments. See Current
   Status + Conventions → Macro data sources / Sector taxonomy. Nothing left here — it just needs the
   promotion (#0) to run live on production.

2. **★ ROADMAP — integrity guardrails.** Spec:
   [`plans/20260706_integrity-guardrails.md`](plans/20260706_integrity-guardrails.md); status report:
   [`plans/20260706_integrity-guardrails-report.md`](plans/20260706_integrity-guardrails-report.md).
   Two items still open: **(a)** live cron verification (now includes the new `sector-map-sync` +
   `regime-daily` writers) and **(b)** the `regime_daily` backfill via `?backfill=1&days=N` (the
   `regime-daily` fn is on `staging` but **not yet scheduled** — it has no `schedule()` wrapper; wiring
   its cron + running the backfill is part of this). `regime_daily` is still **0 rows** on PROD.

3. **Visually confirm the regime badge + the FRED-backed Macro tab render** after the promotion. Open a
   held ticker's detail page (regime chip) and the Macro tab (Market Internals values populated, Event
   Risk showing the upcoming calendar). FRED is 120/min so cold loads should be fast now; equity closes
   still pace on TwelveData. If a cell is blank after a full cycle, check the `fred` proxy / `FRED_API_KEY`
   before assuming a deeper bug.

4. **Live-test the admin IBKR order flow against a real IB Gateway** — cannot be done from this
   environment. In order: (1) `IB_PORT=4002 python3 ibkr_proxy.py` against Gateway in **paper** mode,
   (2) place a real paper order end-to-end from the "Open via IBKR" modal, confirm the fill patches the
   diary row's price correctly, (3) test "Close via IBKR" on an open leg, (4) only after both work
   cleanly, consider port 4001 (live). Flag if `/order_status`'s `reqAllOpenOrders`/`reqCompletedOrders`
   lookup doesn't find a previously-placed order from a new connection.

5. **Phase 4 admin Manage area, Parts B/C — still not built** (Part A, Config, shipped 2026-07-03).
   Spec: [`plans/20260619_phase4_admin_manage.md`](plans/20260619_phase4_admin_manage.md). **Categories CRUD**
   (delete-guarded — block or reassign-to-Uncategorized on delete) and **Traders** (read-only
   recommended — only 2 seeded, FK'd everywhere, high-risk/low-value to make editable). No migrations
   expected.

6. **`macro_daily_snapshots` is populating but the PROD writer is a STALE build; the good fix is on
   staging, not main.** PROD had 2 rows at handoff (up from 0/1), but the currently-DEPLOYED (main)
   `macro-snapshot` writes rows with **null `engine_version` and no `run_log` row** — i.e. it's a
   pre-instrumentation build, and its trend/vol/credit scores are still null (the unpaced-TwelveData
   429 bug). PR #73's fix (Supabase-read hook + ≤8/65s pacing + run_log/engine_version) is on
   **`staging` only** — it won't take effect on PROD until the promotion in #0. After promotion,
   confirm a fresh snapshot row carries a non-null `engine_version` + real trend/vol scores AND a
   `run_log` row (`run_type='macro-snapshot'`) before trusting the 5D engine.

7. **Macro Dashboard — COMPLETE.** All 11 modules + the Portfolio Heatmap (shipped this session on
   both Stock Picks Overview and My Portfolio) are done. Nothing left from
   [`plans/20260627_macro_dashboard_spec.md`](plans/20260627_macro_dashboard_spec.md).

8. **BACKLOG — Overview/experience enrichment + multi-trader tailing (host-requested, no firm order):**
   - **§4 multi-trader tailing** (deferred). A real data-model change — a position ↔ pick link table +
     a migration + a host-decided conflict rule. The UI is already built over a trader array (read
     `PortfolioPage.tsx`'s `FOLLOWED_TRADERS` / `pickMap.traders` and `PortfolioPositionDetail.tsx`);
     only STW is wired. **Present a proposal + get the conflict rule decided BEFORE building.**
   - **Transcripts library tab** — a NEW subscriber-facing **episode recap** (host's *trading psychology* +
     that episode's *per-ticker commentary*). **NOT** the local methodology `.md` files (apps never read those).
     Needs a new `webinars` table written by `stw-transcripts` + a new tab.
   - **Global Activity Feed** — one cross-ticker, reverse-chron feed merging Commentary + Transactions across
     all holdings, filterable. No schema (reads `conviction_comments` + `leg_transactions`). Low-cost.

9. **Subscriber closed-position P&L history — explicitly postponed by the host, design already
   researched.** The subscriber IBKR Flex query returns *open positions only* and the sync is
   delete-all-then-insert; closed history needs a genuinely different append-only, dedup-on-execution-id
   sync (a second Flex Query template + a new `user_closed_trades` table). Don't build until the host
   asks again. **Note:** the My Portfolio detail pane (this session) already surfaces this gap
   honestly to users as a "Closed position history — coming soon" placeholder rather than hiding it.

10. **Future features (not migration work):** inline 2-line leg editing in the modal (deferred); `$100k`
    notional + SPY benchmark (the `spy_daily` table from migration 032 already exists; the population
    cron + benchmark UI are unbuilt).

**Sandbox gaps (not blocking, dev-only):** (a) the **`prev_conviction_level` backfill** was never run on
sandbox, so the Conviction Changes block won't render there until it is (or until a real batch lands); (b) the
`recent_changes` view (migration 008) was never applied to sandbox, so **"Latest Portfolio Changes"** hides
there. Both render fine on PROD. Apply them to sandbox only if you want those blocks locally.

---

## One Monorepo, Two App Shells

This is a single pnpm workspace. Two thin app shells consume the same shared
packages and differ only by **capability**, never by forked components.

| App | Audience | Folder | Capabilities |
|---|---|---|---|
| Subscriber web | Subscribers | `apps/web` | Supabase auth + tier paywall (`AccessGate`); Portfolio page + IBKR Flex Query subscriber connection; Settings page (`/settings`) |
| Admin dashboard | STW editor | `apps/admin` | No paywall; Edit form, Users tab, Config page, IBKR badge + proxy writer + real order placement |

Each deploys to its own Netlify site from the **same branch** (base dir differs).

---

## Repo Structure

```
pnpm-workspace.yaml          → packages/*, apps/*
package.json                 → workspace scripts (dev:web, dev:admin, build, typecheck, test)
packages/
  shared/  (@stw/shared)     pure framework-agnostic logic: types, tiers, baskets,
                             format, options, pnl, filters (+ unit tests)
  ui/      (@stw/ui)         shared React: feature pages/components, data hooks,
                             supabase/query-client factories, AppCapabilities context
apps/
  web/                       subscriber shell: router, Layout, auth, AccessGate
    netlify/functions/
      ibkr-flex.ts           serverless IBKR Flex Query proxy (JWT-auth, never exposes token)
    netlify.toml             (Netlify base dir = apps/web)
  admin/                     admin shell: no paywall, Edit + Users + Config + IBKR (pricer + order placement)
    ibkr_proxy.py            local IBKR writer (run on your machine, not deployed)
    netlify.toml             (Netlify base dir = apps/admin)
supabase/migrations/         001..060 — single source of truth for DB schema/RLS
plans/                       specs, runbooks & one-off SQL; files are date-prefixed YYYYMMDD_<name>
CLAUDE.md                    this file
```

**`plans/` naming (convention, 2026-07-09):** every file in `plans/` is prefixed with its
creation date, `YYYYMMDD_<name>` (e.g. `20260627_macro_dashboard_spec.md`), so the folder reads
chronologically. Name any new plan doc the same way.

### Layer rules (keep them honest)
- `@stw/ui` takes everything via **props/context** — no app-specific imports, no env,
  no routes. The Supabase client + `VITE_*` env are created in each app and injected.
- Admin/subscriber differences flow through **one `AppCapabilities` context**
  (`isAdmin`, `canEdit`, `showIbkrBadge`, `canViewHistory`, `canUseLimits`, `onEditHolding`,
  `onExecuteIbkrOrder`, plus the injected `finnhubKey`/`twelveDataKey`) — never scatter
  `isAdmin` checks deep in shared components. `onExecuteIbkrOrder` is the one capability that reaches
  outside the app entirely (the local IBKR proxy) — it's wired only in `apps/admin/src/main.tsx`;
  `apps/web` never sets it, which is what actually keeps real order placement out of the subscriber app
  (not just a UI-level gate). Note: `apps/web`'s own `SettingsPage.tsx` computes its `canUseLimits`
  locally via `useTierAccess('limits')` rather than reading it off this context — an existing (pre-
  2026-07-08) inconsistency with how `PortfolioPage.tsx` reads `capabilities.canUseLimits`, not
  something this session introduced; worth reconciling if you're back in this area.
- `@stw/shared` is the only home for derived-number logic (P&L, weights, sector %, date formatting).
  Don't re-implement it in an app. (End state: move the math into Supabase views/RPC.)

---

## Branch Strategy

| Branch | Purpose | Deploys to |
|---|---|---|
| `main` | Production | both Netlify sites — prod |
| `staging` | Trunk / staging | both Netlify sites — staging |

Feature branches: `claude/<feature>` → branch from `staging` → PR to `staging` →
PR `staging` → `main` when approved. **This is enforced, not aspirational** (host 2026-07-03, after a
~2-week drift where ~18 commits landed on `staging` directly — see the top banner's "Known exception")
— `staging` auto-deploys to both Netlify staging sites on every push, so a branch is what keeps an
in-progress/broken commit off the deployed site until the PR actually merges. Every session cuts one,
every session.

```bash
git checkout -b claude/my-feature origin/staging
# work across packages/* and apps/*; shared change is written once
git push -u origin claude/my-feature
# PR → staging for review, then staging → main when approved
```

---

## Local Development

```bash
pnpm install            # installs the whole workspace
pnpm dev:web            # subscriber app (Vite)
pnpm dev:admin          # admin app (Vite)
pnpm build              # pnpm -r build across packages + apps
pnpm typecheck          # pnpm -r typecheck
pnpm test               # unit tests (@stw/shared)
```

Env: each app needs `VITE_FINNHUB_KEY` (live prices) and the Supabase URL + anon
key (in `.env`, gitignored; see `apps/web/.env.example`).

---

## Deployment (Netlify)

Two sites, one repo, same branch — distinguished by **base directory**:
- Web site: base dir `apps/web`, build `pnpm install && pnpm --filter web build`, publish `dist`
- Admin site: base dir `apps/admin`, build `pnpm install && pnpm --filter admin build`, publish `dist`

`staging` branch → staging deploy; `main` → production (requires approval). Build
config lives in each app's `netlify.toml`; base dir + env vars are set in the
Netlify dashboard.

**Build-skip:** with a base dir, Netlify by default skips a build when nothing in
that dir changed — which silently dropped shared `packages/**` updates. Each
`netlify.toml` now has an `ignore` command that builds when the app dir, any shared
package, or a root manifest (`pnpm-lock.yaml`/`package.json`/`pnpm-workspace.yaml`)
changed, and skips doc-only commits. So a `packages/**` change now correctly rebuilds
both sites.

Add each Netlify URL to Supabase Auth → URL Configuration → Redirect URLs (Google
OAuth on web does a full-page redirect).

---

## Database (Supabase)

- Project: `usmqbohcjcyszjxxvnqu.supabase.co`; client created per-app and injected into `@stw/ui`.
- `supabase/migrations/` is the single source of truth (through **059**).
  **Claude authors migrations; you apply them** via the Supabase SQL editor / `supabase db push`.
- **Local DB backups → gitignored `backups/`** (never committed — may carry PII), named
  `<date>_<purpose>.json` (e.g. `*_pre-coldrop.json`). Take a fresh logical snapshot of the
  affected tables before any destructive migration (column/table drop). The Supabase MCP has no
  `pg_dump`; pull tables via the REST API with the service key, or `select json_agg(...)`.
- Tables: `holdings`, `signals`, `profiles`, `tiers`, `run_log`,
  `user_positions`, `holding_transactions`, `conviction_comments`, plus the event-sourced
  `legs` / `leg_transactions`, `categories`, `traders`, `app_config`.
  RLS on `holdings`/`signals` restricts writes to `cc@claudiachez.com`. `user_positions`
  uses user-owned RLS — each subscriber reads and writes only their own rows.
  The admin IBKR proxy now prices STW's option legs and writes **`legs.mark_price`** (the old
  `last_pnl_*` / `ibkr_legs` columns on `holdings` were dropped in 034).
- **Transaction History is auto-logged by a DB trigger** (`stw_log_holding_transaction`,
  migration 016): any non-`Hold` change to a `holdings` row's `last_action`/`action_date`
  writes a `holding_transactions` row — so every writer (admin Edit form *and* the external
  scheduled routines) is captured with no client code. A dedupe guard on
  `(ticker, leg, action, event_date)` makes idempotent script re-runs safe. The admin
  "+ Add Event" form is a manual backup (a direct insert that doesn't touch `holdings`,
  so it never double-fires the trigger). This intentionally differs from conviction
  history, which uses explicit appends (see migration 015).
- **`holdings.action_date` is a separate write path from a leg's own open date** —
  `legs.opened_at`/`leg_transactions.executed_at` and `holdings.action_date` are NOT kept in sync
  automatically. Correcting a mis-dated leg via the ledger (or a direct `legs`/`leg_transactions` fix)
  does **not** touch `holdings.action_date` — it's an independently-editable field on
  `PositionEditor.tsx`. Confirmed by a real bug (LEU, fixed 2026-07-05): the leg was corrected to the
  right year but `holdings.action_date` still carried the old one. When fixing any date on a position,
  check and fix **both** sides.

### Data sources / writers
The apps mostly **read** these tables; the rows are written by systems that live **outside this
repo**. Know who writes what before you reason about freshness or "why is this row here":

| Table | Primary writer | Notes |
|---|---|---|
| `holdings` | **the routines** (see next section) | core position rows (`last_action`/`action_date`/`current_weight`/thesis/conviction/`category_id`); admin Edit form also writes. Per-leg sizing + prices live on `legs`/`leg_transactions`, not here |
| `signals` | **morning routine** (Graddox step) | GEX signal bias + levels |
| `conviction_comments` | **the routines** + `stw-transcripts` | explicit appends; `source` = `discord` or `streaming`; admin/users can also add notes |
| `holding_transactions` | **DB trigger** (no client) | auto-logged from any `holdings` write; never written directly by app or routine |
| `run_log` | **the routines** | ingestion audit + high-water mark; newest `digest` → "Latest Portfolio Changes" |
| `user_positions` | **web `ibkr-flex.ts`** | each subscriber's own IBKR account; user-owned RLS |
| `profiles` / `tiers` | auth + Settings | per-user creds/preferences, tier paywall |
| `ticker_sector_map` | **`sector-map-sync`** Netlify fn (auto) + one-off migration 062 | ticker → **canonical GICS-11 (+ ETF/Cash)** sector, read by `useSectorMap` (Risk-tab concentration, detail-pane Sector, heatmap Sector grouping). Migration 062 re-seeded the existing rows to GICS; `sector-map-sync` (web, weekdays 22:00 UTC) auto-maps newly-opened `holdings` tickers via `resolveSector` (`@stw/shared`). No longer a manual stopgap |

"The routines" = three cowork cron tasks that ingest Discord into Supabase — **the primary writers of
`holdings`, `signals`, `conviction_comments`, `run_log`.** They are not in this repo (they live at
`~/Documents/Claude/Scheduled/<id>/SKILL.md`); the next section documents the full flow. They write
via the Supabase REST API with the **service-role key**, which is why their writes bypass the
`cc@claudiachez.com`-only RLS on `holdings`/`signals`.

---

## Data Ingestion — The Routines (out-of-repo, but the source of almost all data)

The apps render data that an external ingestion engine writes on a schedule. This engine is **not
checked into this repo** — it is a set of Claude cowork cron tasks at
`~/Documents/Claude/Scheduled/<id>/SKILL.md` (thin shims under `~/.claude/scheduled-tasks/`). It is
documented here because the Supabase schema is the contract between it (writer) and the apps
(readers); changing a table or the `legs`/`leg_transactions` event-sourced schema affects both sides.

**Mechanism (shared by every routine):**
- Reads Discord via **Claude in Chrome** (the user's own account — not a bot; the user isn't a server admin).
- Writes to Supabase via `curl` to the REST API using the **service-role key** (from `~/Documents/Claude/Scheduled/.supabase-service-key`), bypassing RLS. Every write uses `Prefer: return=representation` and is verified — an empty `[]` body is treated as failure.
- **High-water mark:** each routine first reads the newest `run_log.last_message_ts` for its channel, processes only messages newer than that, then writes a fresh `run_log` row. This makes every run idempotent — a message/recording/snapshot is processed exactly once, no matter which path fires. **Completeness is critical:** scroll Discord back to the *prior* mark and process EVERY message in the gap before advancing — the newest screenful loads first, so stopping early silently skips mid-gap messages while the mark moves past them (this dropped SYNA/TENB/GDYN on 6/26).
- **Extract intent, not the surface verb.** The host **deliberately obfuscates alerts to fool copy-bots** (confirmed 2026-06-26): a disguised "buy / hang on / revisit" can be a real **Close** (tells: "tossed/stopped out", "rules are rules", "I often sell bottoms"), and he may **omit the ticker** (name only, e.g. "Agility Robotics SPAC" = $CCXI → research and resolve the symbol). Still never infer weights/conviction from sizing; flag genuinely ambiguous actions rather than guessing.
- **Edited posts can defeat a naive high-water mark** (confirmed 2026-07-02, `stream-library-stw`): the host routinely **edits the same Discord message in place** to add new content (e.g. appending Episode 29 to the same post that already held Episodes 25–28), only posting a new message when he hits the character limit. Discord edits do **not** change a message's `id` or original `timestamp` — only `edited_timestamp` moves — so an ID/timestamp-only dedup check can silently treat a freshly-edited post as already processed. `stw-transcripts`' `SKILL.md` now checks for an "(edited)" marker and cross-references the post's stated episode number against `run_log.summary` before skipping; apply the same caution to any routine reading a channel where the host might behave the same way.

**The four routines:**

| Routine | Cadence | Reads (Discord channel) | Writes |
|---|---|---|---|
| `stw-morning-run` | 9am wkdays | Graddox → `live-notes-portfolio` → (fallback) `stream-library-stw` | `signals`, `legs`, `leg_transactions`, `holdings`, `conviction_comments`, `run_log` |
| `stw-afternoon-run` | 3pm wkdays | `live-notes-portfolio` → (fallback) `stream-library-stw` | `legs`, `leg_transactions`, `holdings`, `conviction_comments`, `run_log` |
| `stw-friday-weighting` | 5pm Fri | `updates-portfolio` (weekly full snapshot) | `holdings` (weights only), `run_log` |
| `stw-transcripts` | manual (+ daily fallback) | `stream-library-stw` (webinar recording) | methodology `.md` (local), `holdings`, `conviction_comments`, `run_log` |

**Daily flow (morning / afternoon):**
1. Read `live-notes-portfolio` — the host's real-time buy / sell / upsize / trim calls **and** his DD/thesis (he posts thesis here, not in a separate channel).
2. For each changed ticker, write the **event-sourced** path (post-Phase-5): a `leg_transactions` **diary** row per leg event (`BUY`/`SELL`/etc. with `action_label`, `price`, `weight`=lot/remaining, `notes`=host's words) — the 040 trigger derives the `legs` scoreboard (status, entry/exit, realized P&L) — then a **direct `holdings` PATCH** of `last_action`/`action_date`/`current_weight` only. No `position_detail`/`exit_*` blob is written (those columns were dropped in 034/035).
3. That `holdings` PATCH **auto-fires the 033 trigger** → a harmless `holding_transactions` audit row (no client code; the routines never write that table directly).
4. For notable commentary, **append a `conviction_comments` row** (`source='discord'`) → becomes "Latest Comments"; refresh `holdings.summary`/`bullets` + `dd_updated_at` only when the durable thesis actually changed.
5. Write the `run_log` mark, including a multi-line **`digest`** → rendered as "Latest Portfolio Changes" in the Overview.
6. **Recording fallback:** if `stream-library-stw` has an unprocessed recording, delegate to `stw-transcripts`. (Morning also runs the Graddox GEX step first → `signals`.)

**Weekly flow (Friday):** read the full-portfolio snapshot from `updates-portfolio` and **truth-up every holding's `current_weight`** to match it (this is the weighting source of record; daily calls only nudge weights). A ticker in `holdings` but absent from the snapshot is flagged, not auto-closed.

**Webinar flow (`stw-transcripts`):** processes the newest unprocessed recording **exactly once** (dedup via the `stream-library-stw` high-water mark). From one Zoom transcript it produces **two outputs**: (A) a **methodology-analysis `.md`** — a fixed 10-section reverse-engineering of *how the host thinks* (not what he owns) — saved to `~/Documents/Claude/Projects/Stock Talk Weekly/StockTalk_Episode_<DATE>_Analysis.md`; and (B) **conviction notes** — a `conviction_comments` row per ticker (`source='streaming'`) plus a thesis refresh when the durable "why" changed. Output A is the **only** routine output the apps never read (a local research library, kept separate from position data on purpose).

---

## IBKR Pipelines (three separate systems)

### Admin — local option pricer
`apps/admin/ibkr_proxy.py` is a **local** Flask server (`localhost:8765`, self-signed
TLS) that talks to IB Gateway (`127.0.0.1:4001`) via `ib_insync`. The admin browser
calls it to price **STW's** option legs (arbitrary contracts, not just held positions);
the browser then writes the per-leg **`legs.mark_price`** / `mark_price_at` (`mark_price_source='IBKR'`)
to Supabase — the proxy itself never writes Supabase. (Pre-event-sourcing this wrote `last_pnl_*` /
`ibkr_legs` on `holdings`; those columns were dropped in 034.) Run it locally with IB Gateway
connected; never deployed.

The proxy batches snapshots for speed, then **retries any leg the batch returned empty,
one at a time** (concurrent frozen snapshots occasionally drop an illiquid contract).
An unpriced leg carries an `error` reason so the UI can explain it, never a bare blank:
`ambiguous` (strike not listed for that expiry) or `no_market_data` (resolved but no
bid/ask/last/close — likely illiquid / deep-ITM / far-dated). Map it via
`legPriceReason(leg)` from `@stw/shared` — the single source of truth for unpriced copy.

### Admin — local real order placement (added 2026-07-03)
The same `ibkr_proxy.py` also exposes `POST /place_order` and `GET /order_status/<id>`
(write-capable `ib_insync` session, `readonly=False` — the pricer above stays `readonly=True`).
The admin browser calls it from a row-scoped "Open via IBKR" / "Close via IBKR" button in
`LegTimeline.tsx`, which opens a modal asking for real quantity + order type (legs are
weight-only — see `legs.ts`'s header comment — so quantity can never be derived from weight,
only suggested via `app_config`'s capital-allocation defaults). A confirmed fill PATCHes the
triggering diary row's price/`broker_*` columns (open) or inserts a new Closed diary row (close) —
never the requested/guessed price. Gated by `canEdit` + `app_config.ibkr_live_trading_enabled` +
`AppCapabilities.onExecuteIbkrOrder` only being wired in `apps/admin/src/main.tsx`.
**This is explicitly admin-only, local-proxy-only, single-account.** Do not extend it to
arbitrary subscribers without a separate legal/compliance review — that would need an entirely
different integration (IBKR's Client Portal Web API, or Alpaca's OAuth trading API per
`plans/20260524_mobile-transition.md`), not more gating on this one. `IB_PORT` is an env var
(`IB_PORT=4002` for paper mode) so testing never requires editing the file.

### Subscriber — Flex Query portfolio sync
`apps/web/netlify/functions/ibkr-flex.ts` is a **serverless** Netlify function that
calls IBKR's cloud Flex Web Service API to fetch a subscriber's **own** portfolio positions.
Security model: client sends its Supabase JWT → function verifies it, reads
`ibkr_flex_token` + `ibkr_query_id` from `profiles` via service key → calls IBKR →
writes positions to `user_positions`. The raw token never reaches the browser.

Required Netlify env vars on the **web** site:
- `VITE_SUPABASE_URL` — already present (shared with the Vite client build)
- `SUPABASE_SERVICE_ROLE_KEY` — server-side only, must be added separately (no VITE_ prefix)

These three pipelines are independent. The admin proxy prices (and now trades) STW's own
positions on the admin's own account; the subscriber function only ever reads the
subscriber's own account, read-only. Do not conflate them.

---

## Conventions

### Netlify Functions
- **Anthropic:** use **direct `fetch()` to `https://api.anthropic.com/v1/messages`** — do NOT import `@anthropic-ai/sdk` (ESM/CJS bundling issues in the Netlify Node runtime → 502s). Pass `x-api-key`, `anthropic-version: 2023-06-01`, JSON body. See `apps/web/netlify/functions/macro-recap.ts`.
- **Supabase — NO `@supabase/supabase-js` in Netlify Functions.** `createClient` from supabase-js 2.100+ throws on Node 20 because the Realtime client tries to open a WebSocket at import time and crashes the function. Use **direct REST `fetch()`** for all Supabase reads/writes in functions — `GET /rest/v1/<table>?...` with `apikey` + `Authorization: Bearer <key>` headers. See `apps/web/netlify/_lib/recap-core.ts` for the pattern. This replaces the old guidance about `createClient` options.
- **Env var whitespace:** always call `.trim()` on env vars read in functions — pasted keys/URLs sometimes carry a trailing newline that causes "Invalid API key" from Supabase even when the value looks correct in the Netlify UI.
- **Both web and admin deploy functions.** Both `apps/web/netlify/functions/` and `apps/admin/netlify/functions/` are deployed by their respective Netlify sites. Functions that must work on both sites (e.g. `macro-recap.ts`) need a copy in each app — Netlify functions are site-scoped, not cross-domain callable.

### Macro data sources & module structure (FRED re-platform, 2026-07-10)
Feed responsibilities, post-re-platform (full inventory: [`plans/20260707_data_feeds_inventory_and_plan.md`](plans/20260707_data_feeds_inventory_and_plan.md)):
- **FRED** (`FRED_API_KEY`, server-side, no `VITE_`): the authoritative source for macro **index**
  indicators — VIX (`VIXCLS`), VIX3M (`VXVCLS`), US10Y (`DGS10`, already %), HY-OAS credit
  (`BAMLH0A0HYM2`), broad dollar (`DTWEXBGS`) — **and** the Event Risk release calendar. Free,
  ~120/min, no daily cap. **FRED is server-only (no CORS): browsers reach it through the `fred`
  Netlify proxy** (`apps/{web,admin}/netlify/functions/fred.ts`); the scheduled writers call FRED
  directly. Series ids + URL/parse helpers are in `packages/shared/src/utils/fred.ts` (`FRED_SERIES`,
  `buildFredUrl`, `parseFredObservations`); the browser cache is `fredCache.ts` (mirrors `maCache`).
  This is the pattern to prefer for any new key — keep it server-side behind a proxy.
- **TwelveData** (`VITE_TWELVEDATA_KEY`): now **equity daily closes ONLY** — the trend ETFs
  (SPY/QQQ/IWM/RSP/VEA) and Sector-Rotation constituents. Cache via `maCache.ts`. **It still bills 1
  credit/symbol on the free ~8/min tier**, so keep routing any batch through `tdBatchCloses`/
  `fetchClosesChunked` (≤8 symbols, ~65s pacing) — never one big unchunked call. Indices are OFF
  TwelveData now; do not add index series back to it.
- **Finnhub** (`VITE_FINNHUB_KEY`): live stock quotes only (free tier serves neither index symbols nor
  daily candles), plus `profile2` for `sector-map-sync`'s GICS resolution.
- **VVIX is dropped** — no free feed serves it; don't re-add a perpetually-null input.
- **Generic pacing helper**: `runPaced` + `FEED_LIMITS` in `@stw/shared` (`utils/pacing.ts`) is the one
  chunk-and-pause throttle every feed routes through (FRED/Finnhub/TwelveData). Reuse it for new feeds.
- **Module structure (v2):** the Macro tab is **weighted module scores**, NOT a single MA table. The
  9/21/200 MA table is **Trend only**; **VIX → Volatility/Stress**, **US10Y → Rates+Dollar**. Modules
  5–7 (Volatility / Credit / Rates+Dollar) are consolidated into ONE **Market Internals** table
  (`MarketInternalsCard.tsx`) — one row per sleeve, values right-aligned; the three underlying card
  components are kept but parked. Pure scorers live in `packages/shared/src/utils/macro.ts`. Every card
  shows a `SourceNote` footer with a full `fmtDateTime` **"Updated:"** stamp + a date-only "data through".
- **Regime weights are admin-configurable** — `app_config` keys `regime_weight_*` (percent, migration
  061), read via `useAppConfig().regimeWeights`, passed to `environmentScore(sleeves, weights?)` (which
  normalizes by the total, so scale is cosmetic). Edited on Admin Config → "Market Regime weights". The
  `macro-snapshot` writer reads the same keys so the persisted regime matches the live banner.
- **Event Risk** (`macro-events.ts`, web + admin): FRED `/fred/release/dates` **per release_id**
  (CPI 10 · PCE 54 · NFP 50 · GDP 53 · PPI 46) + a static `FOMC_DECISION_DATES` list, window-filtered.
  The MarketWatch/`cheerio` scrape is retired. A calendar has no actual/consensus values, so
  `classifyEventRisk`'s surprise/shock path no-ops; upcoming-event windows work fully. **FOMC dates are
  a hardcoded best-effort list — verify against the Fed's published schedule when they roll over.**
- **Macro recap** (`macro-recap-am/pm` scheduled fns + `macro-recap.ts` manual fn): a **daily** note, two
  sessions per weekday (AM pre-market 12:00 UTC, PM post-market 21:30 UTC). Grounded ONLY in passed data
  — **never fabricate figures**. Sonnet→Haiku (`MACRO_RECAP_MODEL` override). Persisted in
  `public.macro_daily_recaps` (migration 051). Hook: `useDailyRecap.ts`.
- **5D trend engine** (`useMacroTrendHistory.ts`): reads `public.macro_daily_snapshots` (migration 048),
  written by the `macro-snapshot` scheduled fn (4:30pm ET weekdays), folding today's live scores in.
  Supabase-backed (not localStorage). The **v2.0.0 writer (FRED indices + HY-OAS + paced equity) is on
  `staging`**; it self-populates only on the **production (`main`) deploy** (Netlify fires scheduled
  functions only there), so PROD snapshot rows won't carry real trend/vol/credit scores until the
  pending `staging → main` promotion — see Next Steps. Deltas are legitimately null until ≥~6 rows accrue.
- **Sector Rotation** (Module 11): per-sector radar cards + constituent chips, fetched via
  `fetchClosesChunked` (TwelveData, paced).

### Timestamps
All UI timestamps use `fmtDateTime(val: Date | string | null)` from `@stw/shared`.
Output format: **`Mon D · H:MM AM ET`** (Eastern Time, year omitted).
- DB stores UTC; always display in ET via `timeZone: 'America/New_York'`.
- Label pattern: `[Action]: ${fmtDateTime(value)}` — e.g. `Last synced: Jun 5 · 7:46 AM ET`.
- Never call `toLocaleString` / `toLocaleTimeString` directly in components for timestamps.
- **No per-component date helpers** (e.g. a local `fmtStamp`) — import `fmtDateTime`. This covers every full "as of" timestamp: column labels, source lines, tooltips, alerts. (Exceptions: a date-only display like `action_date`, or a compact intraday tag like the Signals `@ 4:00 PM` price time — neither is a full timestamp.)

### Ticker links
**Any ticker shown anywhere in the UI must be a hyperlink to its detail page** — never
plain text. Use `<TickerLink ticker onSelect={onSelectTicker} />` from `@stw/ui` (free
text like a digest can be linkified token-by-token against the holdings set). This is a
standing rule: when you render a ticker, link it without being asked.
**Exception: the Macro tab.** Sector ETFs, index symbols (VIX, US10Y, etc.), and the Sector Rotation
card's Leaders/Setting Up constituent tickers render as plain styled chips/text, not `TickerLink` —
the Macro tab has no `onSelectTicker` navigation capability wired in (it isn't scoped to STW's
holdings set), so there's no detail page for most of these symbols to link to.

### Counts
"Positions" counts exclude the `CASH` balance row (it's not a position) and reflect the
active filter (closed hidden by default). The FilterBar count shows `N of {total}`.

### Sector taxonomy (standing, 2026-07-10)
- The canonical sector set is **GICS-11 + `ETF` + `Cash`** (`packages/shared/src/constants/sectors.ts`,
  `GicsSector`/`SectorBucket`). `ticker_sector_map.sector` holds one of these values — never a raw
  Finnhub industry label. Resolve with `resolveSector(ticker, finnhubLabel?)` (TICKER_GICS override →
  Finnhub→GICS fold → null); never re-implement the mapping. A new ticker is auto-mapped by the
  `sector-map-sync` scheduled fn; add a `TICKER_GICS` entry only to correct a mis-folded name or a
  non-equity holding (ETF/Cash).
- **`ETF` and `Cash` are excluded from sector-concentration** (`isNonEquityBucket`) — they're not an
  equity sector, so they never form a bucket and never show as `unevaluated`. A genuinely unmapped
  ticker (no override, no Finnhub industry) stays `unevaluated`, never a breach.

### UI consistency (standing rules, host 2026-06-23)
- **White text on green.** Any filled `--acc`/green button or active toggle uses **white** text, never
  black/dark (black-on-green is low-contrast). Match the existing Save buttons (`color: '#fff'`).
- **Sibling tabs read as one app.** The Trades filter bar mirrors the Ticker Details `FilterBar` chrome
  (full-bleed surface bar, same control styling, same wording — e.g. "All Baskets", not "All Sectors").
  Every tab uses a **full-bleed layout** — control bar → filter bar → padded scroll area — never a
  centered/max-width column. When a new tab's data shape matches an existing one (e.g. My Portfolio vs.
  Trades), **reuse the exact same table styles** (`th`/`td`, etc.) rather than inventing a new look.
  This bit hard in the 2026-06-25 My Portfolio work — a from-scratch centered layout had to be reworked
  twice to match the siblings' full-bleed chrome.
- **Multi-column layouts stack on mobile.** Side-by-side sections (e.g. the Risk-Appetite gauge ┃
  breakdown) use `flexWrap` so they fill the full width on desktop and stack to a single column on
  mobile, rather than a fixed grid that gets cramped. Table columns that don't fit a narrow screen are
  hidden outright via the shared `useIsMobile()` hook (e.g. Trades' "Init Wt" column is desktop-only)
  rather than reflowed or truncated.
- **Filter/sort control ORDER is canonical — don't reinvent it per page.** Every filter bar follows
  **Search → Baskets → (Tiers/Status) → Types → Sort → toggles (checkboxes) → Clear → count**. Sort sits *after*
  the filters, never second. Match the order in `FilterBar.tsx` / `TradesFilterBar.tsx`; new tabs differ only by
  which filters exist, not by arrangement.
- **Timestamps align right; the left of a filter bar is for filters.** A "Last synced / Updated" stamp goes on
  the **right** of its bar (right-aligned), not the left — the left edge is filter real estate (host, 2026-06-25).
- **A list/blotter is a flat table by default; grouping is an opt-in checkbox** (like "Tailed only"), not forced
  sections. My Portfolio reuses the Trades `th`/`td` table styles; its "Group by ticker" toggle is the accordion.
- **Equity/Shares : Options ratio is computed by current MARKET VALUE, per leg** — shares on the live quote,
  option legs on their mark (cost weight grossed up by `mark÷entry`). **Never** by cost/premium weight and
  **never** by classifying a whole holding as equity-or-options (that dumps shares+overlay positions into equity
  and badly understates options). The host quotes the split by market value (confirmed 2026-06-25 against prod
  leg data: cost-weight ≈ 87:13 vs market-value ≈ host's 76:24). Same basis on the Stock Picks Overview card and
  the My Portfolio summary card.
- **Overview blocks share one header pattern.** Title lives OUTSIDE the card via `SectionHeader`, with an
  optional right-aligned `Updated: {fmtDateTime}` stamp — used by the webinar, changes, unpriced, and
  stale blocks. Don't put a block's title or its date inside the card.
- **Admin-only action hints.** Instructions a subscriber can't act on (e.g. "Run the IBKR sync") render
  only when `canEdit`; the explanation still shows to everyone.
- **Routine review-flags are admin-only** (host 2026-06-26). Operational uncertainty the routine surfaces —
  "flagged for review", "left open rather than auto-closed", missing-DD / snapshot-mismatch notes — must NOT
  appear in the subscriber-facing digest (`run_log.digest` → "Latest Portfolio Changes"). The public digest
  carries only **confirmed** changes; review-flags go to `run_log.summary` / the chat output (admin-gated).
- **Ticker Detail = four non-overlapping surfaces, one job each** (contract:
  [`plans/20260625_commentary_vs_transaction_boundary_spec.md`](plans/20260625_commentary_vs_transaction_boundary_spec.md)):
  **Highlight box** = `holdings.summary` (durable narrative paragraph) · **Key Points** = `holdings.bullets`
  (durable supporting detail — receipts + angles, **de-duped vs the summary**, never restating it; §2A) ·
  **Commentary** = `conviction_comments` (dated episodic views) · **Transaction History** =
  `leg_transactions.notes` (mechanics). Never re-derive one surface from another in the renderer.
- **Durable thesis source = local DD files** at `~/Documents/Claude/Projects/Stock Talk Weekly/Tickers DD/<TICKER>.md`
  (one per opened position; line 1 is a `**Source:** [Discord](url)` link; template `_TEMPLATE.md`). The apps
  NEVER read these — `holdings.summary`/`bullets` are the condensed projection, written from them by the
  routines (create on new position, non-destructive update on a durable DD expansion). Same private-library
  pattern as the methodology `.md` files.
- **Conviction delta is routine-recorded, never app-derived.** The Conviction Changes Overview block reads
  `conviction_comments.prev_conviction_level` (043) → renders `prev → current` directly. Do NOT reconstruct
  changes by diffing comment-level history across rows — it's sparse and contradicts the routine. The routine
  stamps the prior conviction on every comment it writes (= current when reaffirming).
- **Source-message icon is shown to everyone.** The "open original message" link (`dd_source_url` /
  `source_url`, via `SourceLink`) renders for all users — the platform is a companion to the Discord
  membership, so Discord itself gates access (member sees the message, non-member hits Discord's no-access
  screen). Don't admin-gate it. Use a directional glyph (▲▼★) for change *direction* and the external-link
  glyph only for *opening the source* — don't conflate the two.
- **Every modal in the app uses the same fixed-overlay chrome** (host 2026-07-03, after `EventForm`'s
  modal briefly diverged and had to be unified): `position: 'fixed', inset: 0` dark backdrop
  (`rgba(0,0,0,0.55)`), **vertically centered** (`alignItems: 'center'`, not `flex-start`/top-aligned),
  `background: 'var(--surface)'` (not `var(--s2)` — that reads as washed-out/wrong), click-outside
  (backdrop `onClick`) closes it, inner content `stopPropagation`s. See `PositionEditor.tsx`,
  `IbkrOrderModal`, and `EventForm` in `LegTimeline.tsx` for the canonical version. A new modal should
  copy this exactly, not invent its own positioning.
- **A real-money/broker action gets a visually distinct solid-fill color, never green or red.** The
  admin's "Open via IBKR" / "Close via IBKR" buttons are solid dark green (`#15803d`, white text) —
  deliberately *not* `--acc` (bright green = ordinary Save) and *not* `#ef4444` (red = Delete), so a
  real order can never be mistaken for either at a glance. If a future action carries similar
  real-world weight, give it its own solid color rather than reusing Save's or Delete's.
- **An admin settings page groups related fields into one card with ONE Save button**, not a Save per
  field (`ConfigPage.tsx`'s pattern, host 2026-07-03) — each row reports its draft value up to the
  section, which owns the dirty-tracking and the single mutation call. Reuse this pattern for any
  future Config/Manage addition rather than one-Save-per-row.
- **Reserve a fixed-width slot for optional row prefixes/labels, even when unused.** A column of
  inputs where some rows have a prefix (e.g. "$") and others don't will visually misalign unless every
  row reserves the same-width slot regardless of whether it's populated (`ConfigPage.tsx`'s `rowPrefix`
  class is the reference). Applies to any repeated label+input row layout, not just Config.
- **A calculated value that legitimately computes to zero must say so, never go silently blank.** The
  IBKR order modal's quantity suggestion shows `0` plus an explanatory shortfall note when the budget
  can't cover one unit, rather than leaving the field empty (which reads as "nothing computed" instead
  of "budget insufficient"). Apply the same instinct anywhere a calculation can legitimately land on
  zero/empty — show the result and why, don't hide it.
- **Settings pages hold only account setup — never live evaluation/violation display** (host decision,
  2026-07-06). A Settings form configures thresholds/credentials; it does not also show you how you're
  doing against them. That belongs on the page the data itself lives on (e.g. Limits violations live
  on My Portfolio, not Settings, even though the thresholds that drive them are edited in Settings).
  If a future Settings addition is tempted to add a "preview" of live data next to a config field,
  don't — split it the same way `RiskConfigForm` (Settings) and `ViolationsSummary` (My Portfolio)
  were split.
- **A list page's default ticker-click action should open that page's OWN data about the ticker, not
  jump to a different page's tracked version of it** (host decision, 2026-07-06, My Portfolio). My
  Portfolio's ticker click now opens an own-position detail pane instead of navigating to STW's
  tracked position (`PortfolioPositionDetail.tsx`) — the STW-position view is still reachable, but
  as an explicit named link inside the pane, not the default click target. Apply the same instinct to
  any future page that lists a subscriber's own data but is tempted to default-link into STW's data
  instead. **Every row opens the pane, tailed or not** (host, 2026-07-09) — don't gate the detail on
  whether STW tracks the ticker; an untailed position still has its own P&L / sector / risk to show.
- **Onboarding/setup content collapses once its job is done — never permanent prime real estate**
  (host decision, 2026-07-08, Settings redesign). The IBKR "How to connect" 7-step walkthrough used
  to render unconditionally even for an already-connected returning user; it's now collapsed behind
  an "Edit connection ▸" toggle (default-collapsed once connected, default-expanded on first-ever
  setup). Apply the same instinct to any future setup/walkthrough content: default-collapse it the
  moment the thing it's walking the user through is already done.
- **A value that's conceptually always one sign should never make the user type that sign.** The
  drawdown-ladder inputs used to require typing a negative number (`-10`); they now show "At 10%
  drawdown" (a positive magnitude) and flip the sign internally on read/write. Apply this to any
  future numeric input where the sign is a fixed property of the concept, not a real choice the user
  is making — typing the sign invites a flipped-logic error for no benefit.
- **A hardcoded-length list backed by a JSONB/array column is almost never actually fixed-length** —
  it's just however many rows the first version happened to seed. The risk-limits drawdown ladder
  was hardcoded to exactly 2 rungs in the UI (`RiskConfigForm.tsx`) even though the underlying
  `risk_config.ladder` column was always a JSONB array and the pure scorer
  (`packages/shared/src/utils/limits.ts`'s `drawdownLadderTarget`) already iterated it generically —
  the 2-step limit was a UI artifact, not a real constraint. It's now a dynamic array (Add/Remove
  rung). Before hardcoding a "fixed" count for any array-backed config, check whether the schema and
  pure logic already support N — if so, don't under-build the UI to match an arbitrary seed value.
- **A subscriber page with several distinct jobs gets a `SubNav` sub-tab bar, not one long scroll**
  (host, 2026-07-08, My Portfolio → Overview / Positions / Risk / Tailing). Same secondary-nav
  pattern as the admin (`SubNav` primitive). Corollary: **the filter toolbar is tab-scoped, not
  global** — it belongs only to the tab that browses a list (Positions), not the whole page. Global
  actions (Sync, last-synced stamp, P&L eye) sit in a persistent strip beside the sub-nav.
- **Both detail panes are instances of the shared `DetailPane` primitive** (`packages/ui/src/primitives/DetailPane.tsx`) —
  Stock Picks (`HoldingDetail`) and My Portfolio (`PortfolioPositionDetail`) share header + badge
  strip + 3-column metric block + stacked section cards. A new detail surface copies this, never a
  bespoke card stack. Reach for `EmptyState` for any "coming soon"/no-data block (icon + one line),
  never a paragraph of apology prose. **On the My Portfolio pane specifically** (host, 2026-07-09):
  the header badge is the ticker's **market sector** (universal to the position); everything about the
  *tailed pick* — trader badge · basket · conviction + tier badge · you-vs-STW sizing · a compact ↗
  link to STW's tracked position — is grouped onto ONE row in the Tailing section, not scattered into
  the header. Don't spread pick metadata across the header again.
- **The pick ↔ execution loop is bidirectional and must stay so.** Stock Picks detail → "View your
  position →" (shown only when the signed-in subscriber holds it, gated `!isAdmin`, via
  `/portfolio?ticker=`) and My Portfolio detail → "View STW's tracked position →" (via
  `/picks?ticker=`). Both target pages read the `?ticker=` param to open that detail. Don't add one
  direction without the other.
- **KPI cards read uniformly: hero number · qualifier (delta) · uppercase label** — always, via the
  `KpiCard` primitive (`primaryValue` = the number, `delta` = the qualifier, `secondaryValue` = a
  ratio's second half like `/ 9%`). Don't put the % on top in one card and below in the next.
- **A permanently-empty column/field reads as broken, not pending — remove it until its data exists.**
  My Portfolio's Positions table dropped the Return column (100% em-dashes: `unrealized_pnl_pct` isn't
  in the subscriber Flex feed) rather than ship a dead column. Show a column only when it can carry
  real values; surface a genuine gap as an `EmptyState`, not a table of dashes.
- **A "Type" column shows the instrument kind (Shares / Call / Put), not the direction.** In a
  long-only book "Long" on every row is near-zero information; the kind is what distinguishes legs.
- **Position sizing vs a tailed trader has TWO distinct tones, never one** (host, 2026-07-09):
  **oversized** (you hold MORE than the trader → concentration caution) = **warning/amber**;
  **undersized** (you hold less → informational) = **info/blue**; within ±0.5pp = neutral "in line".
  One source of truth: `sizingTone()` in `@stw/shared` (returns the label + `var(--status-*)` token
  refs) — used by both the Tailing tab (`DeltaChip`/`SizingBar`) and the detail pane. Don't render
  divergence as a single amber-for-both chip again.
- **The Portfolio Heatmap is a shared, library-free treemap** (`packages/ui/src/components/PortfolioHeatmap.tsx`,
  built on the pure `squarify` util in `@stw/shared`): box area ∝ weight, color ∝ performance
  (`color-mix` on `--pnl-gain`/`--pnl-loss`, Today ±3% / Total ±25% full-saturation). Offer the
  **Today** color mode only where a live day-change feed exists (Stock Picks yes; My Portfolio no —
  stored marks only). Grouping is **All | Basket | Sector**, and every grouped mode draws a labeled
  header per block so it's clear which cluster is which. Feed `sector` from `useSectorMap`.

---

## Design System

**Fully rolled out repo-wide, not queued** — the note that used to live here calling this "queued
and spec'd" was stale; the build described in
[`plans/20260706_stw-design-system.md`](plans/20260706_stw-design-system.md) (4 phases: audit → tokens → core
components → enforcement) shipped completely before the 2026-07-08 session, including an eslint
rule (`no-restricted-syntax` for literal colors/raw font-sizes) with **zero baseline exceptions
left**. **Read [`docs/design-system/CONTRIBUTING.md`](docs/design-system/CONTRIBUTING.md) first** —
it's the actual current source of truth for which token or `packages/ui/src/primitives/` component
to reach for, not this section. Don't invent a second parallel token scheme (e.g. a new Tailwind
theme extension) — extend `packages/ui/src/styles/tokens.css` / `packages/shared/src/constants/tokens.ts`
instead, the same way every page since has.

- **Font:** Barlow Condensed (700/800) for the **STW logo** in the header only; system sans-serif (`font-sans`) everywhere else including page headings and login
- **Logo:** STW mic + green arrow SVG
- **Default theme:** Dark. Toggle persists to `localStorage` (`stwTheme`); light
  theme applied via `[data-theme="light"]`. Never hardcode colors outside `:root` /
  `[data-theme="light"]` — always use CSS variables, defined once in `packages/ui/src/styles/tokens.css`.
- **`--t3` (muted text) was fixed for AA contrast** during the design-system Phase 2 pass — old dark-theme
  value `#525252` (~2.5:1 on `--bg`, fails AA) is now `#808080` (~5:1); old light-theme value similarly
  darkened. If you see `--t3: #525252` anywhere, that's a stale/reverted copy, not the current token.
- **Core primitives** (`packages/ui/src/primitives/`): `Button` (4 variants incl. a `dirty` prop for
  unsaved-changes highlighting), `FormRow` (`'stacked'`/`'horizontal'` layout, label/input/suffix/hint
  grid — combine `layout="horizontal"` with `hint` freely, a real wrapping bug there was found and
  fixed 2026-07-08), `TextInput`, `AlertStrip` (info/positive/warning/negative), `StatusPill`,
  `Badge`, `KpiCard`, `Modal`, `AccordionList`, `DetailPane`/`ListDetailSplit`, `SectionHeader`,
  `DataTable`. Reach for one of these before writing a new inline-styled control.

---

## Tech Stack
| Concern | Choice |
|---|---|
| Framework | React 18 + Vite 5 + TypeScript |
| Workspace | pnpm workspace (no Turborepo/Nx) |
| Routing | react-router-dom 6 |
| Data | TanStack Query 5 (60s staleTime) |
| State | Zustand 5 |
| Backend | Supabase (auth + Postgres + RLS) |
| Prices | Finnhub (live), TwelveData (daily/MAs), IBKR proxy (options legs) |
| Charts | lightweight-charts (GEX); react-gauge-component (Macro Risk-Appetite gauge) |
| Styling | Tailwind 3 + CSS variables |

---

## Session Close

Run this routine after ~10 commits or when wrapping up a session.

### 1 — Git hygiene
```bash
git fetch --prune origin          # drop stale remote-tracking refs
git branch --merged staging       # list local branches already merged
git branch -d <merged-branches>   # delete each one
```
Remote branches merged into staging: delete via GitHub UI
(Settings → Branches, or the "Delete branch" button on a closed PR).
Claude can attempt `git push origin --delete <branch>` but may get a 403 —
flag it if so and ask the user to delete manually.

### 2 — Supabase check
- Were any new migrations authored this session? List them and confirm the user has applied them via the Supabase SQL editor.
- If schema or RLS changed, remind user to verify on the staging project before shipping to prod.

### 3 — CLAUDE.md review
Review every section and ask: *does this still reflect the codebase, or is it stale?*
- Update migration count if new ones were added
- Update AppCapabilities list if the context interface changed
- Add conventions introduced this session (only if they're rules, not implementation details)
- Remove anything that's now discoverable from the code itself

### 4 — Staging deploy
Confirm the latest push to `staging` produced a successful Netlify build — but first decide whether a build was even *expected*.

Each `netlify.toml` `ignore` command builds only when the app dir, a shared
`packages/**`, or a root manifest changed (see Deployment). Check what the session's commits actually touched:
```bash
git diff --stat origin/main...staging   # files changed since last prod release
```
- **Only root/non-app files changed** (e.g. `CLAUDE.md`, `supabase/migrations/**`, `.github/**`): a **Canceled** deploy is *correct and expected* — there was nothing to rebuild. Leave it; do **not** force an empty commit (that just produces another no-op build).
- **App or shared code changed** (`apps/web/**`, `apps/admin/**`, `packages/**`) but the deploy is **Canceled or Failed**: this is a real problem (the `ignore` command should have built it). If it was canceled by a rapid superseding push, trigger a fresh build:
  ```bash
  git commit --allow-empty -m "Trigger staging deploy" && git push -u origin staging
  ```
  If it Failed, read the Netlify build log before re-triggering.

### 5 — Session summary
Briefly list: what was shipped, any pending user actions (migrations to apply, env vars to add, manual branch deletes), and any known open issues to tackle next session.

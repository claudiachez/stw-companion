# STW Companion — Claude Code Guide

> **⚠️ START HERE — branch.** **`staging` is the active trunk** — all feature work happens here.
> **`staging` is 2 commits ahead of `main` as of 2026-07-06** (`a57f166`/`af174fc`, pre-existing from the
> prior session — unrelated to this session's work). **This session's entire Week-1 integrity-guardrails
> build is on an OPEN, UNMERGED PR** — [PR #67](https://github.com/claudiachez/stw-companion/pull/67)
> (`claude/week1-integrity-guardrails` → `staging`) plus one follow-up commit — **not on `staging` at
> all yet**, host review pending. Do not assume any of that work is live until the PR merges.
> Cut new feature branches from `staging` (not from the open PR branch, unless you're continuing that
> exact work — ask if unsure).
> Migrations run to **058** (`054_integrity_guardrails` [ops_log + closed-weight invariant trigger +
> leg_transactions provenance columns], `055_risk_limits_engine` [risk_config + ticker_sector_map],
> `056_risk_violation_acks`, `057_regime_daily` [+ `traders.regime_proxy`],
> `058_limits_premium_tier` [PROD only — see below]) — **054–057 verified applied on both PROD
> (`usmqbohcjcyszjxxvnqu`) and sandbox (`uolabcgbnrkhzpwuvzlk`) as of 2026-07-06**; **058 is PROD-only**
> (sandbox has no `tiers`/`profiles` tables at all — a pre-existing, documented gap, not a pending task).
> `app_config.ibkr_live_trading_enabled` = `0` on both PROD and sandbox (confirmed 2026-07-05).
> If migrations stop at 021 you are on a stale checkout, re-sync.
> **First commands every session:**
> `git fetch origin && git checkout staging && git pull --ff-only`, **then cut a feature branch**
> before making any change: `git checkout -b claude/<short-feature-name>`. **Never commit directly to
> `staging`** — work on the branch, push it, open a PR back to `staging` (host merges/approves).
> `main` is promoted only by an approved staging→main PR (= a production deploy) — this is a standing
> approval gate, not a one-time exception; ask before opening a staging→main PR even if staging looks
> ready.
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

## Current Status — Week 1 integrity guardrails built, awaiting PR review (handoff 2026-07-06)

**NEXT SESSION = the entire Week-1 build described below is on an OPEN PR, not on `staging`.**
[PR #67](https://github.com/claudiachez/stw-companion/pull/67) (`claude/week1-integrity-guardrails` →
`staging`) plus one follow-up commit implements all 7 items from
[`plans/integrity-guardrails.md`](plans/integrity-guardrails.md) — full breakdown, verification status,
and every deviation from the source spec are in
[`plans/integrity-guardrails-report.md`](plans/integrity-guardrails-report.md) (read that before this
section if picking up any of this work). In short: fixed the `macro-snapshot` cron's real bug (a
missing Netlify timeout override, not the non-discovery first suspected), corrected 8 PROD holdings
with a phantom nonzero weight on Closed positions + added a DB trigger enforcing that invariant, shipped
an additive integrity migration (`ops_log`, provenance columns on `leg_transactions`, an ET-safe
trading-date helper), built a new per-user risk-limits engine (flags only, no enforcement — extended
same-session to a Premium-gated subscriber feature in Settings, see below), and built `regimeGate()` +
`regime_daily` schema for an advisory market-regime light (deliberately NOT integrated with the Macro
Dashboard composite below — two separate systems on purpose). **Because none of this is merged yet, the
Macro tab's known bugs described below (empty `macro_daily_snapshots`) are STILL LIVE on `staging`/`main`
today** — the fix exists only on the open PR.

**Host-directed extension, same session:** after reviewing the shipped admin-only Limits panel, the host
asked to extend it to subscribers immediately (Premium tier, self-service, editable thresholds) rather
than deferring — see the report's "Extended to a subscriber-facing feature" subsection under Item 2.

**Also this session:** all 36 (PROD) / 37 (sandbox) `leg_transactions` rows that were stored as bare
midnight-UTC placeholders (see the report's Item 1 section) were stamped with an assumed 4:00pm ET
market-close time-of-day on their existing, already-confirmed-correct date — a direct data fix, not a
migration; logged to `ops_log` on both environments.

**Host has asked for a UX proposal before any further building** — see Next Steps #1. Do not start
implementing My Portfolio/Settings changes without presenting and getting sign-off on a proposal first.

The IBKR order flow remains **functionally verified in the browser but never tested against a real IB
Gateway** (no Gateway access from this environment) — unchanged, still in Next Steps. Below that, the
Macro Dashboard v2 work is unchanged from the 2026-07-02/07-05 handoffs — no app/repo code changed there
this session except via the still-unmerged cron fix above. The Macro tab's full v2 rebuild (spec:
[`plans/macro_dashboard_spec.md`](plans/macro_dashboard_spec.md)) is **feature-complete and QA-verified
on `staging`** — all 11 modules, including the two that were previously deferred (P2 5D trend engine, P3
Event Risk) and Sector Rotation. Read the spec first if extending any module.

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
- **P2 — 5D trend engine** (`useMacroTrendHistory.ts`) — daily snapshots via `macro_daily_snapshots` (migration 048), written by the `macro-snapshot` Netlify scheduled function at 4:30pm ET weekdays. Drives the banner's 5D direction descriptor, score-strip 5D deltas, and gauge 5D delta. **Note: `macro-snapshot.ts` was broken (used `@supabase/supabase-js` which crashes Node 20) — fixed 2026-07-02, but the table was still empty as of that evening — see the ⚠️ note in the DB section above; verify before trusting this module's 5D data.**
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

**⚠️ Still true as of 2026-07-06:** `macro_daily_snapshots` (048) is **still empty on both PROD and
sandbox** — confirmed directly, not assumed. The 2026-07-02 fix (commit `3aa5528`, switching off
`@supabase/supabase-js`) was necessary but not sufficient: the real remaining bug, found 2026-07-06, is
that `apps/web/netlify.toml` never gave `macro-snapshot` a timeout override (unlike every sibling
scheduled function), so it was silently falling back to Netlify's short default given its ~10 sequential
external API calls. **That fix is built (`plans/integrity-guardrails-report.md` Item 0) but only exists
on the open PR #67** — until that merges and a scheduled run actually fires, this table stays empty and
the 5D trend engine has no real data. Don't assume a third new root cause here without first checking
whether PR #67 has merged and at least one scheduled cycle has passed since.

**Netlify env vars required:**
- Web site: `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, `VITE_TWELVEDATA_KEY`
- Admin site: `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`
- Optional: `MACRO_RECAP_MODEL` (overrides default claude-sonnet-4-6 → haiku fallback)
- **All Netlify functions now use `.trim()` on env vars** to guard against pasted-key whitespace.

**Production deploy history (last one 2026-07-05):** `staging → main` promoted via PR #66 (host-approved)
— everything since the 2026-06-23 event-sourcing promotion, including PRs #50–#65 and all Macro
Dashboard v2 + QA + regime-badge/IBKR-trading + rate-limit-fix work, was live on production as of that
date. **As of this handoff (2026-07-06), `staging` has moved 2 commits ahead of `main` again** (this
session's CLAUDE.md edits) and the entire Week-1 guardrails PR (#67) sits on top of that, unmerged into
`staging`. Any future promotion still needs **explicit approval** — this is a standing rule, not
resolved by precedent.

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
- **`last_action`/`action_date` derived from each ticker's latest diary event** (`plans/post_import_holdings_fix.sql`).
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
- **PROD import gotchas (baked into `plans/prod_import/*` + the SQL files):** (1) PROD's STW
  `trader_id` = `64a779f9-13ba-4cb4-824b-d70dcab3a49b` (sandbox = `9ec36b89-…`); seeds now resolve the
  trader **by name**. (2) The Supabase SQL editor threw "Failed to fetch" on the one big import — it was
  split into 9 small files in **`plans/prod_import/`** (run `1_wipe` → `8_legs` → `9_weights` in order).
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
Web API, or Alpaca's OAuth trading API per `plans/mobile-transition.md`); don't build toward it
incrementally. **Legs stay weight-only (%) forever** — real share/contract quantities are never derived
from weight and are always entered directly at order time (there is no plan to add share/contract
counts to the `legs`/`leg_transactions` schema). A confirmed broker fill is the only thing allowed to
patch a diary row's price after the fact — the requested/limit price never is, same rule as every other
close in this ledger.

**New plan docs (`plans/`):** `legs_event_sourcing_redesign.md` (spec) · `import_open_positions.sql`
(clean open-position import) · `post_import_holdings_fix.sql` (Next Step #2 seed) ·
`revert_legacy_category.sql` (drops the bad Legacy category) · `040_sandbox_verify.sql` (trigger test) ·
`legs_inspect.sql` (inspect legs/diary) · `zzadea_populate.sql` (seed test fixture).

**Decisions locked — integrity guardrails / limits engine / regime gate (host, 2026-07-06, PR #67):**
the limits engine (`packages/shared/src/utils/limits.ts`) is **flags only, forever, by design** —
nothing in this codebase enforces a position/sector/gross limit or a drawdown-ladder target on any order
path; it surfaces breaches for a human to act on. Same for the advisory regime gate
(`packages/shared/src/utils/regime.ts`'s `regimeGate()`) — see `docs/REGIME_EXIT_v0.md` for the
(unsigned) manual playbook a human would follow off it. **`regimeGate()` must never import from or be
unified with `macro.ts`'s Macro Dashboard composite** — deliberate, documented duplication; the gate
stays frozen (bump `engine_version` on any parameter change) while the Macro scorers evolve freely.
**Limits is a Premium-gated subscriber feature** (host decision, extending the original admin-only
scope same-session) — subscribers edit their own `risk_config` thresholds freely, no operator approval
required; gated via the existing `tiers.modules` mechanism (`'limits'` added to the `premium` tier,
migration 058). `ticker_sector_map` is a small, static, admin-editable table — explicitly not a live
data-feed integration, and explicitly not the same thing as `macro.ts`'s Finnhub-industry
`mapIndustryToSector()` algorithm (different, unrelated systems despite the superficial similarity).

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
- **One-time SQL applied (PROD + sandbox):** `plans/conviction_618_stars.sql` (8 stars → tier 5;
  AMZN/TSLA stay 0) + `plans/fix_fivn_shares_weight.sql` (FIVN shares lot 3.5→2.5, net-neutral 6.0%).
- **PENDING (host) — NOT a repo task, doesn't affect the apps:** the stale **`gradoxx-daily-summary`**
  Cowork scheduled task (duplicates morning PART 1's Graddox) is an **orphaned backend object** — it
  still fires ~9am but has no working delete UI (absent from Cowork→Scheduled; its task page 404s; the
  delete API is desktop-client-gated). Task UUID `8377c152-0ffa-474d-9ec0-2281a92edb26`, org Claudia Chez
  `aea1699f-e0b8-4ed4-80b9-4abb5d0a7711`; the underlying skill is `skill_01UY6zPNf9Do8eR4voyUvtm6`. Being
  cleared via Anthropic support / desktop skill-delete. Also smoke-test the routines on their next live runs.

## New this session (2026-07-05, staging → main — committed, pushed, promoted)

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

1. **PRESENT A PROPOSAL FIRST — do not start building.** The host reviewed this session's shipped
   Limits panel and asked for a redesign of My Portfolio + Settings before any more code is written.
   Requested, in the host's own words:
   - **Settings layout:** put "Limits engine — flags only" and "Your thresholds"
     (`packages/ui/src/features/limits/LimitsPanel.tsx` + `RiskConfigForm.tsx`, currently stacked
     single-column under IBKR Connection in `apps/web/src/features/settings/SettingsPage.tsx`) into a
     2-column layout next to the IBKR Connection card. Also review the Sync button — it currently
     appears in two places (the IBKR Connection card's own "Sync Portfolio" button, and
     `LimitsPanel`'s "Sync & Evaluate", both calling the same `useSyncPortfolio`) and needs one logical
     placement, not a duplicate.
   - **Move Gross Exposure / Position Concentration / Sector Concentration OUT of Settings, onto My
     Portfolio instead.** Settings should end up holding only account setup (IBKR connection + editable
     thresholds); the violation displays belong with the position data they're about, on
     `packages/ui/src/features/portfolio/PortfolioPage.tsx`.
   - **Bigger feature:** on My Portfolio, clicking a ticker currently navigates to STW's own tracked
     position for that ticker. Instead it should open a **detail pane for the user's own position**,
     cross-referencing: whether the user is tailing that pick vs. STW (or another trader), the new
     limits/regime indicators from this session, and open/closed P&L (**historic closed-position P&L
     data is not built yet** — see the old item on this below, still relevant background).
   - The host was explicit: **write and present a proposal for how My Portfolio changes, get sign-off,
     before implementing anything.**

2. **Confirm PR #67's status before continuing any Week-1 guardrails follow-up work.**
   [PR #67](https://github.com/claudiachez/stw-companion/pull/67) was open, unmerged, host-review-pending
   as of this handoff. Full detail on what's built vs. deferred:
   [`plans/integrity-guardrails-report.md`](plans/integrity-guardrails-report.md). Once merged:
   - Verify a real `macro_daily_snapshots` row lands after the next scheduled run (or invoke
     `apps/web/netlify/functions/macro-snapshot.ts` directly via `curl` — no code change needed, just
     needs the fix to be live).
   - Run the `regime_daily` backfill (`apps/admin/netlify/functions/regime-daily.ts`,
     `?backfill=1&days=N&before=YYYY-MM-DD`) across enough TwelveData quota cycles to reach the spec's
     ~2000-present ask, then run the 3 spot-checks from the acceptance criteria (a 2022 double-RED day,
     a 2024 GREEN+GREEN day, an Aug-2024 vol-inversion day).
   - Populate `ticker_sector_map` (currently empty on both environments) with real ticker→sector rows —
     until then, every position in the Limits engine's sector-concentration check rolls up under
     "Unmapped". Admin-editable table, no code needed, not blocked by anything else.

3. **Live-test the admin IBKR order flow against a real IB Gateway** — cannot be done from this
   environment. In order: (1) `IB_PORT=4002 python3 ibkr_proxy.py` against Gateway in **paper** mode,
   (2) place a real paper order end-to-end from the "Open via IBKR" modal, confirm the fill patches the
   diary row's price correctly, (3) test "Close via IBKR" on an open leg, (4) only after both work
   cleanly, consider port 4001 (live). Flag if `/order_status`'s `reqAllOpenOrders`/`reqCompletedOrders`
   lookup doesn't find a previously-placed order from a new connection.

4. **Phase 4 admin Manage area, Parts B/C — still not built** (Part A, Config, shipped 2026-07-03).
   Spec: [`plans/phase4_admin_manage.md`](plans/phase4_admin_manage.md). **Categories CRUD**
   (delete-guarded — block or reassign-to-Uncategorized on delete) and **Traders** (read-only
   recommended — only 2 seeded, FK'd everywhere, high-risk/low-value to make editable). No migrations
   expected.

5. **Macro Dashboard — remaining roadmap item** (spec: [`plans/macro_dashboard_spec.md`](plans/macro_dashboard_spec.md)).
   All 11 modules are built and in production. The one item left from the spec:
   - **Portfolio Heatmap** — treemap block on `PortfolioDashboard`, box ∝ `current_weight`,
     Today/Total + By Basket/All toggles. Spec § "Phase 4: Portfolio Heatmap".

6. **Overview/experience enrichment (host-requested, queued).** Stop the click-each-ticker experience:
   - **Transcripts library tab** — a NEW subscriber-facing **episode recap** (host's *trading psychology* +
     that episode's *per-ticker commentary*). **NOT** the local methodology `.md` files (apps never read those).
     Needs a new `webinars` table written by `stw-transcripts` + a new tab.
   - **Global Activity Feed** — one cross-ticker, reverse-chron feed merging Commentary + Transactions across
     all holdings, filterable. No schema (reads `conviction_comments` + `leg_transactions`). Low-cost.

7. **Subscriber closed-position P&L history — now directly relevant to item 1's proposal ask** (the
   host wants open/closed P&L in the new My Portfolio ticker detail pane), but the underlying data
   pipeline is still not built: the subscriber IBKR Flex query returns *open positions only* and the
   sync is delete-all-then-insert; closed history needs a genuinely different append-only,
   dedup-on-execution-id sync (a second Flex Query template + a new `user_closed_trades` table). Surface
   this constraint in the item-1 proposal (e.g. a placeholder/"coming soon" state in the detail pane)
   rather than blocking the whole feature on it.

8. **Future features (not migration work):** inline 2-line leg editing in the modal (deferred); `$100k`
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
supabase/migrations/         001..058 — single source of truth for DB schema/RLS (058 on open PR #67)
CLAUDE.md                    this file
```

### Layer rules (keep them honest)
- `@stw/ui` takes everything via **props/context** — no app-specific imports, no env,
  no routes. The Supabase client + `VITE_*` env are created in each app and injected.
- Admin/subscriber differences flow through **one `AppCapabilities` context**
  (`isAdmin`, `canEdit`, `onEditHolding`, `showIbkrBadge`, `onExecuteIbkrOrder`) — never scatter
  `isAdmin` checks deep in shared components. `onExecuteIbkrOrder` is the one capability that reaches
  outside the app entirely (the local IBKR proxy) — it's wired only in `apps/admin/src/main.tsx`;
  `apps/web` never sets it, which is what actually keeps real order placement out of the subscriber app
  (not just a UI-level gate).
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
- `supabase/migrations/` is the single source of truth (through **058**, on the open PR #67 —
  **054–057 verified applied on both PROD and sandbox; 058 is PROD-only** — sandbox has no
  `tiers`/`profiles` tables at all, a pre-existing gap, so it's N/A there, not pending).
  **Claude authors migrations; you apply them** via the Supabase SQL editor / `supabase db push`.
- **Local DB backups → gitignored `backups/`** (never committed — may carry PII), named
  `<date>_<purpose>.json` (e.g. `*_pre-coldrop.json`). Take a fresh logical snapshot of the
  affected tables before any destructive migration (column/table drop). The Supabase MCP has no
  `pg_dump`; pull tables via the REST API with the service key, or `select json_agg(...)`.
- Tables: `holdings`, `signals`, `profiles`, `tiers`, `run_log`,
  `user_positions`, `holding_transactions`, `conviction_comments`, plus the event-sourced
  `legs` / `leg_transactions`, `categories`, `traders`, `app_config`, and (added by the Week-1
  guardrails PR #67) `ops_log`, `risk_config`, `ticker_sector_map`, `risk_violation_acks`,
  `regime_daily` — see "Integrity guardrails" below.
  RLS on `holdings`/`signals` restricts writes to `cc@claudiachez.com`. `user_positions`
  uses user-owned RLS — each subscriber reads and writes only their own rows.
  The admin IBKR proxy now prices STW's option legs and writes **`legs.mark_price`** (the old
  `last_pnl_*` / `ibkr_legs` columns on `holdings` were dropped in 034).
- **`holdings.current_weight` must be 0 whenever `last_action` is `'Closed'` or `'Expired'`** —
  structurally enforced by a `BEFORE INSERT OR UPDATE` trigger (`fn_check_closed_weight_zero`,
  migration 054) that `RAISE EXCEPTION`s rather than silently coalescing. This exists because 8 PROD
  holdings were found with a phantom nonzero weight on a Closed position (traced to a manual
  flag-resolution path, not the normal close path) — see
  [`plans/integrity-guardrails-report.md`](plans/integrity-guardrails-report.md) Item 0.5.
- **`leg_transactions.weight` is `NOT NULL`** (migration 054) — plus three provenance columns:
  `weight_status` (stated/split_derived/resolved_late/assumed_split/zero_by_spec — NULL on historical
  rows = unknown provenance), `source` (live/snapshot_reconciled/backfill, default `'live'`), and
  `date_precision` (day/week, default `'day'`). Live ingestion routines populate `weight_status`/`source`
  going forward — see the SKILL.md amendments referenced in Data Ingestion below.
- **Integrity guardrails (`ops_log`, `risk_config`, etc.):** `ops_log` is a queryable backlog of
  operational events (outages, maintenance pauses, manual data corrections) — previously these only
  lived in `run_log` free text. `risk_config`/`ticker_sector_map`/`risk_violation_acks` back the
  per-user, flag-only limits engine (`packages/shared/src/utils/limits.ts` +
  `packages/ui/src/features/limits/LimitsPanel.tsx`, shared by apps/admin unrestricted and apps/web
  Premium-gated via `tiers.modules` including `'limits'`). `regime_daily` + `traders.regime_proxy` back
  the advisory regime gate (`packages/shared/src/utils/regime.ts`'s `regimeGate()`) — **deliberately not
  integrated with the Macro Dashboard's `macro.ts` composite; keep these two systems separate.** Full
  detail in [`plans/integrity-guardrails-report.md`](plans/integrity-guardrails-report.md).
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
- **A manual/backfilled `leg_transactions` entry must carry the host's real original Discord message
  timestamp as `executed_at`** (real time-of-day, ET-correct), never a bare date that serializes to
  midnight UTC — confirmed as a real bug 2026-07-06 (36+ historical rows had exactly this problem; fixed
  by stamping an assumed 4pm ET market-close time rather than researching each one, see
  [`plans/integrity-guardrails-report.md`](plans/integrity-guardrails-report.md) Item 1). `source` must
  also be set (`'snapshot_reconciled'` for a Friday truth-up reconciliation insert, per the cascade in
  `stw-friday-weighting`'s `SKILL.md`) — the machine-readable marker, never the free-text `notes`.

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
`plans/mobile-transition.md`), not more gating on this one. `IB_PORT` is an env var
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

### Macro data sources & module structure
- **Finnhub** (`VITE_FINNHUB_KEY`): live quotes for stock symbols only. Free tier does NOT serve index symbols (`^VIX`, `^TNX`, etc.) — they return empty. For index indicators, fall back to TwelveData last daily close.
- **TwelveData** (`VITE_TWELVEDATA_KEY`): daily OHLC for MA computation. Cache via `packages/ui/src/features/macro/maCache.ts` (`tdDailyCloses`, `loadCloses`, `loadLastDate`, `sma`), keyed `macro-ma-{symbol}` with `date` + `lastDate` (refresh once per day). Also the authoritative close source for VIX/US10Y/CBOE-TNX.
- **TwelveData bills 1 credit per symbol, not per HTTP call.** Bundling many symbols into one
  comma-joined request does NOT avoid the free tier's ~8-credit/minute cap — it still costs N credits
  and 429s if N > 8 (confirmed 2026-07-05: "12 API credits used, limit 8"; this was misdiagnosed once
  as an unrelated daily-quota exhaustion before the real per-minute cause was found). `tdBatchCloses`
  and `fetchClosesChunked` in `maCache.ts` both chunk to ≤8 symbols with ~65s pacing between chunks —
  **never revert to one large unchunked batch call**, and if you add a new module that fetches many
  TwelveData symbols, route it through one of these two helpers rather than a fresh `fetch()`.
- Without `VITE_TWELVEDATA_KEY`, MA/score cells degrade to `—` gracefully.
- **Module structure (v2):** the Macro tab is **weighted module scores**, NOT a single MA table. The 9/21/200 MA table is **Trend only**; **VIX → Volatility/Stress**, **US10Y → Rates+Dollar** — never put stress/rates indicators in the trend table. Pure scorers live in `packages/shared/src/utils/macro.ts` (unit-tested); fetching lives in the per-module hooks. Every macro card shows a **source + data-age** footer (`SourceNote`); daily series show their latest close date (`loadLastDate`).
- **Macro recap** (`macro-recap-am/pm` scheduled fns + `macro-recap.ts` manual fn): a **daily** note, two sessions per weekday (AM pre-market, PM post-market). Grounded ONLY in data passed to it — **never fabricate figures**. Prefers Sonnet, falls back to Haiku; override with `MACRO_RECAP_MODEL`. **Persisted cross-device** in `public.macro_daily_recaps` (migration 051, unique on `(date, session)`) — functions write with service-role key; RLS grants read-only `SELECT` to `authenticated`; admin-only Regenerate button with AM/PM selector. Scheduled: AM at 12:00 UTC (8am EDT), PM at 21:30 UTC (4:30pm EDT). Hook: `useDailyRecap.ts`.
- **5D trend engine** (`useMacroTrendHistory.ts`): daily module/indicator-score snapshots persisted server-side in `public.macro_daily_snapshots` (migration 048, one row per weekday, written by the `macro-snapshot` scheduled Netlify function at 4:30pm ET). **`macro-snapshot.ts` was broken (imported `@supabase/supabase-js` which crashes Node 20) — fixed 2026-07-02 to use direct REST fetch, but the table is STILL empty on PROD as of 2026-07-05** — the fix alone didn't resolve it; check Netlify function logs for `macro-snapshot` before assuming this module has real data. Banner direction descriptor, score-strip deltas, and gauge delta are consistent across devices once rows accumulate.
- **Sector Rotation** (Module 11, `useSectorRotation.ts` + `SectorRotationCard.tsx`): per-sector radar cards (RS vs SPY across Week/1M/3M/6M/1Y via `recharts`) plus "Leaders"/"Setting Up" constituent chips, fetched via `fetchClosesChunked` in `maCache.ts` (small sequential chunks to respect TwelveData's free-tier rate limit for the larger constituent symbol list).

### Timestamps
All UI timestamps use `fmtDateTime(val: Date | string | null)` from `@stw/shared`.
Output format: **`Mon D · H:MM AM ET`** (Eastern Time, year omitted).
- DB stores UTC; always display in ET via `timeZone: 'America/New_York'`.
- Label pattern: `[Action]: ${fmtDateTime(value)}` — e.g. `Last synced: Jun 5 · 7:46 AM ET`.
- Never call `toLocaleString` / `toLocaleTimeString` directly in components for timestamps.
- **No per-component date helpers** (e.g. a local `fmtStamp`) — import `fmtDateTime`. This covers every full "as of" timestamp: column labels, source lines, tooltips, alerts. (Exceptions: a date-only display like `action_date`, or a compact intraday tag like the Signals `@ 4:00 PM` price time — neither is a full timestamp.)
- **Trading-date derivation from `leg_transactions.executed_at` uses `tradingDateET()`** (also in
  `@stw/shared`, next to `fmtDateTime`), never a hand-rolled UTC or ET cast. A naive
  `executed_at AT TIME ZONE 'America/New_York'` cast mis-assigns evening-ET events (mis-attributing them
  a day early or late depending on direction) — `tradingDateET()` handles this correctly, **and**
  special-cases an exact-midnight-UTC timestamp (a placeholder date-only entry with no real captured
  time) by reading its date directly rather than TZ-converting it, since converting would roll an
  already-correct date back to the previous day. See
  [`plans/integrity-guardrails-report.md`](plans/integrity-guardrails-report.md) Item 1 for the bug this
  prevents (found live: 36+ historical rows would have been silently corrupted by the naive approach).

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
  [`plans/commentary_vs_transaction_boundary_spec.md`](plans/commentary_vs_transaction_boundary_spec.md)):
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

---

## Design System

- **Font:** Barlow Condensed (700/800) for the **STW logo** in the header only; system sans-serif (`font-sans`) everywhere else including page headings and login
- **Logo:** STW mic + green arrow SVG
- **Default theme:** Dark. Toggle persists to `localStorage` (`stwTheme`); light
  theme applied via `[data-theme="light"]`. Never hardcode colors outside `:root` /
  `[data-theme="light"]` — always use CSS variables.

#### Color Variables (`:root`)
| Variable | Value | Usage |
|---|---|---|
| `--bg` | `#0a0a0a` | Page background |
| `--surface` | `#111111` | Cards, header |
| `--s2` | `#1a1a1a` | Secondary surfaces |
| `--border` | `#2a2a2a` | Borders |
| `--bsub` | `#1f1f1f` | Subtle dividers |
| `--text` | `#f0f0f0` | Primary text |
| `--t2` | `#a0a0a0` | Secondary text |
| `--t3` | `#525252` | Muted text |
| `--acc` | `#22c55e` | STW green |

#### Tier Colors
| Tier | Color | Meaning |
|---|---|---|
| `--c5` | `#22c55e` | Highest conviction |
| `--c4` | `#3b82f6` | High conviction |
| `--c3` | `#f59e0b` | Moderate |
| `--c2` | `#6b7280` | Waning interest |
| `--c1` | `#ef4444` | Concern |
| `--c0` | `#52525b` | Legacy |

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

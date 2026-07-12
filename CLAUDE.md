# STW Companion — Claude Code Guide

> **⚠️ START HERE — branch.** **`staging` is the active trunk** — all feature work happens here.
> **`staging` is ~66 commits ahead of `main`** (Week-2 + regime depth + Macro traffic-light + the IBKR
> sync rework below; check `git log --oneline origin/main..origin/staging | wc -l`). A `staging → main` PR
> is a separate, approval-gated production deploy; **do not open one without explicit host approval**, even
> if staging looks ready. **A promotion is PENDING** — nothing since the Week-1 batch (PR #87) is on prod,
> including all the IBKR sync work; the **nightly `ibkr-sync-cron` stays dormant until promotion** (Netlify
> fires scheduled fns only on the `main` deploy).
> **✅ WEEK 2 MERGED to `staging` (PR [#88](https://github.com/claudiachez/stw-companion/pull/88),
> 2026-07-10) — NOT yet on production (`main`).** What's on staging: **executions sync** (`user_executions`,
> migration 064 — Flex `<Trades>` ingestion via `ibkr-flex.ts`), **TCA v1** (`scripts/tca.mjs`, admin/CLI),
> **vol-targeted sizing** (`volTargetScalar` + `risk_config` cols, migration 065, display-only),
> **REGIME_EXIT audit trail** (`regime_exit_audit`, migration 066), **`docs/launch_gates.md`**, and My-Portfolio
> Overview polish (uniform KpiCard height + regime line moved out of the KPI card). No new env vars.
> **The Week-1 batch (regime-daily cron, per-user REGIME_EXIT + RegimeLight, admin Basket/Sector, Settings
> layout) is LIVE on production** (PR #87, merged 2026-07-09) — and the **`regime-daily` cron's first
> post-merge tick is CONFIRMED** (`run_log` `regime-daily` ok at 2026-07-09 23:05 UTC; a fresh 2026-07-09
> `regime_daily` row per IWM/SPY/QQQ). The FRED re-platform + GICS taxonomy is also live (PR #81).
> Migrations run to **070**, applied + verified on **both PROD and sandbox** (058 is PROD-only — sandbox has
> no `tiers`/`profiles` tables; known permanent gap). **068/069 = `market_holidays` + trading-day RPCs**,
> **070 = `risk_config.ibkr_nlv`** (live equity from the Flex NAV section). No migrations were authored the
> last session (IBKR sync rework was code-only).
> **Launch Gate 2 DB-layer multi-tenancy proof PASSED**
> on PROD (adversarial RLS test, two throwaway tenants; `ops_log` row 12) — see `docs/launch_gates.md`.
> **CCXI is now mapped → Industrials** in `ticker_sector_map` (verified 2026-07-10; the `TICKER_GICS`
> code-override idea stays dropped — the admin Sector dropdown is the sole sanctioned fix).
> **PROD `regime_daily` = 19,500 rows (IWM/SPY/QQQ, 2000-09-01 → present, `source=yahoo+fred`)** — the
> depth extension is DONE (PR #89, merged to `staging` 2026-07-10; the backfill wrote directly to PROD, so
> it is live regardless of promotion). **Sandbox still 0 rows** (dev-only; needs a sandbox service-role key).
> **PROD `user_executions` = 443 fills (Jan–Jul), ALL priced** — repaired 2026-07-12 via the new Flex-XML
> **import** (operator uploaded a YTD export with Trade Price ticked; refresh-mode backfilled the prices an
> earlier Trade-Price-less sync had left null). **`risk_config.ibkr_nlv` is still NULL** — the import is
> executions-only; it needs one **live Sync** to write NLV (the operator's live-sync attempts were hitting
> IBKR's 1001 rate-limit at handoff — let it cool, sync once). `app_config.ibkr_live_trading_enabled` = **`0`
> on both** (last confirmed 2026-07-05). **`FRED_API_KEY`** + **`FLASHALPHA_API_KEY`** (server-side, no
> `VITE_`) set on both sites incl. prod. If migrations stop short of 070 you are on a stale checkout, re-sync.
> **First commands every session:** `git fetch origin && git checkout staging && git pull --ff-only`.
> Sanity check: `supabase/migrations/` should go up to `070_risk_config_ibkr_nlv.sql`,
> `apps/web/netlify/_lib/flex-core.ts` and `scripts/tca.mjs` should exist, and `plans/` files are
> **date-prefixed** (`YYYYMMDD_<name>`) — if any is missing, you're on a stale checkout. Then **cut a
> feature branch** before making any change: `git checkout -b claude/<short-feature-name>`. **Never commit
> directly to `staging`** — work on the branch, push it, open a PR back to `staging` (host merges/approves).
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

## Current Status — IBKR subscriber-sync rework + filter expansion + risk-config audit (handoff 2026-07-12)

**All on `staging`, merged via PRs #109–#112, NONE on `main`.** Typecheck + 282 tests + 0 lint errors throughout. No migrations authored this session. Four threads:

- **Filter expansion (PRs #110):** every list surface (Stock Picks/Ticker Details, Trades, My Portfolio
  Positions) gained filters for the fields that were *displayed but not filterable* — **conviction band**,
  **trend structure** (9/21/200 bucket), **sector regime** (rotation standing), **GICS sector**; plus a
  "Sort: Conviction" on Trades. The My-Portfolio Overview "⚠ N with low / declining conviction" chip now
  jumps to **Positions** with the conviction filter pre-applied (was Tailing, which never showed it). New
  shared `matchConvictionBand` + `CONVICTION_BAND_OPTIONS` (`@stw/shared`, +6 tests). Regime/sector aren't
  on the `Holding` row (they come from `useTickerRegime` + `ticker_sector_map`), so predicates run at the
  page/call site, not shared `filters.ts`. **Standing rule added** (see Conventions).
- **IBKR subscriber-sync rework (PRs #111/#112):** the Flex query now generates over the API again once its
  **Period = "Last 7 Days"** (a large YTD query 1001'd the Web Service). Reworked around that:
  - **One shared pipeline** `apps/web/netlify/_lib/flex-core.ts` (fetch + parse + persist) used by 3 callers:
    `ibkr-flex.ts` (interactive), **`ibkr-sync-cron.ts`** (new nightly, 08:00 UTC Tue–Sat, all connected
    users — dormant until prod), **`ibkr-import.ts`** (new one-time XML upload for history backfill/repair).
  - **Field fixes:** **Trade Price** is the fill price; **Orig Trade Price** is used only when *positive*
    (it's frequently `"0"` — never store a $0 fill). **Cost Basis Money** falls back to `costBasisPrice ×
    qty × mult`. **NAV** section → `risk_config.ibkr_nlv`. **Change in NAV** `depositsWithdrawals` parsed
    (not yet persisted — for the pending drawdown rebuild).
  - **Missing-field warnings:** the parser flags a mis-ticked template (no Trade Price / no NAV / not
    Execution-level / no positions) → amber strip on Settings after a sync.
  - **Executions write modes:** sync = append-only (`ignoreDuplicates`); **import = refresh**
    (update-on-conflict) so re-importing *corrects* existing rows (backfills prices). Import is the
    sanctioned "repair history" path.
  - **Settings walkthrough** rewritten: the four Flex sections are lettered **a–d under step 3** (+ added
    **Change in NAV**), numbers/letters are literal rendered badges (the CSS reset was eating `<ol>`
    markers). Import block lives inside the IBKR connection section.
- **Operator data repaired:** PROD `user_executions` went 0 → **443 fills, all priced** via the import
  (see the banner). `ibkr_nlv` still null pending one live Sync.
- **Risk-config audit (no code):** reviewed the operator's `risk_config` for rule contradictions. The
  headline: the **drawdown ladder is firing on a phantom −60% drawdown** because `equity_peak` is stuck at
  the $100k placeholder (the trigger only ratchets up + tracks `account_equity`, never the corrected $40k).
  And a real finding from the NAV history: a ~$60k **withdrawal** on 2026-02-17 means a naive NLV
  high-water-mark peak would *still* misread it as a drawdown — so the drawdown fix needs **cash-flow
  adjustment** (the Change-in-NAV data), not just "peak tracks NLV". This is the next session's build (Next
  Steps #1). Also flagged: ladder gross-target vs regime double-RED gross-target are two unreconciled
  de-risking triggers; and the double-RED "trim to 70% OR gross to 30%" offers two ~40pp-apart options.

**⚠️ PENDING (host):** (1) one **live Sync** to populate `ibkr_nlv` (blocked at handoff by IBKR's 1001
rate-limit — cool down, sync once). (2) A `staging → main` promotion (approval-gated) — until then the
nightly cron never fires and none of this is on prod.

---

## Current Status — Macro traffic-light + GEX→FlashAlpha + Risk polish (handoff 2026-07-10)

**This session shipped the two host-requested Macro-tab threads plus a round of Macro/Risk UI polish —
four PRs, all merged to `staging` (#90–#93), NONE on `main`.** `staging` is **25 commits ahead of
`main`** (a `staging → main` promotion is separate + approval-gated — do not open without explicit host
approval). Typecheck clean · 260 tests · 0 lint errors throughout.

- **Macro (a) — trend direction surfaced (PR #90):** score-strip deltas are colored by sign with arrows
  (and show a muted `5D —` while history accrues); the Market Regime is now a `RegimeCard` — one plain
  card with **Current status** (left; `▲ +5 vs yesterday` trend chip replacing the old `→ Mixed` arrow)
  and a **9-day regime trajectory** of green/amber/red lamps (right-aligned; hover a lamp for a popover
  with that day's date · regime · score). Old `RegimeBanner` removed.
- **Macro (b) — GEX source Discord Graddox → FlashAlpha (PR #90):** full pipeline — `@stw/shared/utils/gex.ts`
  (+10 tests), migration **067** `gex_snapshots`, the `gex-snapshot` scheduled writer (web only, SPY,
  ~8:30am/4:30pm ET), `useGexExposure`, a rewritten `GexPositioningCard`, the regime composite GEX
  sleeve, and `macro-snapshot` persistence. See Conventions → Macro data sources for the durable rules.
- **Macro/Risk polish (PR #91):** trajectory placement + 9-slot padding; **empty Vol/VIX/Multiplier in
  the RegimeLight fixed** (`fetchLatestRegime` now picks the latest *complete* `regime_daily` row — FRED
  VIX lags a day); risk-summary de-duplicated (counts-only header vs the Gross exposure card); friendlier
  copy; **"Settings" hyperlinked**; **My-Portfolio Overview regime line moved above the KPI cards**.
- **Regime card v2 + Risk tooltips (PRs #92/#93):** the two-panel→final `RegimeCard` layout; new shared
  **`HelpToggle` primitive** (collapsible ⓘ "what/why/how" popover) added to the Risk page's Regime
  light / Gross exposure / Position / Option / Sector sections + admin Vol-targeting panel.

**⚠️ PENDING VERIFICATION (next session):** `gex_snapshots` was **0 rows** with **no `gex-snapshot`
`run_log` row** at handoff — the cron hadn't fired since deploy. Confirm it writes on its next tick
(check `run_log where run_type='gex-snapshot'`); if it errors, verify `FLASHALPHA_API_KEY` is on the
**web** site. **DEFERRED:** the AI recap's GEX grounding still cites Graddox — see Next Steps #1 +
`plans/20260710_gex_flashalpha_replatform.md`.

---

## Current Status — regime_daily depth extension DONE (handoff 2026-07-10)

**This session executed Week-2 Item 4 — the `regime_daily` depth extension — end to end. Merged to
`staging` via PR [#89](https://github.com/claudiachez/stw-companion/pull/89) (branch deleted). One code
change + a data backfill; no migration, no env var, no shared-package change.**

- **What shipped:** `regime-daily.ts` gained an alternate equity source `?source=yahoo` behind its ONE
  existing computation path — `yahooSeries()` pulls decades of daily bars from Yahoo Finance's chart API
  in one keyless call, mapped to the same `Bar` shape as `tdSeries()` and fed through the existing
  compute loop + `sbUpsertMany` **verbatim**. Rows tagged `source='yahoo+fred'`; FRED index fields
  pulled deep enough to align (`fredLimit` uncapped on the Yahoo path). **Engine stays frozen at 1.1.0 —
  only the SOURCE of the equity bars changed, never the regime math. The daily-cron path (default source
  = TwelveData) is untouched.**
- **Source deviation — Stooq → Yahoo (standing, now in `docs/feeds.md`).** The plan named **Stooq**, but
  Stooq has since deployed a **JavaScript proof-of-work anti-bot wall** a serverless `fetch()` can't
  clear (UA header + `.pl` domain both tried). **Yahoo Finance** is the substitute: free/keyless/deep/
  one-call, and — critically — its **unadjusted** close (`indicators.quote[].close`, NOT `adjclose`)
  matches TwelveData's basis **to the cent**, so the `on_conflict` merge over the existing 2020-present
  rows is a no-op. Verified against stored SPY rows before writing.
- **Executed against PROD** (`usmqbohcjcyszjxxvnqu`) via the esbuild-bundle harness (exact deploy
  artifact). **19,500 rows**, IWM/SPY/QQQ each **2000-09-01 → present**, all `source=yahoo+fred`
  (`run_log` id 75). **This is live on PROD regardless of promotion** — the backfill wrote to the PROD
  DB directly, not through a `main` deploy. Sandbox `regime_daily` still 0 (dev-only).
- **Acceptance — all pass:** 3 reconcile dates unchanged to the cent (751.71/366.65/468.53, trend
  GREEN/RED/GREEN); 2008-10-15 double-RED (trend RED + vol RED → `risk_multiplier` 0.0); 2013-05-01
  GREEN+GREEN (→ 1.0); `vol_state` honestly `UNKNOWN` for 2000-09-01→2007-12-03 (pre-VXVCLS inception),
  never guessed. **Minor/self-healing:** today's fresh bar can carry `vol_state UNKNOWN` if FRED's VIX3M
  hasn't posted yet — the daily cron overwrites it that night with the settled close.

---

## Current Status — Week 2 MERGED to staging (handoff 2026-07-10)

**Week 2 (`plans/20260709_integrity-guardrailsv2.md`) is MERGED to `staging` via PR
[#88](https://github.com/claudiachez/stw-companion/pull/88) — live on the staging sites, NOT yet on
production (`main`). Typecheck + 250 tests + lint all green.** What shipped:

- **Item 1 — Executions sync (DONE, code).** New `user_executions` table (migration **064**,
  append-only, idempotent on IBKR `ibExecID`, RLS per user like `user_positions`). `ibkr-flex.ts`
  now parses the optional `<Trades>` section alongside `<OpenPositions>` from the one Flex report and
  **upserts** executions (ignoreDuplicates) while positions stay delete-and-reinsert; exact fill
  instant parsed ET-wall-clock→UTC, raw string preserved. Sync result + Settings line show an
  executions count. **⚠️ TIME-SENSITIVE MANUAL ACTION (host, outside repo):** enable the **Trades**
  section on the operator's Flex template — its ~1-year lookback slides daily and pre-window history
  is unrecoverable. No fills flow until this is done.
- **Item 3 — Vol-targeted sizing (DONE, code, display-only).** Pure `volTargetScalar()` in
  `@stw/shared` (+10 tests); per-user `vol_target_pct`/`_cap`/`_floor` on `risk_config` (migration
  **065**); `VolTargetPanel` in the admin Risk panel beside the RegimeLight. Consumed by nothing
  (standing prohibition). Validation backtest labeled pending Item 4.
- **Item 0a — `docs/launch_gates.md` (DONE).** Blocking pre-first-external-user checklist
  (unvalidated-signal display decision; DB-layer multi-tenancy proof).
- **Item 0b — REGIME_EXIT audit trail (DONE, code).** Migration **066**: `regime_exit_audit` +
  SECURITY DEFINER trigger logs every change to the 3 `regime_*` fields (old/new/actor/ts).
  Visibility only.
- **Item 2 — TCA v1 (DONE, code).** `scripts/tca.mjs` — admin/CLI report joining `user_executions`
  to the host's `leg_transactions` (fill slippage · pre-registered pullback-waiting overlay · exit
  divergence). Runnable once executions data exists (Item 1 dependency).
- **Item 0c — provenance ALREADY recorded (verified, no action).** The Week-1 36-row stamping is
  already in `ops_log` (row 11, `affected_scope='36 leg_transactions rows'`, with prior value
  bare-midnight-UTC / new value 16:00 ET close / host-confirmed date / honest "assumed placeholder"
  caveat). Item 0c is satisfied — no new record needed.
- **Item 4 — regime_daily depth extension (DONE, PR #89, 2026-07-10).** `regime_daily` extended from
  4,203 rows (2020-12-08→) to **19,500 rows (IWM/SPY/QQQ, 2000-09-01→present)** on PROD, unblocking
  Item 3's vol-target backtest + Phase 0c. See the dedicated session subsection directly below.

**✅ MIGRATIONS 064/065/066 APPLIED + VERIFIED on BOTH PROD (`usmqbohcjcyszjxxvnqu`) + sandbox
(`uolabcgbnrkhzpwuvzlk`):** `user_executions` (24 cols, RLS on), `risk_config` vol_target defaults
(15/1.5/0.3, backfilled onto the operator's row), `regime_exit_audit` + trigger (functionally tested —
real change logs, no-op skips, `changed_by` null for service-role writes; test rows cleaned up).

**Also verified this session:** (a) **Launch Gate 2 DB-layer multi-tenancy proof PASSED** on PROD —
adversarial RLS test with two throwaway tenants across `user_executions`/`risk_config`/`user_positions`/
`regime_exit_audit`/`risk_violation_acks`: read+write isolation, forged inserts rejected by `WITH CHECK`,
audit table insert-locked to the trigger; all test data cascade-deleted (`ops_log` row 12; boxes checked
in `docs/launch_gates.md`). (b) **`regime-daily` cron confirmed** (`run_log` ok 2026-07-09 23:05 UTC).
(c) **CCXI → Industrials** confirmed mapped. Plus UI polish (uniform KpiCard height + regime line moved
out of the Overview KPI card) and the Settings connect-walkthrough now covers the Flex Trades section.

**⚠️ TIME-SENSITIVE + DEPLOY-GATED (host):** `user_executions` stays 0 until BOTH (1) the operator enables
the Flex **Trades** section (manual, outside repo — its ~1-year lookback slides daily, pre-window history
unrecoverable) AND (2) the executions code reaches the site the operator syncs against. It's on `staging`
now; the operator's live sync hits whichever site their app points at — confirm that's the staging web
site, or promote to `main`. Once both are true, a sync populates `user_executions` and TCA can run.

---

### Prior session — cleanup + cloud-routines assessment; Week 2 plan ready (handoff 2026-07-09)

**This was a short, no-code session — cleanup, an assessment, and staging the next block of work.
No app/package/migration changes; the only repo edits are docs (this CLAUDE.md + a one-line CCXI
correction in the Week-1 report + the new Week-2 plan doc).** What happened:

1. **Cleanup.** Deleted the 5 merged local feature branches (PRs #82–#86, remotes already gone) — only
   `staging` remains locally. **Dropped the CCXI `TICKER_GICS` code-override task** (no task chip/cron
   ever existed for it — it was a TODO in the docs); the admin editor Sector dropdown is now the sole
   sanctioned fix. CCXI is still `unevaluated` (a data write, not a code task — do it via the dropdown).
2. **Assessed cloud/off-machine routines** (host question, no build). Finding: ~90% of the platform is
   already cloud (both Netlify apps + all scheduled functions + Supabase). The one machine-bound piece
   is the **Discord ingestion** (`stw-*` routines at `~/Documents/Claude/Scheduled/`, out-of-repo): they
   read Discord via **Claude in Chrome using the operator's own logged-in browser session** (member, not
   admin, not a bot) and write Supabase via `curl` REST (that half is cloud-portable). Because the
   operator is a channel *member* not the server *owner*, there's no clean bot path. Options ranked:
   (a) host-provided official feed (bot/webhook/export) — cleanest + ToS-safe, needs the STW owner's
   cooperation; (b) always-on cloud VM running the same real-browser setup — the only self-serve route,
   costs a monthly VM + session upkeep; (c) headless self-bot with the operator's Discord token —
   **DO NOT** (Discord ToS violation, account-ban risk kills the whole product). Host chose "just the
   assessment for now" — parked, no decision taken. (Aligns with the v2 plan's DEAD list: "custom
   Discord API client" is dead.)
3. **Week-1 (integrity guardrails) is COMPLETE; the Week-2 → Autonomy plan is written and is the next
   work.** New standing plan doc: [`plans/20260709_integrity-guardrailsv2.md`](plans/20260709_integrity-guardrailsv2.md)
   — Week 2 is paste-ready; weeks 3–4 + the trigger-driven back half are specced. **Next session starts
   Week 2** (see Next Steps #1). No work started on it this session.

**PR #87 (`staging → main`) MERGED mid-session (2026-07-09 11:59 UTC)** — Week-1 work is now on
production. staging is back to ~1 commit ahead of main (this doc-only handoff). **Post-deploy
verification is now the pending item** (regime-daily cron first tick + in-browser spot-checks — see
Next Steps #0).

---

### Prior session — regime engine scheduled + per-user REGIME_EXIT (Week 1, 2026-07-08)

**All on `staging`, merged via PRs #82–#86, and bundled into the OPEN production-promotion PR #87
(`staging → main`, pending merge).** Four things:

1. **Verified the prior PR #81 promotion live on production** (`macro-snapshot-2.0.0` wrote real
   FRED scores at 21:32 UTC → `FRED_API_KEY` confirmed on the prod context; `sector-map-sync` fired +
   instrumented). *(Not re-confirmed in-browser: the Macro tab / per-ticker regime badge — needs the
   OAuth password-swap recipe.)*
2. **Scheduled + backfilled the advisory regime engine** (integrity-guardrails item 3). Wrapped
   `regime-daily.ts` with `schedule('0 23 * * 1-5', …)` (**PR #82**, merged). Backfilled `regime_daily`
   on **PROD to 4,200 rows** (IWM/SPY/QQQ, 2020-12 → present) via the **esbuild-bundled handler** run
   locally (exact deploy artifact — see Conventions → Netlify Functions). All four `regimeGate` cells
   spot-checked against real dates. **Sandbox `regime_daily` still empty** (dev-only). **The cron only
   FIRES once #87 promotes to `main`.**
3. **Turned REGIME_EXIT into a per-user, Settings-configurable rule** (host decision — see Decisions
   locked below) — **PR #83**. Migration **063** (`risk_config` += `regime_trim_to_pct` 70 /
   `regime_stop_pct` 5 / `regime_doublered_gross_pct` 30, applied PROD + sandbox). Pure
   `regimeExitAdvice(gate, rule)` in `@stw/shared`; a section in `RiskConfigForm` (Settings, Premium to
   edit); and the **`RegimeLight` is now actually mounted** (was exported-but-unmounted) on My Portfolio
   → Risk (all portfolio users) + the admin Limits tab, showing the viewer's own rule when RED.
4. **Admin editor + Settings polish** — **PR #84**: Ticker-detail editor "Category" → **"Basket"** + a
   **Sector dropdown** writing `ticker_sector_map` (the manual escape hatch for tickers `sector-map-sync`
   can't resolve, e.g. CCXI/SPACs). **PRs #85/#86**: `RiskConfigForm` compact inline fields + removed the
   confusing account-equity peak text + one aligned input column (the `rowPrefix` fixed-slot convention).

Full completion record + all deviations from the original 7-item plan:
[`plans/20260708_integrity-guardrails-report.md`](plans/20260708_integrity-guardrails-report.md).

---

### Prior handoff — Data-feeds re-platform (FRED) + GICS sector taxonomy (2026-07-10, now LIVE)

**Now on production** (was staging-only at the 2026-07-10 handoff; promoted via PR #81 on 2026-07-08).
Merged over prior sessions: **PR #78** (feeds re-platform + Macro UI), **PR #79** (GICS taxonomy + sync),
**PR #80** (docs refresh). Migrations **061 + 062 applied to PROD + sandbox** (verified). The detailed
inventory + rationale live in [`plans/20260707_data_feeds_inventory_and_plan.md`](plans/20260707_data_feeds_inventory_and_plan.md).

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
- **Module 8 GEX / Positioning** (`GexPositioningCard.tsx`) — **FlashAlpha SPY gamma** (gamma flip · call wall · put wall · net GEX) + positioning read (as of 2026-07-10, PR #90; replaced the Discord Graddox signal). Feeds the regime composite's GEX sleeve.
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

**Decisions locked — REGIME_EXIT is a per-user rule, not a signed document (host 2026-07-08):**
- The advisory de-risking policy (integrity-guardrails Item 4) is a **per-user setting**, not the
  single operator-owned `docs/regime_exit_v0.md` the original spec described. Values live on
  `risk_config` (migration 063): `regime_trim_to_pct` (default **70**), `regime_stop_pct` (**5**),
  `regime_doublered_gross_pct` (**30**) — same seed-a-placeholder-default pattern as the other
  `risk_config` fields. Edited in **Settings** (`RiskConfigForm`, Premium-gated to edit); **displayed to
  all portfolio users** (defaults until overridden). The operator-only governance the spec named
  ("version bump required, no change mid-drawdown") is **dropped** for the per-user model.
- **Advisory / display-only — never enforced** (the standing regime prohibition). One source of truth:
  `regimeExitAdvice(gate, rule)` in `@stw/shared` — single-RED → trim/stop text, double-RED →
  reduce-gross text, GREEN/UNKNOWN → nothing. Used by the RegimeLight, the My-Portfolio Overview regime
  line, and the position detail pane; don't re-derive the text per surface.
- **The RegimeLight is presentational** — the mount site gates visibility (My Portfolio → Risk for
  subscribers, admin Limits tab for the operator), NOT a hard `isAdmin` return inside the component.
  It belongs with the *live* risk data (the Risk tab), never in Settings (same split as the limits
  engine: Settings = config, the data page = live evaluation).

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

**★ NEXT TASK — cash-flow-adjusted drawdown-ladder rebuild (host-agreed for the next session).**
The drawdown ladder is currently broken: it reads a phantom **−60%** drawdown because `equity_peak`
is stuck at the $100k placeholder (`fn_risk_config_track_equity_peak` only ratchets UP and tracks
`account_equity`, never the corrected $40k). Naively switching the peak to a high-water-mark of
`ibkr_nlv` is **not enough** — the operator's NAV history shows a ~$60k **withdrawal** on 2026-02-17,
which a raw NLV peak would misread as a −60% loss. So the rebuild must compute drawdown **net of
external cash flows** using the **`<ChangeInNAV>` `depositsWithdrawals`** now parsed by `flex-core.ts`
(persist it — likely a new `risk_config` column or a small per-day table — then re-base the peak off
NLV-minus-cumulative-cashflows). Until real data exists, the ladder should **stay silent** rather than
show a phantom number. Read-first: `packages/shared/src/utils/limits.ts` (`drawdownLadderTarget`),
`packages/ui/src/features/limits/ViolationsSummary.tsx` (computes `drawdownPct` from
`(accountEquity − equity_peak)/equity_peak`), `apps/web/netlify/_lib/flex-core.ts` (already parses
`depositsWithdrawals`), and migration `059_risk_config_account_equity.sql` (the peak trigger). This is a
**migration + trigger + logic** change. Also open from the same audit (lower priority): the ladder
gross-target vs regime double-RED gross-target are two unreconciled de-risking triggers (consider a
"binding constraint = the lower one" flag on the Risk tab); and the double-RED advice offers a "trim to
70% OR gross to 30%" pair that's ~40pp apart (make the trim fallback proportional or drop it).

**PENDING (host actions, not code):** (a) run **one live Sync** to populate `risk_config.ibkr_nlv`
(was blocked by IBKR's 1001 rate-limit at handoff — let the query cool, then sync once; a large/edited
query also 1001s, so keep Period = Last 7 Days). (b) A **`staging → main` promotion** is approval-gated
and pending — the nightly `ibkr-sync-cron` cannot fire until it lands on prod.

0. **✅ WEEK-2 ITEM 4 — `regime_daily` depth extension DONE (PR #89, 2026-07-10).** PROD `regime_daily`
   is now **19,500 rows, IWM/SPY/QQQ 2000-09-01→present** (`source=yahoo+fred`) — see the Current Status
   subsection at the top. **Newly unblocked:** Item 3's **vol-target validation backtest** (the
   `VolTargetPanel` still labels it "pending the regime history depth extension" — that label can now be
   flipped and the backtest run against the deep history) and **Phase 0c**'s composite-vs-gate backtest.
   The regime history now spans dot-com / GFC 2008 / 2011 / 2018 / COVID. `plans/20260709_regime_daily_depth_extension.md`
   carries the DONE status + the Stooq→Yahoo deviation note.

1. **★ MACRO TAB improvements — the two host-requested threads are DONE (PRs #90–#93, on `staging`).**
   What shipped: **(a)** the 5D trend engine is now surfaced — colored score-strip deltas, a Regime
   trend chip (`▲ +5 vs yesterday`), and the 9-day regime trajectory lamps in the new `RegimeCard`
   (`packages/ui/src/features/macro/components/RegimeCard.tsx` + `RegimeTrajectory.tsx`). **(b)** the GEX
   module moved off Discord Graddox onto **FlashAlpha** (see Conventions → Macro data sources).
   **Two follow-ons remain:**
   - **Verify the FlashAlpha GEX pipeline actually produces data.** `gex_snapshots` was **0 rows** and
     had **no `gex-snapshot` `run_log` row** at handoff — the cron (`30 12,20 * * 1-5` UTC) hadn't fired
     since deploy. Next session: query `run_log where run_type='gex-snapshot'` and `gex_snapshots`; if
     still empty/erroring, confirm **`FLASHALPHA_API_KEY` is on the WEB Netlify site** (host says it's on
     both sites — verify the web one specifically), then check the writer's error summary. Once a row
     lands, spot-check the GEX card + the regime GEX sleeve in-browser.
   - **Recap GEX grounding still cites Graddox (deferred).** `recap-core.ts` (scheduled AM/PM),
     `macro-recap.ts` (manual), and the shared `MacroRecapRequest` type still ground the AI recap's GEX
     block on the Graddox `signals` row, not FlashAlpha. Runtime-JSON-coupled + unverifiable without a
     live key, so it was split out. Plan + exact touch points: `plans/20260710_gex_flashalpha_replatform.md`.
   - **Standing prohibitions** (carry through every block): regime multiplier stays advisory/display-only
     until Phase B; the two-component gate and the Macro composite never blend; gate params frozen at
     `engine_version 1.1.0`; no new regime indicators enter the *gate*. See `plans/20260709_integrity-guardrailsv2.md`.
   - **Also newly unblocked:** wiring the score-strip 5D deltas + trajectory fully populate once
     `macro_daily_snapshots` has ≥~6/9 rows (only 4 at handoff: Jul 6–9). No action — accrues one row/weekday.

2. **Production promotion + executions verification (host-gated).** Week 2 is on `staging`, NOT `main`.
   A `staging → main` PR is **approval-gated — do not open without explicit host approval.** Once Week 2
   deploys to whichever site the operator syncs against AND the Flex **Trades** section is enabled,
   re-run a sync and verify `user_executions` (full-lookback lands, zero dupes on re-run, one fill vs the
   IBKR statement), then run `node scripts/tca.mjs --user-id=<operator> --json` for the first TCA report.

3. **Loose ends (small, only if asked):**
   - **CCXI sector — DONE** (mapped → Industrials in `ticker_sector_map`, verified 2026-07-10).
   - **Sandbox `regime_daily`** (optional, dev-only) — still 0 rows; needs a sandbox service-role key.
   - **Launch Gate 2 app-layer proof** — the DB-layer RLS proof passed; the end-to-end app-layer proof (a
     real second login exercising the Netlify functions' JWT path) remains for onboarding. See `docs/launch_gates.md`.
   - **Off-machine routines** (parked, host said "just the assessment for now" 2026-07-09): the Discord
     ingestion is the one machine-bound piece (Claude in Chrome + operator's own Discord session). No
     clean bot path (operator is a member, not the server owner). Self-serve route = always-on cloud VM;
     cleanest = a host-provided official feed. **Headless self-bot with the operator's token is off the
     table** (Discord ToS / account-ban risk). Don't start without a host decision.

3. **Visually confirm the regime badge + FRED Macro tab + RegimeLight in-browser** (not re-checked —
   needs the admin OAuth password-swap recipe below). Server-side FRED path is proven; if a cell is
   blank after a full cycle, check the `fred` proxy / `FRED_API_KEY` before assuming a deeper bug.

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

6. **✅ RESOLVED — `macro_daily_snapshots` PROD writer is now the good build.** The pre-instrumentation
   build described in prior handoffs is gone; after PR #81, the 2026-07-08 21:32 UTC run wrote a row
   with `engine_version = macro-snapshot-2.0.0`, non-null trend/vol/credit, and a `run_log` `ok` row.
   The 5D engine (`useMacroTrendHistory`) is now backed by real scores going forward (deltas legitimately
   null until ≥~6 fresh rows accrue).

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
  `user_positions`, `user_executions`, `holding_transactions`, `conviction_comments`, plus the
  event-sourced `legs` / `leg_transactions`, `categories`, `traders`, `app_config`, `risk_config`,
  `regime_exit_audit`, `regime_daily`, `ticker_sector_map`, `ops_log`.
  RLS on `holdings`/`signals` restricts writes to `cc@claudiachez.com`. `user_positions`,
  `user_executions`, `risk_config`, and `regime_exit_audit` use user-owned RLS — each subscriber reads
  (and, where applicable, writes) only their own rows. **DB-layer multi-tenancy across these was proven
  on PROD 2026-07-10** (adversarial RLS test; `ops_log` row 12; `docs/launch_gates.md`).
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
| `signals` | **morning routine** (Graddox step) | GEX signal bias + levels — powers the **Signals tab** (the Macro GEX module moved to FlashAlpha 2026-07-10) |
| `gex_snapshots` | **`gex-snapshot`** Netlify scheduled fn (web, ~8:30am/4:30pm ET) | SPY gamma from FlashAlpha (flip · call/put walls · net GEX · sleeve score); read by `useGexExposure` (Macro GEX module) + `macro-snapshot`. Migration 067; RLS read-only for authenticated |
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
**One shared pipeline** — `apps/web/netlify/_lib/flex-core.ts` (`fetchFlexReport` two-step Web Service
call → `parseFlexReport` → `persistFlexResult`) — used by **three callers; never fork it**:
- **`ibkr-flex.ts`** — interactive per-user sync (browser sends its Supabase JWT → function verifies,
  reads `ibkr_flex_token` + `ibkr_query_id` from `profiles` via service key, calls IBKR; the raw token
  never reaches the browser). Short poll budget (Netlify 10s limit).
- **`ibkr-sync-cron.ts`** — scheduled (08:00 UTC Tue–Sat), syncs **every connected user** so fills stay
  complete even if the user never opens the app. **Only fires on the prod (`main`) deploy** (Netlify
  scheduled-fn rule) — dormant on staging.
- **`ibkr-import.ts`** — JWT-auth one-time **XML upload** (the user exports a long-period report from the
  IBKR portal, which builds big reports the Web Service refuses). Executions-only; backfills / **repairs**
  history the short live window can't reach.

**The one Activity Flex report carries up to FOUR sections, persisted with different semantics:**
- `<OpenPositions>` → `user_positions` — **mutable snapshot**, delete-all-then-insert every sync.
- `<Trades>` → `user_executions` — **append-only log**, upsert on `(user_id, ibkr_exec_id)`. **Write mode
  matters:** the sync uses `append` (`ignoreDuplicates` — a seen fill is never re-touched); the **import
  uses `refresh`** (update-on-conflict) so re-importing an authoritative export *corrects* existing rows
  (e.g. backfills a price an older Trade-Price-less sync stored null). Fill instant ET-wall-clock→UTC, raw
  string kept (`exec_datetime_raw`). Consumed by TCA (`scripts/tca.mjs`).
- `<EquitySummaryInBase>` latest `total` → `risk_config.ibkr_nlv` (live equity; the "one value, one
  source" denominator). Written by the **sync**, NOT the import.
- `<ChangeInNAV>` `depositsWithdrawals` → **parsed but not yet persisted** — reserved for the pending
  cash-flow-adjusted drawdown rebuild (Next Steps #1).

**Field rules (in `flex-core.ts`):** **Trade Price** is the fill price; **Orig Trade Price** is a lookalike
that's frequently `"0"`, so it's a last resort used **only when positive** — never store a $0 fill.
**Cost Basis Money** falls back to `costBasisPrice × qty × multiplier`. `parseFlexReport` returns a
**`warnings[]`** of mis-ticked-template gaps (no Trade Price / no NAV section / Trades not at Execution
LOD / no Open Positions), surfaced as an amber strip on Settings after a sync.

**Recommended subscriber query = Activity Flex, Period "Last 7 Days"** — a large YTD query makes the Web
Service return `1001 "could not be generated"` (it also throttles a query hard when hit repeatedly). Short
window + daily cron + append-only = no fill ever dropped; full history comes from the import. The
`SettingsPage.tsx` `CONNECT_STEPS` walkthrough documents the exact fields + lookalike traps (IB vs External
Execution ID; Trade Price vs Orig; Currency vs IB Commission Currency) and the General-Config defaults the
parser depends on (yyyyMMdd/HHmmss, Breakout by Day = No).

`flex-core.ts` uses **supabase-js with the `ws` Realtime-transport shim** (a sanctioned exception to the
"no supabase-js in functions" convention below — the delete/insert/upsert flows are cleaner with the
client, and the shim avoids the import-time WebSocket crash). Env vars (web site): `VITE_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`.

These three IBKR pipelines are independent (admin proxy prices/trades STW's own account; the subscriber
functions only ever read a subscriber's own account). Do not conflate them.

---

## Conventions

### Netlify Functions
- **Anthropic:** use **direct `fetch()` to `https://api.anthropic.com/v1/messages`** — do NOT import `@anthropic-ai/sdk` (ESM/CJS bundling issues in the Netlify Node runtime → 502s). Pass `x-api-key`, `anthropic-version: 2023-06-01`, JSON body. See `apps/web/netlify/functions/macro-recap.ts`.
- **Supabase — NO `@supabase/supabase-js` in Netlify Functions.** `createClient` from supabase-js 2.100+ throws on Node 20 because the Realtime client tries to open a WebSocket at import time and crashes the function. Use **direct REST `fetch()`** for all Supabase reads/writes in functions — `GET /rest/v1/<table>?...` with `apikey` + `Authorization: Bearer <key>` headers. See `apps/web/netlify/_lib/recap-core.ts` for the pattern. This replaces the old guidance about `createClient` options.
- **Env var whitespace:** always call `.trim()` on env vars read in functions — pasted keys/URLs sometimes carry a trailing newline that causes "Invalid API key" from Supabase even when the value looks correct in the Netlify UI.
- **Both web and admin deploy functions.** Both `apps/web/netlify/functions/` and `apps/admin/netlify/functions/` are deployed by their respective Netlify sites. Functions that must work on both sites (e.g. `macro-recap.ts`) need a copy in each app — Netlify functions are site-scoped, not cross-domain callable.
- **Scheduled functions are cron-only over HTTP, and fire ONLY on the prod (`main`) deploy.** Once a function is wrapped with `schedule('<cron>', handlerImpl)` (the repo's pattern — `macro-snapshot`, `sector-map-sync`, `regime-daily`, `ibkr-sync-cron`; `schedule` is an *identity* pass-through at runtime, so `handler === handlerImpl`), Netlify **no longer serves it over public HTTP** and **only runs its cron on the site's production (`main`) deploy — never on branch/`staging` deploys**. So a newly-added scheduled writer stays dormant until a `staging → main` promotion, even though its code is on staging. The UI "Run now" button sends no querystring, so it can only trigger the default (no-param) path. The UI "Run now" button sends no querystring, so it can only trigger the default (no-param) path. A function that ALSO has a param-driven mode (e.g. `regime-daily`'s `?backfill=1&days=N&before=`) can't reach that mode via the deployed URL — run it via `netlify functions:invoke --name <fn> --querystring "…"` against Netlify Dev, **or** the local esbuild-bundle harness below.
- **Running/backfilling a function locally with no site URL (the zero-drift way).** To execute a function's real code from this environment (e.g. the `regime_daily` PROD backfill): esbuild-**bundle** the handler exactly like Netlify does — `./node_modules/.pnpm/node_modules/.bin/esbuild <fn>.ts --bundle --platform=node --target=node20 --format=cjs --outfile=bundle.cjs` (inlines `@stw/shared` — this is the deploy artifact, no logic drift) — then a tiny CJS runner sets env from `apps/web/.env.local` + `apps/web/.env` (TwelveData key lives in `.env`, empty in `.env.local`) + the prod service-role key file, and calls `require('./bundle.cjs').handler({ queryStringParameters: {…} })`. **Do NOT use `tsx` to import the handler directly** — tsx's per-file transpile can't statically link `@stw/shared`'s `export *` barrel (a static `import { FRED_SERIES }` fails with "does not provide an export named" even though dynamic `import()` sees it); the esbuild bundle sidesteps it entirely.

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
- **FlashAlpha** (`FLASHALPHA_API_KEY`, server-side, no `VITE_`): the Macro GEX / Positioning module's
  source (net GEX · gamma flip · call/put walls) — `GET https://lab.flashalpha.com/v1/exposure/gex/SPY`
  with an `X-Api-Key` header. **Free tier = 5 requests/DAY, SPY-only, single expiry** (nearest Friday;
  full chain needs the Growth plan). Because 5/day rules out any per-browser proxy, the **`gex-snapshot`
  scheduled Netlify fn (web only, ~8:30am/4:30pm ET) is the ONLY caller** → derives levels via
  `deriveGexLevels`/`gexSleeveScore` (`@stw/shared/utils/gex.ts`) → upserts `gex_snapshots` (migration
  067); every client + `macro-snapshot.ts` read that table, never FlashAlpha. **GEX sleeve score =
  spot-vs-gamma-flip cushion × `GEX_SLEEVE_SLOPE` (20; host-signed-off 2026-07-10)** — feeds the Macro
  **composite** only, never the frozen regime **gate** (engine 1.1.0). A paid key later unlocks real SPX
  with no code change. (The Discord Graddox `signals` row still powers the separate **Signals tab** —
  only the Macro GEX module moved.)
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
  Supabase-backed (not localStorage). The **v2.0.0 writer (FRED indices + HY-OAS + paced equity) is LIVE
  on production** (verified 2026-07-08: a fresh row carries `engine_version = macro-snapshot-2.0.0` +
  real trend/vol/credit scores + a `run_log` row). Deltas are legitimately null until ≥~6 fresh rows accrue.
- **Sector Rotation** (Module 11): per-sector radar cards + constituent chips, fetched via
  `fetchClosesChunked` (TwelveData, paced).
- **`regime_daily` reads pick the latest COMPLETE row, not the newest** (`fetchLatestRegime`,
  `useLatestRegime` — powers the My-Portfolio Risk-tab RegimeLight + admin VolTargetPanel). FRED
  publishes VIX/VIX3M with a ~1-day lag, so the *current* day's `regime_daily` row lands with price +
  rv20 but null `vix_close`/`vix3m_close`; querying the raw newest row blanked Vol / Multiplier / VIX /
  VIX3M. The query filters `vix_close`/`vix3m_close` not-null so it shows the latest full reading (fixed
  2026-07-10). Apply the same "latest complete row" instinct to any panel that needs the vol inputs.

### One value, one source — no conflicting numbers, anywhere (host 2026-07-11)
Once a metric's source is decided, that source is authoritative **everywhere it appears** —
never a second pipeline for the same number, not even on a different page. Two blocks or two
tabs must never display different values for the same underlying quantity. Decided sources so far:
**account equity = IBKR NLV** (`risk_config.ibkr_nlv`, the Flex NAV sync; falls back to
`account_equity` only pre-NAV) · **Macro GEX = SPX Gamma Edge** (`gex_snapshots`) · **live equity
quotes = Finnhub via the `priceCache` store** · **the regime GATE = `regime_daily`** (frozen engine)
while the finer index **structure = live TwelveData** (`useTickerRegime`) — the RegimeLight shows a
single close (the live structure), never both. When two surfaces need the same value, route them
through the one decided source; when consolidating, drop the duplicate rather than reconcile two
numbers. (Known open item: the Signals tab's "Current Price" is the Graddox report spot while the
Macro GEX card's Spot is a live SPY×10 quote — two different SPX reads; unify if it surfaces.)

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
  `sector-map-sync` scheduled fn. For a ticker it can't resolve (no Finnhub industry — e.g. a SPAC
  shell like CCXI), the **admin Ticker-detail editor's Sector dropdown** sets it directly (writes
  `ticker_sector_map`, admin-write RLS) — the preferred manual fix. A `TICKER_GICS` code override is
  the alternative, for a mis-folded name or a permanent non-equity holding (ETF/Cash).
- **"Basket" (thematic grouping, `categories`/`category_id`) and "Sector" (market/GICS,
  `ticker_sector_map`) are distinct** and both user-facing. "Basket" is the canonical UI label
  everywhere (filter bars, editor, heatmap "By Basket") — never "Category" in visible text (the DB
  column stays `category_id`; `Badge kind="category"` is an internal prop, not shown).
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
- **When the data model gains a user-facing field, update the filters + sort options too (host 2026-07-11).**
  A field that's *displayed* on a list surface (trend structure, sector regime, sector, conviction, …) but can't be
  *filtered or sorted* by is an incomplete feature — the list surfaces (Stock Picks / Ticker Details, Trades, My
  Portfolio) exist to let the user slice their book by exactly these axes. So every time a new field lands on a row,
  in the same change (or an immediate follow-up) add its filter control (and a sort key where an ordering makes
  sense) to each surface that shows it, in the canonical order above. Filter state that regime/technical fields need
  lives in the per-ticker `regimes` map (`useTickerRegime`), not on the `Holding`/leg row, so the predicate is
  applied at the page/call site (My Portfolio `matchFilters`, Picks post-`applyFilters`), not in the shared
  `filters.ts`. When a chosen band's data is still loading/unknown for a ticker, exclude that row (it isn't a
  confirmed match) rather than showing it. Treat "did I update the filters?" as part of the definition of done for
  any data-model expansion.
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
  **A KPI row is one uniform strip: all cards are equal height** — `KpiCard` fills its (stretched)
  flex/grid cell via `height:100%`, so a card without a delta line matches its siblings. **Never hang
  an extra line (a regime note, a caption) off the bottom of a single KPI card** — it distorts that
  card's height and reads as out of place; put such a line in its own full-width strip **above** the
  KPI row (the My-Portfolio Overview regime line is the reference: its own strip with a state-colored
  dot, sitting above the cards — host moved it above 2026-07-10 — not crammed into the Equity/Options card).
- **When body copy names another page, link it** (host 2026-07-10). Any prose that references a
  destination ("set in Settings", "under Settings → thresholds") renders that name as a real hyperlink,
  not plain text. For a shared component that renders in more than one app, thread the destination in
  via a prop (e.g. `ViolationsSummary`'s `settingsTo`) and fall back to plain text when the host app
  has no such route (admin has `/config`, not `/settings`) — don't hardcode a route that only exists in
  one app.
- **Hover-detail uses a real popover, never the native `title` attribute** (host 2026-07-10). The
  browser's `title` shows an ugly `?`/help cursor and delayed, unstyled text; use a small custom
  tooltip (state-driven, absolutely positioned, `pointer-events:none`) anchored so it can't overflow
  its card — see `RegimeTrajectory`'s lamp tooltip. Also never park per-item detail in a *persistent*
  caption line that repeats what's already on screen or resizes on hover (both were bugs fixed here).
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
  `DataTable`, `HelpToggle`. Reach for one of these before writing a new inline-styled control.
  `HelpToggle` (added 2026-07-10) is the shared collapsible **ⓘ "what / why / how"** popover — the
  same help pattern the Macro modules use (`macroVisuals`' `ModuleHeader`), promoted to a primitive so
  any surface (e.g. the Risk page) reuses it without importing across features. Author its content with
  block **spans** (`<span className="block">…</span>`), not `<div>` — the popover is a span.

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

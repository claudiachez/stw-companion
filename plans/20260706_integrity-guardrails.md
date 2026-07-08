# Week 1 Build Request: Integrity Batch + Risk Guardrails + Advisory Regime Light

**Paste into a new Claude Code session against the STW Companion repo. Self-contained; assumes no prior conversation context.**
**Prepared:** 2026-07-05 · v1.0
**Branch:** `claude/week1-integrity-guardrails` off `staging` (never commit directly to staging, per repo rules).
**Attribution rule:** use generic role labels (Dev, Ops, Lead) in all docs, comments, and commit message prose. Never attribute work to named individuals (human stakeholders). This does NOT apply to machine-readable tooling trailers — the standard `Co-Authored-By: Claude <noreply@anthropic.com>` commit trailer stays as normal; it is provenance metadata, not stakeholder attribution.

---

## Context (read fully before touching anything)

STW Companion is a pnpm monorepo (apps/web = paywalled subscriber app, apps/admin = host/operator app, packages/shared = pure functions, packages/ui = shared components). Supabase backend. The event-sourced core: `leg_transactions` is a hand-written diary (BUY/SELL events); `legs` is derived by a DB trigger (migration 040) replaying the diary; `holdings.current_weight` is the host's stated position total, PATCHed directly by ingestion routines and reset weekly by a Friday truth-up run. `user_positions` holds each user's own IBKR positions via manual Flex sync (delete-all-then-insert, open positions only, RLS-scoped per user).

This week ships seven items in strict order. Items 0 and 0.5 fix live, subscriber-visible defects. Items 1–2 are schema/config integrity and risk guardrails. Items 3–5 add an advisory market-regime layer (admin-only). Nothing in this week touches apps/web UI except via bug fixes 0 and 0.5.

**Two standing prohibitions for this session:**
- Nothing built this week enforces anything on trading. The regime light is display-only. The limits engine flags; it does not block.
- The regime gate (item 3) must NOT integrate with, read from, or write to the existing Macro Dashboard scoring (`packages/shared/src/utils/macro.ts`, `trendBucket()`, the 11-module composite). They are deliberately separate systems. Do not "unify" them.

---

## Item 0 — Fix the macro snapshot cron (FIRST: it is losing unrecoverable data daily)

**State:** `macro-snapshot.ts` (Netlify scheduled function, cron `30 21 * * 1-5`) is supposed to upsert daily scores into `macro_daily_snapshots` (migration 048; schema already has `module_scores` jsonb, `indicator_scores` jsonb, `event_risk` jsonb). A fix was attempted 2026-07-02. **The table has zero rows.** The 7/2 and 7/3 market closes passed uncaptured. Several modules (GEX, sentiment, event risk, AI recap) are ephemeral — days without capture are permanently unrecoverable.

**Tasks:**
1. Diagnose why the function produces no rows: is the schedule firing at all (Netlify function logs), is it throwing before upsert, is the upsert failing silently (RLS/service-role key), or is it writing to the wrong environment? Do not guess from code alone — check invocation logs first.
2. Fix, deploy, and verify one real row lands after the next weekday close. If verification can't happen inside this session, add a manual trigger path and run it once to prove the write path end to end.
3. **Instrumentation (mandatory, same standard as the Discord ingestion routines):** every invocation writes a `run_log` row — status ok/fail, rows written, error detail on failure. A scheduled job that can silently produce nothing for five days is unacceptable; that is exactly what happened.
4. Confirm the upsert populates per-module subscores and a scorer version identifier, not composite-only. If no scorer-version field exists, add one (jsonb key or column) — stored scores must be attributable to the code version that produced them.

**Acceptance:** ≥1 real row with populated subscores; `run_log` entries on both success and induced-failure test; no UI changes.

## Item 0.5 — Closed-weight invariant + correct eight corrupted rows (subscriber-visible bug)

**State:** eight holdings show `last_action = 'Closed'` with `current_weight > 0`: HII (7.5%), PLPC (4.5%), KTOS (4.5%), AMSC (4.0%), LUMN (4.0%), RDCM (3.5%), BLDP (3.0%), AMRC (2.0%). ~33 percentage points of phantom weight rendering in the subscriber-facing portfolio. These trace back to a 6/12 Friday truth-up that flagged 13 holdings absent from the weekly snapshot ("review, not auto-closed"); eight were subsequently marked Closed without zeroing weight.

**Tasks:**
1. Root-cause first, one query: do OTHER Closed holdings (closed via the normal live-notes path) carry zero weight? If yes → procedural defect confined to the manual flag-resolution path. If no → the close path itself never zeroes weight and every historical close is suspect; report the full count before correcting anything.
2. Correct the identified rows (`current_weight = 0`), each correction logged (see ops_log, item 1) with prior value preserved in the log entry.
3. Enforce the invariant structurally: `last_action = 'Closed'` (and `'Expired'`) ⇒ `current_weight = 0`. Preferred: a DB trigger or CHECK-equivalent guard that RAISES on violation — fail loud, never coalesce or auto-correct. Also patch the write path(s) that allowed it.
4. Verify apps/web renders correctly after correction — note the repo rule: a legitimately-zero value must display as zero, never blank.

**Acceptance:** zero rows violate the invariant; guard demonstrably raises on a test violation; corrections logged with before-values.

## Item 1 — Integrity migration (one additive migration + retroactive audit)

Single migration, additive only, nothing destructive. Components:

1. **`leg_transactions.weight` → NOT NULL.** PROD audit confirmed zero null rows exist, so this is safe. Rationale: the 040 trigger does `coalesce(weight, 0)` — a null-weight insert would silently corrupt derived `legs.weight` (understated BUY / spuriously closed trim). Today the only guard is parser behavior (flag-and-skip). The constraint makes the invariant structural before any second writer (historical reconstruction is planned) exists.
2. **`leg_transactions.weight_status`** text NULL: `stated | split_derived | resolved_late | assumed_split | zero_by_spec`. Historical rows stay NULL (= unknown provenance, honestly). Live routines populate going forward: host-stated → `stated`; 90:10 split-formula fallback → `split_derived`; EXPIRED/EXERCISED zero-weight convention → `zero_by_spec`.
3. **`leg_transactions.source`** text NOT NULL DEFAULT `'live'`: `live | snapshot_reconciled | backfill`. Backfill existing Friday-truth-up-inserted rows (identifiable by `notes` containing "reconciled from weekly snapshot") to `snapshot_reconciled`.
4. **`leg_transactions.date_precision`** text NOT NULL DEFAULT `'day'`: `day | week`.
5. **`ops_log` table:** structured operational events — planned routine pauses, known outages, manual data corrections, flag-resolution actions. Columns: timestamp range, event_type, affected_scope, detail, resolved boolean. Seed with the two known events: 2026-07-01 ingestion outage (Chrome extension disconnect, both runs, 0 messages) and the June daily-routine maintenance pause that caused the ARKK/TE/TENB reconciliation inserts. Rationale: flags currently live only in `run_log` free text — no queryable backlog exists, which is how eight corrupted holdings went unnoticed.
6. **Retroactive timestamp audit (script + corrections, runs after migration):** manual/corrective entries from Friday runs carry synthetic `executed_at` values with a midnight-UTC signature. Confirmed cases: ADEA rows from the 6/12 run (`2026-06-12 00:00:00+00` for actions taken 6/11); same pattern on CRNC, MITK, ARKK, RNG rows from the 6/18 run. Sweep: `executed_at::time AT TIME ZONE 'UTC' = '00:00:00'` as the detector. For each hit: resolve the true alert date from Discord (`from:stocktalkweekly $TICKER`) and correct `executed_at` with the fix logged in `ops_log`; if unresolvable, set `date_precision = 'week'`. 
7. **Date-convention documentation (constant + doc, enforced from now on):** all trading-date derivations use `executed_at AT TIME ZONE 'America/New_York'` cast to date. UTC date-casting mis-assigns evening-ET events to the next day. Add a shared helper in `packages/shared` (respect the existing `fmtDateTime` convention) so no consumer hand-rolls the cast.

**Acceptance:** migration applies cleanly to staging; constraint violation test raises; all `snapshot_reconciled` rows tagged; audit report of midnight-UTC hits with disposition per row; `ops_log` seeded.

## Item 2 — Limits engine (per-user-scoped from day one; flags, never blocks)

**Design intent:** this is being built for the operator's book now, but every subscriber has RLS-scoped `user_positions` via Flex sync — the engine must be structurally multi-tenant from the first commit. Hardcoding operator thresholds means a full retrofit later.

1. **Pure functions in `packages/shared`** (repo rule: shared logic lives there once, never forked): position concentration by underlying, sector concentration, gross exposure, and drawdown-ladder evaluation. All take positions + config as arguments; zero global reads.
2. **Underlying rollup:** options legs aggregate under their underlying (`underlying` column exists). Exposure convention v1: market value per leg (`quantity × mark_price × multiplier`), rolled up per underlying. Documented as v1 convention; delta-notional is explicitly out of scope this week.
3. **Sector mapping:** `user_positions` has no sector column. Static ticker→sector map (a table or config file, operator-editable in admin). ~26–35 tickers; do not build a data-feed integration for this.
4. **`risk_config` table**, RLS per-user rows: max single-position %, max sector %, max gross exposure %, drawdown ladder steps (equity-peak-relative thresholds → target gross %). Seed the operator's row with placeholder defaults (10% position / 25% sector / 100% gross / ladder −10%→70%, −15%→50%) clearly marked as placeholders — final values are an operator decision, not a dev decision.
5. **Sync-on-evaluate:** evaluation triggers the existing Flex sync first (reuse `useSyncPortfolio` / the `ibkr-flex` function path), then computes. No scheduled sync this week. Handle sync failure explicitly: evaluate against last-synced data with a visible staleness warning (timestamp shown), never silently.
6. **Violations are flags with state, not blocks:** each breach surfaces with severity and a `status` (new/acknowledged/glide-path). No grandfathering — day-one breaches are real violations; the operator sets a written glide path per violation (no adds to breaching names; reduce-to-compliance target date). Store acknowledgments.
7. **UI: apps/admin only this week.** A limits panel: current book rolled up, each limit with headroom/breach, staleness indicator, violation list with acknowledge action. Follow existing list+detail mobile-first patterns. No apps/web surface — capability-gate anything shared via `AppCapabilities`, never fork components.
8. **Data-domain note (important, easy to get wrong):** the limits engine reads `user_positions` (the user's own IBKR book) — NEVER `holdings.current_weight` (the host's stated portfolio). Those are different books.

**Acceptance:** operator's real book evaluates end to end with sync-on-evaluate; a second synthetic user's config produces independent results (multi-tenancy proven); pure functions unit-tested against a fixture book with known breaches.

## Item 3 — `regime_daily` + `regimeGate()` + advisory light (admin-only)

**Purpose:** a frozen, two-component market-regime rule, displayed as an advisory light. It is a pre-registered hypothesis under forward test — NOT a validated signal. It must not blend with the Macro Dashboard composite (see standing prohibitions).

1. **`regime_daily` table:** one row per trading day per tracked instrument. Instruments: IWM, SPY, QQQ (trend candidates), plus VIX, VIX3M, TNX stored as market-level fields per day. Per equity instrument: close, sma200, trend_state (close > 200-day SMA → GREEN else RED), roc_252d_positive boolean, sma200_slope_positive boolean (SMA today vs 20 days ago), rv20_annualized, rv20_percentile_2y (504-day window). Market-level per day: vix_close, vix3m_close, vix_ratio, vol_state (VIX < VIX3M → GREEN else RED), tnx_level, tnx_63d_change_positive. Plus `engine_version` on every row.
2. **Backfill:** daily bars back to ~2000 where available (VIX3M from its inception; HYG-era constraints are irrelevant here). Data source: prefer IBKR historical bars if credentials/plumbing are reachable from this repo's functions; otherwise a public daily-bar source with the source recorded per row. On any missing input for a day: write the row with state `UNKNOWN` — never interpolate, never skip silently.
3. **Daily append:** scheduled function after market close, instrumented in `run_log` exactly like item 0 (ok/fail/rows). Same failure standard: silent no-op is a defect.
4. **`regimeGate()` in `packages/shared`:** pure function `(trendRow, volFields) → { trend_state, vol_state, risk_multiplier }`. Ladder: GREEN+GREEN → 1.0; one RED → 0.5; RED+RED → 0.0. Parameters (200, 252, 20, 504, ladder values) in one frozen config object with `engine_version = '1.1.0'`; any change bumps the version. **Do not call into or reuse `trendBucket()` or anything in `macro.ts`** — verified: no reusable "close vs 200SMA" boolean primitive exists there, and the gate must stay frozen while Macro scorers evolve freely. Deliberate, documented duplication.
5. **Per-trader proxy:** add `traders.regime_proxy` (text) — STW → `IWM`, Graddox → per-signal underlying (store `underlying` as the value; consumers resolve per signal). New traders onboard by setting this column, zero code changes.
6. **Advisory light, apps/admin only:** today's trend_state (per STW's proxy IWM), vol_state, resulting multiplier, raw values (close vs SMA200, VIX vs VIX3M), and an explicit permanent label: "Advisory — under forward validation. Not a trade signal." Capability-gated (`isAdmin`); component lives in packages/ui unforked.

**Acceptance:** backfill row counts per instrument reported; spot-check three known dates (e.g., a 2022 double-RED day, a 2024 GREEN+GREEN day, an Aug-2024 vol-inversion day) against the rule by hand; daily append proven with one live run; `regimeGate()` unit tests cover all four ladder cells and UNKNOWN propagation.

## Item 4 — REGIME_EXIT v0 (a document, not code)

Create `docs/REGIME_EXIT_v0.md`: a one-rule advisory de-risking policy owned by the operator. Template with named blanks for the operator to fill and date: "When vol_state = RED: trim each open position to ___% of current size / tighten stops to ___. When double-RED: reduce gross to ___%." Include: version, date signed, and the rule that parameter changes require a version bump and may not occur mid-drawdown. No enforcement code, no UI beyond (optionally) linking the doc from the admin light panel.

## Item 5 — SKILL.md amendments (both ingestion instruction sets)

1. **Friday truth-up SKILL.md — the reconciliation cascade** (currently the routine improvises; it has backdated correctly three times by luck, not instruction): when inserting a reconciled leg, (i) search `from:stocktalkweekly $TICKER` bounded to the window since the prior snapshot; alert found → `executed_at` = alert timestamp, `date_precision='day'`; (ii) no alert found → snapshot date, `date_precision='week'`; (iii) in ALL cases `source='snapshot_reconciled'`. Free-text notes remain for humans; they are never the machine-readable marker.
2. **Daily-run SKILL.md — manual reconcile timestamps:** any manually entered/corrected transaction carries the host's ORIGINAL Discord message timestamp as `executed_at` (real time-of-day, ET-correct — never a bare date that serializes to midnight UTC), with the source message link in notes. This rule exists because the 6/12 and 6/18 manual corrections stamped synthetic midnight-UTC dates (see item 1.6).

## Out of scope this week (do not build, even if adjacent)

Historical snapshot reconstruction (queued next block); executions/Trades Flex sync (next block — but note to operator: enabling the Trades section on the IBKR Flex template is a 2-minute manual task outside this repo, time-sensitive); vol-targeted sizing; TCA; expectancy analyzer; any Phase 0 statistics; folklore/EMA study; composite-vs-gate backtest; any apps/web feature work; Wall St Engine; anything that enforces the regime multiplier on any order path.

## Definition of done

All seven items' acceptance criteria pass on staging; a `WEEK1_REPORT.md` summarizes: cron root cause, closed-weight root cause (systemic vs procedural), midnight-UTC audit dispositions, operator's real limits baseline with day-one violations listed, regime backfill coverage, and any deviations from this spec with reasons. PR from `claude/week1-integrity-guardrails` into staging; do not merge without operator review.

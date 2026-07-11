# STW Companion — Full Plan: Week 2 → Autonomy (Post-Week-1 Revision)

**Standing plan document. Week 2 is a paste-ready handoff; weeks 3–4 are specced with entry conditions; the back half is trigger-driven by design.**
**Prepared:** 2026-07-08 · v1.0 · Supersedes the informal sequencing discussed in planning sessions.
**Inputs:** Week-1 completion report (2026-07-08), all deviations reviewed and dispositioned below.
**Branch convention:** `claude/<feature>` off `staging`; never commit to staging directly. Generic role labels in prose; `Co-Authored-By` tooling trailers stay.

---

## ⚑ Deferred for this session's review (host, 2026-07-11)

**Regime multiplier + REGIME_EXIT advice: switch the trend input from the coarse
200-day gate to the finer 9/21/200 structure bucket?** The Risk-tab RegimeLight now
*displays* the structure bucket as its trend read (PR #107), but the multiplier +
exit advice are still driven by the frozen `regimeGate` (engine v1.1.0, close-vs-200SMA).
Making them use the structure would be an **engine change** — it collides with the
"gate frozen at 1.1.0, no new indicators enter the gate" prohibition below, and needs
a bucket→state mapping (`bear_rally`/`mid_caution` don't cleanly map to the binary
GREEN/RED) + a forward-validation reset. Host asked to **leave it as-is for now and
decide here** — if adopted, ship as engine **v1.2.0** with the validation baseline reset.

---

## Standing prohibitions (carry through every block)

1. Nothing enforces the regime multiplier on any order path until Phase B (paper) — advisory/display only.
2. The two-component gate and the Macro composite never blend: no shared inputs into the multiplier, no unified score, no UI merging.
3. Gate parameters are frozen at `engine_version 1.1.0`. Changes require the pre-registered evidence thresholds (n≥100 per bucket per population) — never convenience, never a drawdown.
4. Exploratory findings (any cut of the log) may propose rules; only pre-registered forward confirmation promotes them.
5. No new regime indicators enter the gate. New strategies get a `traders.regime_proxy` config value, never a new component.

---

# WEEK 2 — Corrections, evaporating data, self-measurement

## Item 0 — Week-1 deviation dispositions

**Reclassified after review (2026-07-08): the app has zero external users; the operator is the sole account.** The subscriber-visible mounts are therefore the correct *test configuration* for validating the future user experience, not an exposure to roll back. The two user-facing risks convert from immediate corrections into **structural launch gates** (see LAUNCH GATES section below). What remains in week 2:

**0a. Create the launch-gates record (ten minutes, this week).** Write `docs/LAUNCH_GATES.md` (and an ops_log entry pointing to it): a blocking checklist that must pass before the first external user account is created. Seeded with the two items in the LAUNCH GATES section below. The point is structural memory — onboarding the first subscriber months from now must trip over this file, not depend on anyone recalling this decision.

**0b. REGIME_EXIT change-audit trail (small, this week — this one is about the operator, not users).** Per-user editable parameters dropped the version-bump / no-mid-drawdown governance; the Settings field is now the exact mechanism by which a drawdown could quietly edit the de-risk rule, and the operator has edit access today. Restore the intent cheaply: every change to `regime_trim_to_pct` / `regime_stop_pct` / `regime_doublered_gross_pct` writes an audit row (old values, new values, timestamp, user). No blocking, no approval flow — visibility only.

**0c. Verify the 36-row timestamp stamping left a trail.** The midnight-UTC audit stamped 36 PROD rows with an assumed 4:00pm ET time. Confirm each stamping is recorded (ops_log or equivalent) with prior value; if not, write the record now from the migration/audit artifacts. An audit that fixes provenance must not itself be unprovenanced.

**0d. Post-promotion verifications (from the report's outstanding list).** After PR #82 promotes: confirm the regime-daily cron's first real tick via `run_log`; in-browser verification of the REGIME_EXIT settings flow on production; CCXI → Industrials via the admin Sector dropdown (data write).

## Item 1 — Executions sync (THE time-sensitive item; its input window slides daily)

Append-only ingestion of the IBKR Flex **Trades/executions** section into a new `user_executions` table, keyed on IBKR execution ID (idempotent upsert; re-syncs never duplicate). Fields: execution id, order id, ticker/underlying, asset class, put/call/strike/expiry where applicable, side, quantity, price, commission, execution timestamp (store exact; all date logic via `tradingDateET()`), account, `synced_at`. RLS per user, same pattern as `user_positions`. Reuses the existing `ibkr-flex` function path (JWT → stored flex token → SendRequest/GetStatement poll); the Trades section must be enabled on the operator's Flex template (manual, outside repo — if not yet done, it is the first action of the week; the ~1-year lookback window slides daily and pre-window history is unrecoverable).

First sync captures the full available lookback (~1 year of the operator's fills). Subsequent syncs are incremental by execution ID. Manual trigger alongside the existing position sync; scheduled sync remains out of scope until Phase B.

**Acceptance:** full-lookback initial sync lands; re-running produces zero duplicates; one known historical fill spot-checked against the IBKR statement; RLS proven with the item-0b second account.

## Item 2 — TCA v1 (execution-quality analysis; the highest-P&L-relevance analysis in this plan)

A script/report (admin-only, or CLI — no subscriber surface), joining `user_executions` to the host's `leg_transactions` by ticker and event window:

- **Fill slippage:** operator fill price vs. host's posted alert price per matched entry/exit, in % and per-position dollars. Convention: match on ticker + side within a T+3-trading-day window of the alert; unmatched fills listed separately.
- **Discretionary overlay ledger (the pullback-waiting question):** for each host entry alert — did the operator enter? If entered late: entry improvement vs. alert price. If never entered: the position's realized (or current) return = the forfeited outcome. Output: total % captured via better entries vs. total % forfeited via missed positions, per month. This directly measures whether waiting for pullbacks pays — the question is pre-registered here, before the numbers are seen.
- **Exit divergence:** where both operator and host closed a shared position — exit date and price deltas, and return captured vs. host's return on the same name.

No statistics theater at current sample sizes: descriptive tables, honest counts, every population labeled. This report re-runs monthly.

## Item 3 — Vol-targeted sizing (display-only scalar; the institutional replacement for gate-as-permission)

- Pure function in `@stw/shared`: `volTargetScalar(realizedVol20d, targetVol, cap, floor)` → `target/realized`, capped (default 1.5) and floored (default 0.3). Config fields in `risk_config` (per-user, defaults seeded).
- Inputs from `regime_daily` (rv20 fields already computed per instrument; scalar computed against the relevant proxy).
- **Validation before display:** backtest the scalar's effect on IWM/SPY buy-and-hold over the deepest available history (see item 4 — depth extension is a dependency): return, vol, max drawdown, Sharpe vs. unscaled. Pre-registered expectation: comparable return, materially lower realized vol and drawdown. Publish the numbers in the admin panel next to the scalar so the display carries its own evidence.
- Displayed in the admin Risk panel beside the regime light. Consumed by nothing. It becomes the candidate replacement for the ladder's continuous form at Phase B — that comparison is decided then, by the numbers, not now.

## Item 4 — `regime_daily` depth extension (bounded task, unblocks item 3 and Phase 0c)

Current history: 2020-12-08 → present — exactly one bear market (2022), COVID excluded. Insufficient for vol-targeting validation and the eventual composite-vs-gate backtest. Extend equity daily bars (IWM/SPY/QQQ) to ~2000-present via IBKR historical bars or a public daily-bar source (record source per row; TwelveData's 5000-bar cap is the reason for the switch). FRED fields (VIX/VXVCLS/DGS10) have no depth limit — backfill to each series' inception (VXVCLS starts ~2007; vol_state before that is honestly `UNKNOWN`). Re-run the three acceptance spot-checks plus two pre-2020 dates (a 2008 double-RED day; a 2013 GREEN+GREEN day).

---

# WEEK 3 — Historical reconstruction (snapshot-anchored, alert-resolved)

**Entry conditions (all met as of week-1 promotion + week-2 item 0):** integrity migration live (`source='backfill'`, `date_precision` exist); Closed-weight invariant live; ET date convention in `@stw/shared`.

**Architecture (decided; do not re-litigate):** the host publishes a weekly full-portfolio snapshot (updates-portfolio channel) — a reconciled state series. Reconstruction runs the existing Friday truth-up parsing logic over ~60 historical weekly snapshots in **staging mode** (staging tables only: `backfill_leg_transactions`, `backfill_legs`), with three deliberate divergences from live behavior:

1. **Entry dates:** diff detects the entry week; the true date is resolved via targeted alert search (`from:stocktalkweekly $TICKER`, bounded to the inter-snapshot window). Resolved → `date_precision='day'`; unresolved → snapshot date + `date_precision='week'` (excluded from regime buckets by the analyzer's standing rule). **Resolution is mandatory for stress-window trades** (2025 correction weeks; any week the backfilled `regime_daily` shows a state flip) — regime can flip mid-week exactly when it matters. Elsewhere optional.
2. **Exits:** live truth-up flags absences and never closes; historically there is no forward live-notes stream, so present-in-N/absent-in-N+1 = candidate close, resolved via alert search (host's stated policy: full exits are always alerted).
3. **Diff rules (the trap):** weight deltas are NEVER transaction evidence (relative performance moves weights weekly — the host's own footer warns this). Transactions are evidenced only by: ticker appearance/disappearance, cost-basis changes, options-leg appearance/disappearance, NEW flags, core-flag changes.

**Write semantics:** the diary's native dialect — BUY weight = lot added; SELL weight = remaining after (0 = full close). All rows: `source='backfill'`, `weight_status` per provenance (`stated` from snapshot weights; `resolved_late` with `resolution_source` for chat-recovered values; `assumed_split` for the standard split formula where genuinely unresolvable — never null, the NOT NULL constraint enforces this structurally).

**Known limitations, pre-registered:** intra-week round trips are invisible (bounded by the always-alerted-exits policy; counted as a stated hole); options-leg micro-trims are sometimes never alerted anywhere (host's admission) — options history is approximate at the margins and the secondary analysis carries that label; `chain_complete=false` for positions predating the snapshot series (Legacy: TSLA/AMZN/HOOD at minimum) — exit-side analysis only.

**Convention (pre-registered):** the signal date is the ALERT date — the only date a follower could act on — not the host's fill date ("some positions alerted slightly after the initial buy").

**Output:** staged rows; reconciliation report (terminal-state replay vs. current production holdings, seed rows excluded; per-week diff log; date-resolution coverage % overall and 100% required for stress windows); promotion SQL proposed, human-executed. Plus the first Phase 0 descriptive report: closed legs by population (share/option), by regime bucket, honestly labeled **NO VERDICT** with every bucket's n printed.

---

# WEEK 4 — Analyzer v1

Built last deliberately, against real staged rows. A script (not app UI):

- **Populations, never pooled by default:** `stw_published` (primary — the gate verdict population), `own_execution` (execution quality; consumed by TCA, not regime-judged initially), with `source` and `account_type` filters respected.
- **Primary metric:** per-leg realized % return, unweighted, closed **share legs** primary; all-legs terminal % as the labeled secondary (leverage/theta-contaminated). R-multiples are schema-impossible (no stops exist) — settled.
- **Cuts:** 2×2 trend/vol grid and the 1.0/0.5/0.0 ladder buckets, per population; MAE/MFE and holding-time distributions per bucket (terminal return alone hides drawdown pain in long holds); regime state via `tradingDateET(executed_at)` joined to `regime_daily`, `date_precision='day'` rows only.
- **Thresholds printed every run:** n≥50 per bucket per population before any conclusion; n≥100 before any gate change; below → `INSUFFICIENT_SAMPLE` stamped on the bucket. The pre-registered kill rule prints in the footer whether or not any bucket qualifies: gate survives if 0.0-bucket expectancy is negative or <50% of 1.0-bucket; gate dies (multiplier → permanent 1.0) if comparable after n≥100.
- **Exploratory section (labeled, promotion-barred):** conviction tier (0–5), 12-month ROC sign, RV quartile, cross-proxy divergence, TNX 63d sign. Proposals only.
- **Provenance section compiles itself** from ops_log + run_log: known outages, reconciled-row counts, date-precision coverage, backfill limitations.

---

# TRIGGER-DRIVEN BACK HALF (no calendar; entry conditions only)

| Trigger | Action |
|---|---|
| `macro_daily_snapshots` ≥ ~60 rows (~3 months post cron fix) | **Phase 0c:** composite-vs-gate on the forward window; reconstructable sleeves (trend/vol/rates; credit from HY-OAS/HYG-era floor) backtested on the extended history. Answers "can the Macro page be trusted" with a number. Pre-registered prior: the 11-module composite does not meaningfully beat the two-component gate; ≥1/3 of modules show no separation. |
| `stw_published` buckets reach n≥50 | First exploratory expectancy read (labeled exploratory). |
| n≥100 per relevant bucket | **The gate verdict.** Kill or keep, per the pre-registered rule. Either outcome is a success; the only failure is peeking early. |
| Verdict exists + trading bots functional | **Phase B:** paper-account enforcement (`account_type='paper'`, never pooled with real). Plumbing validation only — fills, gate consumption, the ladder-vs-vol-scalar decision made here on week-2 item 3's evidence. |
| Phase B clean + verdict survived | **Phase C:** live enforcement / autonomy. Whatever the data left standing — possibly vol-targeting alone with a dead trend component; possibly the full ladder; possibly multiplier ≡ 1.0 and pure limits. |
| Operator decides product timing | **Subscriber surfaces, earned order:** (1) per-user limits engine — already shipped, pending item-0b proof; (2) validated-gate display — POST-verdict only, counsel check first (Claude-generated signal on a paid tier); (3) analytics tier (regime history, TCA-style reports) — post-verdict. |

# LAUNCH GATES (blocking checklist — must pass BEFORE the first external user account is created)

These are not calendar items. They activate when the operator decides to onboard the first external user, whenever that is. Recorded in `docs/LAUNCH_GATES.md` (week-2 item 0a) so the onboarding work structurally encounters them.

1. **Unvalidated-signal display decision.** RegimeLight and the REGIME_EXIT advice are currently mounted on subscriber surfaces as the operator's test configuration. Before any external user sees them: decide, against whatever gate-verdict evidence exists at that time — ship with the advisory label, or re-gate to admin until the verdict. If shipping: the counsel question (Claude-generated risk signals reaching a paying tier; jurisdiction-dependent investment-advice exposure the host's disclaimers do not cover) must be answered first.
2. **DB-layer multi-tenancy proof.** Second real auth account; verify through the live database: RLS isolation on `risk_config`, `user_positions`, `user_executions`, violation acknowledgments, REGIME_EXIT settings; independent limits evaluation; no cross-read/cross-write under adversarial queries. Cross-tenant bugs cannot manifest in a single-user system — this proof is the difference between "never observed" and "verified." Recommended opportunistically earlier (a throwaway account costs an hour); mandatory here.

# SHELF (named re-entry conditions; zero work while shelved)

- **Folklore/EMA-support study:** re-enters only if a level-based rule is ever proposed for promotion — it gates nothing today.
- **Full Discord backfill (prompt v2.3, retired):** exercisable only if week 3's targeted alert-resolution proves insufficient for stress windows.
- **Wall St Engine onboarding:** post-verdict platform work; week 3's snapshot parser is its head start; onboards via `traders.regime_proxy`, not new components.
- **Scheduled position sync:** Phase B, when evaluation becomes continuous.
- **Delta-notional exposure convention:** re-enters if options exposure grows beyond the current book's scale.
- **Deeper sandbox parity / optional backfills:** opportunistic only.

# DEAD (do not resurrect without new evidence)

Host-executions access; custom Discord API client; R-multiples on the community diary; index-put hedging as the de-risk instrument; HMM/regime-model sophistication at this scale; grandfathering of limit breaches (glide paths only); MD files as a data source (views only).

---

## The standing discipline, restated once

Weeks 2 delivers the last of the direct risk/P&L value (measurement of your own execution, sizing, the corrections). Weeks 3–4 deliver validation machinery. Between week 4 and the first trigger, the correct amount of new regime work is **zero** — the log accrues, the crons tick, and the analyzer re-runs monthly alongside TCA. If new regime features appear during that window, the plan has failed in the specific way it was designed to prevent.

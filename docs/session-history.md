# Session history & handoff archive

> Dated handoff/status narratives + old Next Steps, moved out of CLAUDE.md. Historical record only — durable rules live in CLAUDE.md / docs/decisions.md / docs/ui-conventions.md. Current status is docs/status.md.

## Session — redesign QA + new screens; PUSHED to PR #152 (2026-07-21)

The redesign branch `claude/webapp-redesign` was **pushed and opened as [PR #152](https://github.com/claudiachez/stw-companion/pull/152) → `staging`** (host merges) after this session's work. ~76 commits total on the branch. typecheck + lint (0 err) + 358 tests green; every changed surface rendered + screenshot-verified live (dev server + the host's authed browser). Light theme swept; dark deferred.

New ref screens built this session (mock fidelity, real data — no fabricated fields):
- **Stock Picks · Trades** — replaced the story-line list with the redesigned flat **one-row-per-lot blotter**: 5 summary stat cards + a wide sortable grid grouped Opened · Closed · Result by vertical rules; filters Show/Type/**Outcome (Profit/Loss)**/Action; sticky header; horizontal scroll under min-width; Edit column admin-only. New `TradeOutcome` + `action` filter fields in `useTradesFilters`.
- **Stock Picks · Portfolio Overview** — reshaped to the ref card system (max-1100 column of separate cards; dropped the single pane + eyebrow; 4 separate stat cards; green "What changed", treemap, weight-by-basket, data-health).
- **GEX Signals** — removed the embedded "Live chart · SPY & QQQ" (deleted `GexChart`/`GexCharts`); added per-setup **mini price sparklines** (new `useSignalCloses` hook → real 15-min TwelveData closes; dashed trigger parsed from the host's trigger text, ±15% guard) + an **All/Calls/Puts** filter.
- **My Portfolio position detail** — rebuilt to the mock: white pane bg (shared `DetailPane`), bolded/colored emphasis values, and the flat **DATE·ACTION·DETAILS·PRICE·REALIZED-P&L** tx table (realized rides the closing sell). Picks detail now opens contained like the Portfolio split (`listPct` 55, plain divider, `borderLeft`).

Host QA refinements:
- **Tooltip icon** (`HelpToggle`, app-wide): ref style — 18px circle with a bold text "i", `--s2` default, fills to accent on hover/open (was a lucide `Info` SVG in a 15px transparent circle). The glossary "?" link is a separate affordance, untouched.
- **Profile › Preferences: Default view** — new picker (Stock Picks / GEX / Macro / My Portfolio) for the landing page; new `useDefaultViewStore` synced to `profiles.preferences.defaultView`; web app root `/` redirects to it (falls back `/picks`). **Web only** — admin index still hardcoded.
- **Filter/nav:** Trades Profit/Loss outcome filter; Positions **Tailed-only/Group-by-ticker** and Ticker-Details **Show-closed** moved next to Sort (row 1); removed the `(N)` count from the Ticker-Details tab.
- **Risk verdict banner is dismissible** — a ✕ button; dismissal remembered against the current breach *signature* (localStorage) so it stays closed until breaches change, then re-announces once. Detail always remains in the Size caps / stops blocks.
- Also: shared primitives matched to refs globally (StatusPill/Badge/AlertStrip/Button/TickerLink/SegmentedControl/AccordionList/RegimeBadge/DetailPane/Modal); Picks Overview + Trades contained in max-width columns; Positions rows rebuilt to the dense ref cluster.

**No migrations** this session (Default-view uses existing `profiles.preferences` + `set_my_preferences`). Migrations remain at 079 (all on PROD). Deferred/flagged: Picks `HoldingDetail` tx table not yet rebuilt to the flat form (Weight-column variant); admin default-view landing not wired; drawdown-alert cron still doesn't honor the `*_enabled` flags.

## Session — full webapp redesign built (2026-07-21)

Recreated the entire "STW Companion Web App Redesign" (Claude Design project
`665f2470-f119-40cb-9e5c-de3d86ad62d8`, 11 `.dc.html` surfaces) in the codebase. **All on the local
branch `claude/webapp-redesign` — 21 commits, NOT pushed, NO PR** (host is holding for a **QA session
next**, then `/stw-review` → push → single PR to `staging`). Verified locally each commit (typecheck both
apps + lint 0 errors + 358 tests + boot clean); **no screen visually verified** — auth-gated, that's QA's job.
Full per-screen deviations: `plans/20260720_webapp_redesign/FLAGS.md`.

Also merged separately: **#151 regime one-source fix** — `trendStructure(closes)` in `@stw/shared`; both the
Macro trend table and the Risk-tab per-ticker bucket now classify off the SAME daily close (was live-quote on
Macro vs daily-close on Risk → "SPY reads two states"). Applied via MCP + merged to `staging` before the redesign.

Shipped on the redesign branch (order = commits):
- **Foundation:** `FONT_SIZE` EXPANDED to the design's exact px ladder (`lg` 18→16; added 9/13/15/20/22/30) so
  redesigned screens are pixel-exact while lint's no-literal-fontSize rule holds. New `SegmentedControl`
  primitive; `DetailPane` gained an eyebrow strip / N-col stat grid / exported `DetailPaneSection`. New
  **`showMoney`** global privacy pref (`usePrivacyStore` + `profiles.preferences.showMoney`) — one toggle
  drives $ across My Portfolio + Profile.
- **Profile** — identity + editable First/Last name + avatar upload/change/remove + masked IBKR account;
  pending pill amber (new StatusPill `warning` variant); theme moved OFF the hamburger menu onto Profile.
- **Settings** — 4-tab guardrails (per-guardrail on/off toggles + draggable monotonic ladder columns +
  stocks/options per-position ladders) + re-skinned IBKR connection editor (Reveal/Test/Disconnect, masked
  account). IMPORT stays a Flex-XML file upload (the mock's one-click 365-day fetch isn't possible).
- **My Portfolio** — Overview (hero, attention strip reusing the Risk warnings, movers, concentration +
  heatmap), Risk (verdict banner + market health + account-vs-plan cards; HONORS the new guardrail flags +
  routes options to the option ladder), Tailing (diverging sizing-vs-STW bars).
- **Stock Picks** — unified Listing (Picks + Positions, shared row anatomy + SegmentedControl filters),
  unified Detail panes (position + pick over the shared skeleton; admin leg edit/note preserved), Overview
  & Trades (dashboard + one-row-per-lot blotter).
- **Macro** — 7-section rebuild (merged Event-Risk + Earnings into one "Coming up" feed; removed
  ModuleScoreStrip/MacroEventRiskCard/EarningsAheadCard). **GEX Signals** — verdict + zoned price-map
  ladders + setups + day log (per-setup sparkline omitted: no intraday series in the real data).
- **Admin** — Log-a-transaction + Edit-position modals re-skinned; every locked event-sourcing rule +
  IBKR order gate byte-identical (the mock's "Save + place real IBKR order" footer button NOT added — no
  combined handler exists).

Migrations authored + **applied to PROD via MCP** (host authorized MCP-apply this session): **077**
`set_my_display_name` RPC · **078** `risk_config` guardrail toggles (`caps/ladder/per_stock/regime_enabled`)
+ `per_stock_option_ladder` · **079** `profiles.avatar_url` + public `avatars` bucket + own-folder RLS +
`set_my_avatar_url`. Not applied to sandbox.

Durable rules recorded: `docs/decisions.md` (redesign block), `docs/ui-conventions.md` (TickerLink must be
explicitly sized; the expanded type scale), CLAUDE.md index lines.

## Session — drawdown-protection overhaul built + alerts + Whop direction (2026-07-19, cont.)

Built the overhaul the prior session diagnosed (`plans/20260719_drawdown-protection-overhaul.md`).
All merged to `staging`; the `staging→main` promotion is still pending (now 33 commits — carries the
prior batch + all of this). Migrations authored 072–076; applied 072/073/075 to PROD+sandbox,
074/076 to PROD only (sandbox has no `profiles`).

Shipped (each its own PR, CI green):
- **#145 Item 1** — drawdown shown always on the Risk tab + amber `near` band. `drawdownLadderStatus`
  in `@stw/shared`.
- **#146 Item 2** — drawdown READ off LIVE prices (host chose **Option A**: live "now", peak stays
  synced off `ibkr_nlv`). `liveNlvFromMarks` + `useLiveNlv`; one-source exception recorded in decisions.md.
- **#147** — **Item 4** per-stock drawdown ladder (reduce-to-% of peak, trim-aware by reconstructing
  peak from `user_executions` — host asked "aren't we naive to trims?", so we don't paste an ID we
  derive the peak), + **Item 3** in-app warnings (Overview chips) + email cron + Account-Value card
  fix + a Stops filter/sort. Migrations 072 (`per_stock_ladder` + `drawdown_near_band_pp`) + 073
  (`risk_alert_state`). Filter+sort shipped with the field, per convention.
- **#148** — Discord DM channel: admin-managed bot token (`integration_secrets`, migration 075 —
  NOT `app_config`, which is world-readable), link by **username** (migration 074/076 +
  `discord-link` fn resolving username→id via the bot's guild search; bot token never in the browser).
- **#149** — alerts fire **intraday** (`*/15` market hours, live-priced) with a **one-per-user-per-day**
  cap (host: "when it happens, act ASAP, no spam"); generic username placeholder.

Direction recorded (not built): **access + Discord linking flow through Whop** (docs/decisions.md +
CLAUDE.md index). Whop already sells subs + manages Discord access → app access should mirror Whop
membership; Whop feeds `profiles.discord_user_id`. Explicitly do NOT build separate auth/Discord-OAuth;
the manual username link is interim. This dropped a standalone Discord-OAuth flow mid-design.

Design calls made with the host (all in decisions.md): Option A peak; per-stock rung = reduce-to
fraction of PEAK (trim-aware via executions, not a naive "cut current"); per-stock default
75/50/25/0 at −5/−10/−15/−20; near-band a user setting; one-alert-per-day-when-it-happens.

Pending: the promotion (crons don't run until on `main`); alert env/bot setup; the Whop build; the
still-open RegimeLight↔Macro one-source fix + a Settings email opt-out toggle.

## Session — prod promotion, morning-timing/GEX fixes, portfolio reconciliation, drawdown audit (2026-07-19)

Continuation of the 2026-07-16 session. Promoted staging→main once (#138, prior), then more fixes
merged to staging (promotion pending again). Every PR green through CI.

Shipped to staging (need the next promotion to reach prod):
- **AM recap + GEX both at 8:32 ET** (#140) — recap fixed-gate (was 7:50/8:33 dynamic), GEX cron :45→:32.
- **GEX QUICK READ parser** (#141) — the newsletter restructured (titles renamed, levels moved to a
  prose "QUICK READ" block); the old title-match fell through to a stale post and wrote wrong-dated
  GEX. Parser now reads both layouts; matched-item date verified against the live feed. +2 tests.
- **GEX freshness guard + stale flag** (#142) — refuse to write a non-today report (fail loud in
  run_log); card shows "⚠ stale" when >3 days old. Reviewed the week's 9 reports: flip/wall/label
  already covered by the parser; the fail-safe guards are the real robustness (RSS holds only ~1wk).
- **My Portfolio Account Value (NLV) line** (#143) — reconciles positions ($34.8K) + cash to IBKR NLV
  ($41,099); sourced from `ibkr_nlv` + `ibkr_nlv_at`.

Diagnosed (not built — see docs/status.md):
- **RegimeLight ↔ Macro trend disagree on SPY** (Momentum vs Healthy Pullback) — two independent
  close fetches, different vintage. One-source fix pending.
- **Drawdown ladder felt like it failed** the host on a losing week. No math bug: account at −8.85%
  vs a −10% Rung 1 (account-level, not per-position). Real gaps: silent-until-fire, synced-not-live
  NLV, no notifications, no per-position stops → `plans/20260719_drawdown-protection-overhaul.md`.

Corrections I owe the record (both were "checked the wrong field/thing" errors):
- Claimed the GEX feed was "verified" without checking the matched item's DATE (it matched a stale post).
- Claimed `ibkr_nlv` was import-only/stale-Jul-8 by reading `updated_at` instead of `ibkr_nlv_at` (it's
  fresh, updates every sync). Both reinforce: verify the RIGHT field/identity, not just that something ran.


## Session — Macro/portfolio polish + dev-process guardrails + PROD promotion (2026-07-16)

**Ended with a host-approved `staging → main` promotion (PR #138, 124 commits) — everything below is
now on PRODUCTION.** Prod verified: both sites serve `macro-events` HTTP 200 post-deploy. Typecheck +
lint + 319 tests green throughout; CI ran + passed on the PRs. No migrations authored.

Macro / portfolio (merged to staging, then promoted):
- **Event Risk favorability arrow** (#121): actual-vs-previous arrow (glyph = move, color = good/bad;
  inflation green when falling) since FRED has no consensus. `eventPrintTrend` in `@stw/shared`.
  Reaction-overlay window 72h→48h (#120). Consensus display dropped (always null).
- **Prior-period comparison** on the Macro Setup line (#122) — `vix/us10y` show a `vs yest` delta.
  New standing rule (CLAUDE.md ground rules): every displayed value = source + as-of stamp + prior-period.
- **Admin `macro-events` favorability sync** (#123) — the gray-arrow bug: site-scoped copy missed `lowerIsBetter`.
- **Earnings Ahead** (#124): covers user positions ∪ STW holdings ∪ movers, tagged yours/STW/mover;
  ticker links + fresher cache (#127); **open positions only** (#130).
- **My Portfolio detail parity**: cost basis + Transaction History (grouped by contract, outcome-first)
  (#126/#128/#129); **Current Price** live via shared `useLiveQuotes` (#131) + source/as-of stamp (#132).
- **regime-daily** (#125): 5-day trailing window so FRED VIX self-heals; PROD Jul 10–14 rows hand-patched.

Dev-process guardrails (the session's second half, in response to repeated convention misses):
- **CI gate** (#133): `.github/workflows/ci.yml` runs typecheck/lint/test/`check:fn-parity` on every PR
  (there was NO automated gate before). Function-parity script catches web↔admin drift.
- **`/stw-review`** (#134): pre-PR checklist for the semantic conventions CI can't enforce.
- **CLAUDE.md 1609→113 lines** (#135): extracted transient/verbose content to `docs/{status,session-history,
  decisions,ui-conventions,routines,ibkr,macro}.md`; nothing lost. `/wrap-up` updated to maintain it.
- **`macro-recap.ts` reconciled** (#136) — the copies had drifted (canonicalized on the correct daily version).
- **`@stw/functions` de-dup** (#137): the three paired functions now live once as a workspace package
  with thin re-exports; Netlify deploy-preview verified all three serve correctly on both sites.

Deviations / notes:
- Physical fn de-dup was initially flagged as deploy-risky; done only after esbuild-bundle + deploy-preview
  proof. Discovered the apps' tsconfigs never typecheck `netlify/` (only `src/`) — the package now does,
  which surfaced + fixed two latent type issues.
- Two local memories added (not in repo): forecast-parallel-surfaces, data-display-definition-of-done.

## Current Status — Macro econ-release actuals + premarket-recap timing (handoff 2026-07-14)

**All on `staging`, NONE on `main`. `staging` is 85 commits ahead of `main`.** This session was
Macro-tab work driven by a host report (CPI wasn't showing in Event Risk after the 8:30 release). Typecheck
+ 311 tests + 0 lint. No migrations. Merged via PR #118; #116/#117 (earnings module + 7-day Event Risk +
Settings troubleshoot) were also merged to `staging` this session (by the host / parallel work — not this
chat's authorship, but they're the base #118 builds on).

- **Event Risk now shows the release's ACTUAL print (PR #118).** Root cause of the "no CPI at 8:58am"
  report: `classifyEventRisk`'s post-release reaction overlay was gated on `e.actual`, which the FRED
  *calendar* never supplies → a released event vanished. Fix: the overlay fires on **release time** (not
  `actual`; closest major — just-released vs imminent — wins), and `macro-events.ts` fetches each release's
  latest TWO `/fred/series/observations` so a released row fills `actual` + `previous`. Consensus still
  unavailable (no free feed) → no surprise calc, never a fabricated number. See Conventions → Macro data sources.
- **Premarket recap runs at 8:35 ET, after the 8:30 releases, and ingests them.** Was 8:00 ET (pre-release)
  and ingested no econ data. Now the AM cron fires `35 12,13 * * 1-5` + an ET gate (writes only once ET ≥
  8:35; two UTC fires bracket DST since Netlify cron is UTC-only; idempotency no-ops the duplicate), and the
  recap feeds the day's FRED calendar + released actuals into the prompt.
- **Deploy nuance:** Event Risk actuals = on-demand HTTP fn → live on staging once deployed. Recap retiming
  = scheduled fn → only fires on the **prod (`main`)** deploy; dormant on staging until promotion.
- **⚠️ Branch cleanup:** `claude/macro-econ-actuals` (#118, merged) did NOT auto-delete — **delete it
  manually** in the GitHub UI (git push-delete is proxy-blocked here). Other session branches auto-deleted.

**⚠️ PENDING (host):** the **`staging → main` promotion** — everything below is staging-only.

---

## Current Status — cash-flow-adjusted drawdown ladder + ladder↔regime reconciliation (handoff 2026-07-12, later)

**Two PRs merged to `staging`, NONE on `main`. Typecheck + 296 tests + 0 lint throughout. Migration 071
applied + verified on PROD + sandbox.**

- **Drawdown ladder rebuild — DONE, LIVE-VALIDATED on real PROD data (PR #114).** The Risk-tab ladder was
  firing a phantom **−60%** drawdown (peak stuck at the $100k `account_equity` placeholder). Now the peak
  tracks **`ibkr_nlv`** (live broker equity) on a **cash-flow-adjusted high-water basis** — migration
  **071** (new `cumulative_cashflow`/`cumulative_cashflow_at`/`equity_peak_cashflow`; rewritten
  `fn_risk_config_track_equity_peak`). Pure `cashflowAdjustedDrawdownPct` in `@stw/shared`. After the
  operator's sync + import, PROD reads `ibkr_nlv=$45,090`, `cumulative_cashflow=−60,000` → **drawdown
  0.00%** (the historical ~$60k withdrawal is correctly neutralized). See Decisions locked below.
- **Ladder ↔ regime reconciliation + Settings polish (PR #115).** The drawdown ladder and the double-RED
  regime rule both cap gross exposure; they're **independent** (idiosyncratic vs systematic) but the
  tighter one **binds**. New `bindingGrossTarget()` + `useBindingGrossTarget()` compute the binding target
  **once per parent** and pass it to both the gross-exposure card and the Regime light, so the two never
  show conflicting numbers. Plus a config **coherence warning** (double-RED target set looser than the
  ladder floor) and RiskConfigForm alignment fixes. See Decisions locked.
- **Assessed against the integrity-guardrails plan:** this is maintenance/coherence on the
  **already-shipped limits engine**, not a validation-track item; honors all standing prohibitions (gate
  frozen 1.1.0, advisory-only, no gate/composite blend — verified). Report:
  `plans/20260712_integrity-guardrails-report.md`.
- **NEW Week-3 discussion item (host, 2026-07-12):** decide whether to switch the regime **trend input**
  from the 200-day gate to the 9/21/200 **structure bucket** — an engine change (→ v1.2.0 + validation
  reset), to be judged by the numbers once Week 3's extended history + analyzer exist. Framed in the
  report §5; pointer added to the plan's Week-3 section. **Was the ⚑ deferred 2026-07-11 item.**

**⚠️ PENDING (host):** a **`staging → main` promotion** (approval-gated) — Weeks 1–2 + all the drawdown
work above are on `staging` only. **Next substantive plan work = Week 3 (historical reconstruction).**

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


---

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

**★ NEXT TASK — WEEK 3 (historical reconstruction) of `plans/20260709_integrity-guardrailsv2.md`.**
Weeks 1–2 are complete (Week 1 on prod; Week 2 on `staging`) and Week 2's data is now flowing (443
executions, NLV synced, drawdown live). Week 3 is the next substantive block: reconstruct ~60 historical
weekly portfolio snapshots into **staging tables** (`backfill_leg_transactions`/`backfill_legs`), entry
dates resolved via targeted alert search, exits via present-in-N/absent-in-N+1, diff rules that never
treat weight deltas as transactions. Read-first: the plan's **WEEK 3** section (full architecture,
decided — do not re-litigate) + the **NEW discussion item** it now carries (regime trend input: 200-day
gate vs 9/21/200 structure bucket — decide as part of Week 3; see `plans/20260712_integrity-guardrails-report.md` §5).
**Standing prohibitions carry through:** gate frozen at 1.1.0, advisory/display-only, gate + Macro
composite never blend, no new indicators enter the gate.

**★ THE DRAWDOWN-LADDER REBUILD IS DONE + LIVE-VALIDATED (PRs #114 + #115, both merged to `staging`).**
Migration 071 applied to PROD + sandbox; PROD drawdown reads **0.00%** on real data. Full detail in the
Current Status subsection at the top + `plans/20260712_integrity-guardrails-report.md`. The model +
reconciliation rules are recorded under **Decisions locked** below.

**PENDING (host actions, not code):** A **`staging → main` promotion** is approval-gated and pending —
Weeks 1–2 + the drawdown work are on `staging` only; the nightly `ibkr-sync-cron` cannot fire until it
lands on prod. (`risk_config.ibkr_nlv` is now populated — no further sync action needed.)

0. **✅ WEEK-2 ITEM 4 — `regime_daily` depth extension DONE (PR #89, 2026-07-10).** PROD `regime_daily`
   is now **19,500 rows, IWM/SPY/QQQ 2000-09-01→present** (`source=yahoo+fred`) — see the Current Status
   subsection at the top. **Newly unblocked:** Item 3's **vol-target validation backtest** (the
   `VolTargetPanel` still labels it "pending the regime history depth extension" — that label can now be
   flipped and the backtest run against the deep history) and **Phase 0c**'s composite-vs-gate backtest.
   The regime history now spans dot-com / GFC 2008 / 2011 / 2018 / COVID. `plans/20260709_regime_daily_depth_extension.md`
   carries the DONE status + the Stooq→Yahoo deviation note.

0b. **VERIFY the Macro econ-actuals + recap timing (PR #118, this session).** On a real **release
   morning** after this deploys: (a) open the Macro tab shortly after 8:30 ET and confirm Event Risk shows
   the just-released print (e.g. "CPI … actual X, prior Y") in a Reaction Overlay instead of the event
   vanishing — this is on-demand, so it's testable on **staging**; (b) the premarket recap timing only
   fires on **prod (`main`)**, so it can't be confirmed until a promotion. Also **delete the merged
   `claude/macro-econ-actuals` branch** in the GitHub UI (git push-delete is proxy-blocked).

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


# Redesign — RIGOROUS element-level re-QA (handover)

> The first QA pass (see QA.md) was structure-only and NOT trustworthy — the host proved it on the
> detail panes. This is the **rigorous** pass: diff the **live DOM** (logged-in app) against the
> **byte-exact** `.dc.html` ref markup, element by element, and **match the mock exactly** on copy.
> Fix real deltas, commit per coherent unit, keep the branch green (typecheck).

## HOW TO RUN (same as QA.md)
- `corepack pnpm --filter web dev` (→ :5173) + `--filter admin dev` (→ :5174). Both auth-gated.
- Auth for QA: the host signs in via **Claude-in-Chrome** (the in-app preview pane sign-in didn't work).
  Session is per-origin — bring web up **on :5173** so the existing Chrome session is reused.
- Diff method: extract app DOM text (Chrome `javascript_tool`, read a pane/section's `innerText`),
  compare to the ref's static copy. Refs: `plans/20260720_webapp_redesign/refs/*.dc.html`
  (Detail Panes ref was comment-only locally → the byte-exact markup is in the design project
  `design_handoff_stw_companion/…`, re-fetch via the DesignSync MCP, project 665f2470-…).
- **VALUES differ (demo vs real prod data) and are NOT defects** — only static copy/labels/structure count.

## OPERATING PRINCIPLES (host rulings — apply to ALL screens)
- **PR1** App richer than the mock → **KEEP** the rich real-data detail + **ADD** any missing mock
  label/explanatory copy. Only strip to the mock when the host says so per-case.
- **PR2** Mock copy that is **factually WRONG** for the app's data model → **SKIP** it (keep the app
  truthful); note each skip. (e.g. the mock's "grown by the run-up, not adds" is false — leg weight
  is cost-basis %, changed by adds/trims, not price — so it was skipped.)
- **Copy** otherwise: **match the mock exactly** (host).

## GLOBAL items (decided + implemented)
- **G1 — canonical sizing wording (DONE, shared).** `sizingTone.label` = "N points heavier/lighter"
  (state + locked oversized=amber / undersized=indigo colors unchanged). Detail-pane suffix
  "≈ $X more/less". Tailing tab "heavier/lighter than STW". `sizing.test.ts` updated.
- **G2 — "+" on gains (DONE for My Portfolio; shared helper built).** New `@stw/shared` `formatMoney(v,{signed})`.
  Gains show "+", losses "-$…", neutral totals unsigned. Applied: position pane, PortfolioPage
  (Positions P&L col, group P&L, Overview movers). **When re-QAing the remaining screens, apply the
  same at any NEW $-gain site you find** (Picks Overview/Trades use %/pts, Risk shows caps/drawdown —
  no $ gains there, so nothing was needed).
- **G3 — minus glyph (DEFERRED, cosmetic).** Drawdown/rung/loss numbers use hyphen "-"; mock uses
  typographic minus "−". App-wide, low priority — batch at the end if wanted.

## STATUS — per view
| View | Rigorous status |
|---|---|
| **Position detail pane** | ✅ DONE — commits 400c304, d783198 (stats + risk-plan one-card + rungs "keep ≤" + advisory) |
| **Pick detail pane** | ✅ DONE — 380d4b9 ("you don't tail this pick"), 0a87ecf ("Your personal note" split section). K1/K2/K3 resolved via PR1/PR2 (kept rich; skipped false "grown by run-up"). |
| Global G1 (sizing) | ✅ DONE — a480408 |
| Global G2 (+gains) | ✅ DONE (My Portfolio) — 2bcfc3e + 6daca5b |
| Profile | ✅ DONE — dropped "account " prefix on the connected-account line (match mock bare masked number). Edit button + avatar (PR1 host adds) + 2-way theme copy (documented dev) kept. |
| Settings | ✅ DONE — 4 copy fixes (intro "on this page…nothing here ever"; safety-net "watches your whole account —"; per-stock "Alerts show per position on the Risk tab — advisory only"; alert-delivery "step" not "rung"). **S1 RESOLVED: keep FormRow uppercase cap labels** (primitive-reuse, consistent w/ every config form). Connection-editor Save button (app-necessary) + Trade-history/setup-guide copy (PR2 — mock's "Select All/30 days/2 sections" guide is wrong for the real 4-section sync) kept as deliberate deviations. |
| Macro | ✅ DONE — NO fixes. All deltas are values or documented: input weights (Credit 15/GEX 20) + verdict advice ("Favor strongest setups only" = `macro.ts:150` tradingMode) are one-source data-derived; "5-day change"→"the change"/"lookback change" is PR2 (app arrows are mixed 5D/3D, so "5-day" would be false — tooltip weights come from `w` object, no hardcoding); source line adds "constituents…not STW holdings" (PR1). **M1 resolved** (radar names are non-holding market constituents → plain text correct; leader=solid/setting-up=dashed badges match ref). **M2 not reproduced** (Coming-up shows graceful "Nothing scheduled" empty state vs PROD). |
| GEX Signals | ✅ DONE — added missing price-map intro copy ("Above the gamma-flat line…floor is gone", PR1). Kept: verdict advisory + glossary genericize dead "Graddox" name (PR2); real stale-banner data; sparkline omitted (documented); GexChart preserved. **G-GEX RESOLVED** (host: use mockup): all section headers converted to inline 14px/600 sentence-case titles (no emoji/bar), incl. live-chart section. Glossary reworded but accurate — kept. |
| My Portfolio · Overview | ✅ DONE — NO fixes. Copy matches mock throughout (hero, attention strip, 4 stats, movers, concentration + treemap, tailing footer). G2 confirmed (hero P&L +/−, movers signed). Minor: hero uses typographic − vs formatMoney hyphen = deferred G3 cosmetic. |
| My Portfolio · Risk | ✅ DONE — aligned glossary toggle to "? What do these terms mean" (was "What do these terms mean?"; consistency w/ Settings/GEX). All else correct: verdict/advisory/all-clear; market card + guardrail-off state; safety-net/invested/caps/per-stock cards; ack workflow + glossary content. Per-stock intro "Each position…One" (PR2 — card includes options); stop rows richer (PR1). |
| My Portfolio · Tailing | ✅ DONE — aligned glossary toggle to "? What do these terms mean" (was "▸ What these terms mean"). G1 wording verified throughout (rows, chips, alert). Chips "sized like STW"/"your own calls" kept (consistent w/ G1 vocab). **T1 RESOLVED (host): keep the ↗ to STW's pick as-is** — do NOT add the mock's "Compare all on Tailing →" link. |
| My Portfolio · Positions list | ✅ DONE — fixed conviction band "Medium"→"Moderate" (one-source `conviction.ts`; matches tier name + mock; also fixes Trades filter). Kept: baskets/sectors real data; Trend/Sector-regime segments = real trendStructure/sector taxonomy (PR2); no "Weight ↓" sort (= "Value ↓", weight=value/NLV); rows richer than mock (ConvictionBadge+RegimeBadge+stop detail vs mock's basket badge — deliberate risk anatomy, basket=filter+detail). Minor kept: "Sector Leader/Setting Up/Laggard" vs mock "Leader/…" (real labels); L1 2nd-row overflow at 1440 (cosmetic). |
| Stock Picks · list | ✅ DONE — NO fixes. Filters (conviction Tier 1–6 exact, status exact, real baskets/sectors, all sorts), tier grouping (canonical "TIER N — … CONVICTION" label), badges (basket+action+Held+RegimeBadge — richer, PR1) all match. **P-LIST RESOLVED** (host: use mockup): row secondary now shows "$price · weight%" (dropped the date); Newest/Oldest still sorts by action_date. |
| Stock Picks · Overview | ✅ DONE — NO fixes. 4-stat strip, "What changed this week" (real conviction-change events, richer than mock demo), "The book" treemap (shared PortfolioHeatmap — Today/Total works, returns on large tiles per mock's size rule; richer w/ All/Basket/Sector+scale+source), weight-by-basket, data-health (⚠ unpriced legs) all present + real. Minor accepted: stat subs terser/different framing ("12 baskets" vs "14 open lots · CASH excluded"; "by market value" vs "…current…") — real-data, documented Stat-vs-KpiCard + no-delta deviation. |
| Stock Picks · Trades | ✅ DONE — footer "the whole book" (was "the book"). Filters/segments/rows match (conviction "Moderate" via shared fix; app adds Sectors filter + symmetric sorts — richer). "N of M lots" only when filtered (convention). Row P&L shows +/−% (G2-style; no $ sites here); closed rows dimmed; locked P&L-split untouched. |
| Admin · Edit-position + Log-a-transaction | ✅ DONE (on :5174) — Edit-position: 3 copy fixes (status warning "…— subscribers see the position leave the list"; "Sector (GICS)" label; split hint "shares:options" not "equity:options"). Log-a-transaction: matches (numbered sections, leg+action chips, "This will read:" preview, Save event/Cancel) + correctly OMITS "Save + place real IBKR order…" (documented). Event-sourcing rules byte-identical; subtitle + open-legs footer richer (PR1). |

## OPEN QUESTIONS for the host (non-blocking, flagged during the pass)
- **G-GEX — RESOLVED (host: use the mockup).** All GEX section headers converted to the mock's inline
  14px/600 sentence-case titles (no emoji, no `--s2` bar), incl. the live-chart section.
- **P-LIST — RESOLVED (host: use the mockup).** Picks-list row secondary now shows `$price · weight%`
  (dropped the last-action date); Newest/Oldest still sorts by `action_date` (just not printed).
- **T1 — RESOLVED (host: keep ↗ as-is).** Position pane ↗ opens *STW's tracked pick* (kept, intentional);
  the mock's "Compare all on Tailing →" link (→ Tailing tab) is NOT added. Known, accepted mock deviation.
- Delete-account support email stays `cc@claudiachez.com` (confirmed this session).

## CONSTRAINTS (unchanged)
- Don't push / open the PR without explicit host go-ahead. Never touch the staging→main promotion.
- Migrations 077/078/079 already applied to PROD. Frozen regime gate. Locked event-sourcing + P&L-split.
- After QA is clean + host go-ahead: `/stw-review` → push `claude/webapp-redesign` → ONE PR to `staging`.

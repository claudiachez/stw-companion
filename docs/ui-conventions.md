# UI conventions (standing rules)

> The full standing UI rules, moved out of CLAUDE.md. Reach for these when building any UI surface.

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
- **The three de-risking concepts stay visually DISTINCT surfaces** (host, 2026-07-19): (1)
  market-regime de-risking = the RegimeLight card; (2) portfolio (account) drawdown ladder = the
  "Portfolio drawdown" + Gross-exposure cards; (3) individual-stock drawdown = the per-stock chip on a
  position row + its own detail-pane section. Never merge them into one card/number. (1) and (2) both
  cap gross and reconcile via `bindingGrossTarget` ("tightest binds"); (3) is a separate axis (flags a
  NAME, sets no gross target) and must never be blended with the account read.
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


## TickerLink + pixel-font (webapp redesign, 2026-07-21)

- **Every ticker shown as an identifier is a `TickerLink` to its detail** (rows, chips, movers, cap rows,
  stops, own-calls, treemap tiles, alert mentions). Not plain text, not a bare span, not a custom button.
  The one exception is **Macro index/ETF symbols** (SPY/QQQ/IWM/RSP/VEA, XL* sectors) — no detail page, so
  plain styled text. (A whole-row `<button>` that opens the detail also satisfies the rule.)
- **`TickerLink` renders `fontSize: 'inherit'`** — so in any card whose base size differs from the design's
  intended ticker size it silently renders too large. **ALWAYS pass an explicit
  `style={{ fontSize: FONT_SIZE.* }}`** on a TickerLink. (Bit us on the Risk per-stock-stops card — 16px
  inherited vs the design's 13px.)
- **Font sizes are pixel-exact via the `FONT_SIZE` token scale** (`@stw/shared`), which was expanded to the
  redesign's full ladder (9/10/11/12/13/14/15/16/20/22/26/30 → `3xs/2xs/xs/sm/sms/base/md/lg/xl/2xl/display/hero`;
  `input`=16 kept for the iOS-zoom floor). Never a literal numeric `fontSize` (lint bans it). If the design
  uses a px with no token, use the nearest and note it — don't hand-roll a literal.

## Help affordances — two distinct things (2026-07-21)

The app has **two separate** help patterns; don't conflate or restyle one into the other:
- **Inline tooltip = `HelpToggle`** (the **ⓘ** next to a section header). Ref style: an 18px circle with a
  bold text **"i"** (not a lucide SVG), `--s2` background by default, filling to accent (white "i", accent
  border) on hover/open. It's the shared primitive — one change covers every page.
- **Glossary = a plain "? What do these terms mean" text link** at the bottom of a card (Risk / GEX /
  Tailing), toggling a plain-English block. Leave it as a text link — it is **not** an icon and must not be
  merged into the `HelpToggle` treatment.

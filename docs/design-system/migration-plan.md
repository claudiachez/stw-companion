# STW Companion — Design System: Migration Order Proposal

Phase 4 deliverable per [`plans/stw-design-system.md`](../../plans/stw-design-system.md)
§3. **No pages are migrated in this doc or this session** — this is the plan a future
session executes, one page/phase at a time.

## Method — this is measured, not estimated

Every count below comes directly from `eslint-suppressions.json` (generated once, the
day the Phase 4 lint rule shipped — see [`CONTRIBUTING.md`](CONTRIBUTING.md#enforcement)),
not from the Phase 1 audit's illustrative grep samples. It is the exact number of literal
hex/rgb colors and raw numeric `fontSize`s in each file, repo-wide, **419 across 43
files**. This is more precise than the audit and should be treated as the source of
truth for sizing from here on — re-run `pnpm lint:prune` after any migration to keep it
current.

**Not included**: PR #67 (`claude/week1-integrity-guardrails`) and PR #69
(`claude/portfolio-limits-redesign`) are unmerged, so their new surfaces
(`RiskConfigForm`, `LimitsPanel`, `ViolationsSummary`, `PortfolioPositionDetail`) carry
no count here. Once either merges, re-run `pnpm lint` — their violations will appear
in a subsequent `eslint-suppressions.json` and should be added to whichever page-group
they land in below (Settings for `RiskConfigForm`, My Portfolio for the rest).

## Proposed order

CLAUDE.md's existing proposal was: **(1) Settings, (2) My Portfolio, (3) Stock Picks,
(4) GEX Signals / Macro** — written from the Phase 1 audit's qualitative read, before
this file-level count existed. Checking it against the measured data:

| # | Page | Violations | Files | Confirmed? |
|---|---|---|---|---|
| 1 | Settings | 17 | 1 | ✅ Genuinely the smallest surface — confirmed |
| 2 | My Portfolio | 40 | 2 | ⚠️ Not "biggest offender" by count (Stock Picks and Macro are both far larger) — see below |
| 3 | Stock Picks | 190 | 17 | ❌ Not "closest to target" by volume — it's the **largest** single surface, by far |
| 4a | GEX Signals | 39 (33 real — see note) | 7 | — |
| 4b | Macro | 123 | 14 | Not previously sized separately from Signals — it's 3× Signals' real count |

**Recommendation: keep Settings first and My Portfolio second, for the reasons CLAUDE.md
actually gave (not violation count) — but split "Stock Picks / GEX Signals / Macro" into
three separately-sized phases, reordered by effort-to-impact:**

1. **Settings** — smallest surface, proves the pattern cheaply, lowest risk.
2. **My Portfolio** — "biggest offender" refers to the *host-reported* inconsistency
   (3+ badge treatments, two unrelated button styles) that triggered this whole project,
   not raw literal count. The real reason to do it second is timing: a planned redesign
   already lands here, so building it directly on the new components is free (vs.
   migrate-then-redesign, which is double work). This reasoning holds regardless of the
   40-violation count being smaller than other pages.
3. **GEX Signals** — small (33 real violations after excluding the sanctioned
   `GexChart.tsx` exception), self-contained, quick win between two bigger phases.
4. **Stock Picks** — the core, most-used surface (Ticker Details + Trades), but also the
   largest migration by volume (190 violations, 17 files, two files alone —
   `HoldingDetail.tsx` + `LegTimeline.tsx` — account for 88). Budget as its own
   multi-session phase, not a single sitting. Do the two confirmed **bugs** first (see
   below) as an early sub-pass, independent of the broader token sweep.
5. **Macro** — 123 violations, 14 files, comparable in size to Stock Picks. Lowest
   urgency: it's the newest code in the app, and its own `macroVisuals.tsx` was already
   flagged as "the most mature informal system in the repo" — less structurally
   inconsistent internally than the other pages, so lower payoff-per-effort than doing
   it earlier.

## Per-page breakdown

### 1. Settings — 17 violations, 1 file

| File | Violations |
|---|---|
| `apps/web/src/features/settings/SettingsPage.tsx` | 17 |

**Real bug to fix, not just tokenize**: `SettingsPage.tsx`'s `inputStyle` sets
`outline: 'none'` with no focus replacement (audit 04 §3) — a live keyboard-a11y
regression. Swap both inputs (Flex Token, Query ID) onto `TextInput`; this fixes the bug
and the literals in the same motion. The two Save/Sync buttons become `Button` variants
(`primary`/`secondary`). The "Connected"/"Not connected" pill becomes
`StatusPill variant="ok"` / `variant="neutral"`. The two duplicate inline error-strip
`<div>`s (lines ~160, ~198) become one `AlertStrip severity="negative"` each.

### 2. My Portfolio — 40 violations, 2 files (PR #69 adds more once merged)

| File | Violations |
|---|---|
| `packages/ui/src/features/portfolio/PortfolioPage.tsx` | 38 |
| `packages/ui/src/features/portfolio/PortfolioFilterBar.tsx` | 2 |

Coordinate with whoever picks up PR #69: `LimitsPanel`/`ViolationsSummary`/
`PortfolioPositionDetail` should be **built on `DetailPane`/`ListDetailSplit`/
`StatusPill`/`Badge` directly**, not migrated after the fact — per CLAUDE.md's own
Next Steps, this was already flagged as unreviewed-for-design-system-fit since it merged
after the Phase 1 audit's scope closed. `PortfolioFilterBar.tsx` should match
`FilterBar.tsx`'s canonical filter-order convention if it doesn't already (per the
standing "sibling tabs read as one app" rule).

### 3. GEX Signals — 39 violations (33 real), 7 files

| File | Violations |
|---|---|
| `packages/ui/src/features/signals/components/SignalsTable.tsx` | 11 |
| `packages/ui/src/features/signals/SignalsView.tsx` | 8 |
| `packages/ui/src/features/signals/components/LevelCard.tsx` | 6 |
| `packages/ui/src/features/signals/components/GexChart.tsx` | 6 — **sanctioned exception, do not migrate** (canvas API, needs literal colors) |
| `packages/ui/src/features/signals/components/DayLog.tsx` | 4 |
| `packages/ui/src/features/signals/components/GexCharts.tsx` | 3 |
| `packages/ui/src/features/signals/components/BiasChip.tsx` | 1 |

**Real bug to fix**: `SignalsTable.tsx`'s P&L-adjacent green (`VCOLS`'s `'#16A34A'`) is
one of the three P&L color-literal files (audit 04 §2) — migrate its verdict dots onto
`StatusPill` (`green→ok`, `yellow→near`, `red→breach`, `gray→neutral`) rather than a
literal-hex `VCOLS` map; this both fixes the bug and removes the map. `BiasChip.tsx`'s
bullish/bearish/flat states map the same way. `LevelCard.tsx`/`DayLog.tsx` are candidate
`DetailPane`/`DataTable` instances respectively — check against the current spec's
"detail pane" finding (report #02 item 6 named this pairing as the second existing
detail-pane implementation).

### 4. Stock Picks — 190 violations, 17 files

| File | Violations |
|---|---|
| `HoldingDetail.tsx` | 50 |
| `LegTimeline.tsx` | 38 |
| `PortfolioDashboard.tsx` | 21 |
| `PositionEditor.tsx` | 14 |
| `TradeEditForm.tsx` | 13 |
| `HoldingRow.tsx` | 10 |
| `ConvictionCommentForm.tsx` | 9 |
| `TradesTable.tsx` | 7 |
| `ConvictionBadge.tsx` | 6 |
| `CommentRow.tsx` | 6 |
| `PicksView.tsx` | 4 |
| `TradesFilterBar.tsx` | 3 |
| `ConvictionTimeline.tsx` | 3 |
| `RegimeBadge.tsx` | 2 |
| `FilterBar.tsx` | 2 |
| `ActionBadge.tsx` | 1 |
| `useTickerRegime.ts` | 1 |

(All paths under `packages/ui/src/features/picks/`.)

**Two confirmed bugs — fix these first, as their own sub-pass, independent of the
broader sweep:**
1. **P&L color bug** (audit 04 §2): `HoldingRow.tsx` and `HoldingDetail.tsx` hardcode
   `#16A34A`/`#DC2626` (the light theme's green/red) regardless of active theme — swap
   onto `var(--pnl-gain)`/`var(--pnl-loss)`. This is the highest-priority item in the
   entire migration — a real bug shipping today, not drift.
2. **Modal centering bug** (audit 03): `PositionEditor.tsx` and `TradeEditForm.tsx` both
   top-anchor their modal instead of centering — migrating both onto the `Modal`
   component fixes this automatically as a side effect of the token swap, and also
   collapses their three different `maxWidth` values onto `MODAL_WIDTH.md`/`.lg`.

**Structural migrations** (not just literal-swaps): `HoldingDetail.tsx` → the primary
`DetailPane` instance (it's the file the skeleton was generalized from — expect this to
mostly be lifting existing JSX into `DetailPane`'s `metrics`/`children` slots rather than
a rewrite). `LegTimeline.tsx`'s three modals (`EventForm`, the IBKR order modal ×2 call
sites) → `Modal`. `ConvictionBadge.tsx`/`ActionBadge.tsx`/`RegimeBadge.tsx` → `Badge`
(`kind="tier"`/`"action"`/composed `flag`s respectively) — `ConvictionBadge.tsx`
specifically should stop hardcoding its own `LEVELS` map (100% duplicate of `TIERS`).
`TradesTable.tsx`'s `th`/`td` were the two files `DataTable`'s header style was lifted
from — this is the most mechanical migration in the batch (its own style objects
already the reference).

### 5. Macro — 123 violations, 14 files

| File | Violations |
|---|---|
| `SentimentGauge.tsx` | 22 |
| `MacroRecapCard.tsx` | 17 |
| `TrendStructureTable.tsx` | 15 |
| `MacroEventRiskCard.tsx` | 15 |
| `SectorRotationCard.tsx` | 13 |
| `macroVisuals.tsx` | 11 |
| `RegimeBanner.tsx` | 8 |
| `GexPositioningCard.tsx` | 7 |
| `ModuleScoreStrip.tsx` | 4 |
| `RatesDollarCard.tsx` | 3 |
| `CreditLiquidityCard.tsx` | 3 |
| `VolatilityStressCard.tsx` | 2 |
| `useMacroTrendHistory.ts` | 2 |
| `MacroView.tsx` | 1 |

(All paths under `packages/ui/src/features/macro/`.)

**`macroVisuals.tsx` is the interesting one**: it's the module `SectionHeader` and
`KpiCard` were generalized *from* (its `ModuleHeader`/`StatTile`/`SleeveSummary`), so
migrating it means **replacing it with imports of the components it inspired**, then
deleting the now-redundant local versions — every other Macro file that currently
imports from `macroVisuals.tsx` should be repointed at `packages/ui`'s public exports in
the same pass, or `macroVisuals.tsx` becomes a second, competing copy again. Do this file
first within the Macro phase, before its 13 sibling module cards, so they can migrate
straight onto the shared components instead of macro's own local ones.

**Note**: `MacroRecapCard.tsx`'s "Regenerate" button was flagged (report #02 item 8) as
styled with the wrong semantic weight (a ghost button for the row's one real action) —
decide during this migration whether that was deliberate ("quiet by design" — recaps
regenerate automatically twice daily) or a miscategorization, now that `Button`'s
variants exist to compare it against directly.

## Not part of any page's migration — fix opportunistically or flag separately

- `GexChart.tsx`'s 6 violations are permanent (canvas API constraint) — never migrate,
  but consider the smaller follow-up of reading `--acc`/`--c1` via `getComputedStyle`
  once at chart-init so a theme toggle restyles it (audit 04 §2's secondary note).
- The three `FilterBar` variants' (`FilterBar.tsx`, `TradesFilterBar.tsx`,
  `PortfolioFilterBar.tsx`) `outline: 'none'` focus-accessibility gap (audit 04 §3) is
  fixed automatically once their search inputs move onto `TextInput` — this happens
  naturally within each file's own page-phase above, called out here so it isn't
  missed as "just a literal-color swap."

## After this plan

Per CLAUDE.md's design-system section and the spec's own checkpoint structure, each
phase above should still be presented for review before starting the next — the same
checkpoint discipline Phases 1–4 followed, now applied per-migration-phase instead of
per-system-phase.

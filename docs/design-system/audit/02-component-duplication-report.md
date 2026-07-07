# Design System Audit — Phase 1, Part 3: Component Duplication Report

Scope and branch state same as the other two audit docs. For each component
class from the spec's symptom inventory: every implementation found, file
path, and how they diverge. "Near-duplicate" = same job, different code, no
shared source.

## 1. Badge / Chip — 6 independent implementations, 4 different concept classes

The spec predicted "3+ badge treatments"; the actual count on `staging` is
higher once every inline pill is counted, not just the named components:

| Component | File | Concept | Font size | Padding | Radius | Alpha technique |
|---|---|---|---|---|---|---|
| `ActionBadge` | `packages/ui/src/features/picks/components/ActionBadge.tsx` | transaction action (New/Upsized/…) | 9 | `2px 5px` | 3 | none — reads `color`/`bg` straight from `ACTION_VARS` (CSS vars) |
| `ConvictionBadge` | `packages/ui/src/features/picks/components/ConvictionBadge.tsx` | conviction tier | Tailwind `text-xs` | Tailwind `px-2 py-0.5` | Tailwind `rounded` | `${color}22` border / `${color}15` bg, **and hardcodes its own literal-hex `LEVELS` map that duplicates `TIERS` in `packages/shared/src/constants/tiers.ts`** — the one place this data already exists as CSS-var tokens |
| `BiasChip` | `packages/ui/src/features/signals/components/BiasChip.tsx` | GEX bias | 11 | `2px 8px` | 4 | none — direct CSS var bg/color pairs |
| `RegimeBadge` | `packages/ui/src/features/picks/components/RegimeBadge.tsx` | trend bucket + sector standing (2 chips in one component) | 10 | `2px 6px` | 4 | `color + '18'` bg / `color + '28'` border |
| basket/category tag | inline in `HoldingRow.tsx:67` and `HoldingDetail.tsx:471` (not a component — copy-pasted inline `<span>`) | basket/category | 10 | `1px 5px` (HoldingRow) / `2px 6px` (HoldingDetail) — **the two copies have already drifted on padding too** | 4 | `basketColor + '18'` bg / `+'28'` border (matches RegimeBadge's convention, coincidentally, but is a separate literal copy, not shared code) |
| "Connected" status pill | inline in `SettingsPage.tsx:77-84` | connection status | 10 | `2px 7px` | 4 | none — ternary between two CSS-var pairs |

Every one of the four badge components picks its own font size, padding, and
alpha technique despite 4 of the 6 already being tokens-only (no literal hex
in the component itself). This is a naming/consolidation problem more than a
token problem — Phase 3's single `Badge` component with a `kind` enum
(`source`/`category`/`tier`/`flag`) should absorb all six, and
`ConvictionBadge` specifically must be rewired to import `TIERS` from
`@stw/shared` instead of maintaining a parallel hardcoded color map — real
finding, not hypothetical: **`ConvictionBadge`'s label/color set is 100%
duplicate data of `TIERS`, already sitting one import away.**

## 2. Status indicator

Not a distinct component anywhere — every "status" (IBKR Connected/Not
connected, sync success/error, Limits OK/near/breach once #67 lands) is a
one-off inline pill or inline colored text, styled ad hoc each time (see
`SettingsPage.tsx`'s "Connected" pill above, and its two separate inline
error-strip `<div>`s at lines 160 and 198 that duplicate the same
`background: '#2d0c0c', border: '1px solid var(--c1b)'` styling as two
separate literals in the same file rather than one constant).
`StatusPill`'s `ok`/`near`/`breach`/`unevaluated`/`info` taxonomy (spec
Phase 3.1) has no existing analog to consolidate into — this one is a
genuine net-new component, not a migration.

## 3. Section header — 2 near-identical implementations, both unshared

| Component | File | Style | Extra behavior |
|---|---|---|---|
| `SectionHeader` | `packages/ui/src/features/picks/components/PortfolioDashboard.tsx:18` (local, unexported) | `fontSize 10, fontWeight 600, letterSpacing 0.12em, uppercase` | right-aligned "Updated: {date}" slot |
| `ModuleHeader` | `packages/ui/src/features/macro/components/macroVisuals.tsx:10` (exported, but Macro-only) | `fontSize 10, fontWeight 600, letterSpacing 0.12em, uppercase` | collapsible ⓘ help toggle below |

Visually these are the same label style with two different bolt-on features
(a date stamp vs. a help disclosure). Despite CLAUDE.md documenting
`SectionHeader` as if it were a shared, importable convention ("Overview
blocks share one header pattern... via `SectionHeader`"), it is a private
function usable only inside the one file that defines it — any other
feature wanting this treatment has been, and would continue, copy-pasting
it. Phase 3's `SectionHeader` (spec 3.4, "optional right-slot for actions/
status") should be built to support both existing right-slot use cases
(date stamp, help toggle) as configurable content, not two components.

## 4. KPI card

| Component | File | Layout |
|---|---|---|
| `StatTile` | `macroVisuals.tsx:60` | label / big value (`fontSize 22`, color-scored) / optional sub-line, in a bordered `var(--s2)` tile |
| Portfolio summary metrics | `PortfolioDashboard.tsx` (2-col responsive grid, `gridTemplateColumns: 'minmax(280px, 1fr) 1.4fr'`) | ad hoc metric blocks, not a shared tile component |
| `SleeveSummary` | `macroVisuals.tsx:77` | big number + status word inline, no card chrome at all — a variant of "KPI" with no border/background |

Three different visual answers to "show one number with a label," none
sharing code, one of them (`SleeveSummary`) not even card-shaped. Phase 3's
`KpiCard` (3.3) should standardize on `StatTile`'s tile-with-border approach
as the base (it's already tokens-only and closest to the spec's ask) and
treat `SleeveSummary` as a "no-chrome" variant/prop rather than a separate
component.

## 5. Data table — near-identical `th` style objects, independently defined

`TradesTable.tsx` (`packages/ui/src/features/picks/components/`) and
`SignalsTable.tsx` (`packages/ui/src/features/signals/components/`) each
define their own local `const th: React.CSSProperties = { ... }`:

```ts
// TradesTable.tsx:131-135
const th: React.CSSProperties = {
  textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.08em', color: 'var(--t3)', background: 'var(--s2)',
  padding: '7px 13px', borderBottom: '1px solid var(--bsub)', whiteSpace: 'nowrap',
};

// SignalsTable.tsx:24-28
const th: React.CSSProperties = {
  textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.08em', color: 'var(--t3)', background: 'var(--s2)',
  padding: '7px 13px', borderBottom: '1px solid var(--bsub)',
};
```
Byte-identical except one has `whiteSpace: 'nowrap'` and the other doesn't —
this is a copy-paste, not a coincidence, and it's already drifted once. A
third table exists in `PortfolioDashboard.tsx` (holdings list) with its own
row styling not using a `th` constant at all. This is the textbook case for
Phase 3's `DataTable` (3.6) — the header style alone should be extracted
verbatim from `TradesTable.tsx`'s version (the more complete one) into the
shared component, and both existing tables migrated onto it in Phase 4.

## 6. Detail pane

Two real detail-pane implementations on `staging` today: `HoldingDetail.tsx`
(Stock Picks / My Portfolio, admin+web) and the signals `LevelCard.tsx`/
`DayLog.tsx` pairing (GEX Signals). They solve the same problem — header row
+ metric block + stacked content sections — with independently structured
JSX and no shared skeleton. (CLAUDE.md's own handoff notes flag a third,
not-yet-merged instance: PR #69's `PortfolioPositionDetail.tsx`, explicitly
built to "follow `PicksView.tsx`'s list+detail contract" by hand rather than
from a shared skeleton, because no such skeleton exists yet.) This is the
single highest-leverage Phase 3 item (3.7, "both Stock Picks and My Portfolio
panes will be instances of this") — building it now means PR #69's pane can
be rebuilt on it rather than becoming a fourth divergent instance.

## 7. Form row / Settings form

`apps/web/src/features/settings/SettingsPage.tsx` is the only real settings
form on `staging` (PR #67's `RiskConfigForm` isn't merged yet). Its label/
input pattern is repeated twice inline (Flex Token, Query ID), each a
separate `<label>` + `<input style={inputStyle}>` pair with no shared row
component — consistent within this one file only because it was written in
one sitting, not because of any structural guarantee. No "three different
alignments" divergence was found in-scope (that symptom likely refers to
PR #67/#69 surfaces plus admin's `ConfigPage.tsx`, not audited here since
`ConfigPage.tsx` is in scope and worth a quick Phase 4 double-check against
this file's `inputStyle`).

## 8. Button

Primary/secondary button divergence is smaller on `staging` than the spec's
"two unrelated primary styles" suggests it will be once PR #69 is included:
today, `background: 'var(--acc)'` (white text) is the consistent primary
treatment (8 call sites), and `var(--s2)` + border is the consistent
secondary (e.g. `SettingsPage.tsx`'s Sync button). The "pale ambiguous
green Save" symptom was not found in current `staging` code — flag this as
likely introduced on the PR #67/#69 branches (their `RiskConfigForm`/
`LimitsPanel` additions) and worth a direct comparison once those merge,
rather than assuming it needs a fix on `staging`-only code today.

## 9. Empty state

`packages/ui/src/primitives/EmptyState.tsx` exists and is shared, but is a
single fixed layout (`message: string`, no icon, no action slot) — it
cannot express the spec's "icon + one-line message + optional action."
Grep found no inline duplicate empty-state divs bypassing it on `staging`,
which is good news: this is a pure additive change (extend the existing
component's props), not a consolidation problem.

## 10. Alert strip

Five inline warning/error blocks found (`ConfigPage.tsx`, `RatesDollarCard.
tsx`, `PortfolioDashboard.tsx`, `PortfolioPage.tsx`, `LevelCard.tsx`), each
its own `<div>` with its own severity-colored border/background chosen by
hand, plus the two identical-but-separately-typed error strips inside
`SettingsPage.tsx` noted in item 2. No shared component exists. Direct
Phase 3 candidate (3.10), and `SettingsPage.tsx`'s duplicate literal is a
quick two-line proof-of-value once `AlertStrip` exists.

## Summary for Phase 4 planning

Highest-leverage consolidations, in order of (evidence strength × reuse
payoff):
1. **Badge/Chip taxonomy** — 6 implementations, including one component
   (`ConvictionBadge`) duplicating data that already exists as tokens.
2. **DataTable header** — proven copy-paste drift between 2 tables already.
3. **DetailPane skeleton** — 2 existing instances + a 3rd (PR #69) about to
   be built by hand without one; highest cost-of-delay of any item here.
4. **SectionHeader** — 2 near-identical implementations, one of them
   documented in CLAUDE.md as if already shared.
5. **KpiCard, AlertStrip, FormRow, Button, EmptyState** — smaller/cheaper,
   mostly additive rather than reconciling active drift.

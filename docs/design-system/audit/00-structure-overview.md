# Design System Audit — Phase 1, Part 1: Structure & Styling Approach

Snapshot as of `staging` @ `a57f166` (2026-07-06). Scope: `apps/web`, `apps/admin`,
`packages/ui`, `packages/shared`. Does not include PR #67/#69 code (unmerged —
see CLAUDE.md top banner); their additions are called out separately at the end
so the migration plan (Phase 4) can account for them without re-auditing later.

## Monorepo shape

- pnpm workspace: `packages/*` + `apps/*` (`pnpm-workspace.yaml`).
- Two thin app shells (`apps/web`, `apps/admin`) consuming two shared packages:
  - `packages/shared` (`@stw/shared`) — pure framework-agnostic logic (types,
    formatting, tiers, P&L). **Does** already hold one real design-relevant
    source of truth: `packages/shared/src/constants/tiers.ts` (`TIERS`,
    `ACTION_VARS`) — CSS-var-based metadata maps for conviction tiers and
    action chips. This is the one place color semantics are centralized today,
    and it is under-used (see component report — `ConvictionBadge.tsx`
    reimplements this with literal hex instead of importing it).
  - `packages/ui` (`@stw/ui`) — shared React components/pages/hooks. 123 `.ts`/
    `.tsx` files total across the four workspaces; 47 of them in `packages/ui`.

## Styling technology

**Tailwind 3 + CSS custom properties — confirmed, matches CLAUDE.md.** No
CSS-in-JS library, no CSS Modules, no styled-components anywhere in the tree.

- `apps/web/tailwind.config.ts` and `apps/admin/tailwind.config.ts` are
  byte-identical. Both map a small semantic palette (`bg`, `surface`, `s2`,
  `border`, `bsub`, `text`, `t2`, `t3`, `acc`) straight to CSS vars, and both
  scan `../../packages/ui/src/**/*.{ts,tsx}` as content so Tailwind classes
  used inside the shared package are picked up by each app's own build.
- `apps/web/src/index.css` and `apps/admin/src/index.css` are byte-identical
  (`diff` confirms zero difference). Both hand-declare the same ~35 CSS custom
  properties under `:root` and `[data-theme="light"]` — colors (`--bg` …
  `--acc`), 6 tier color quads (`--c0`…`--c5`, each with base/bg/border/light),
  5 action-state pairs (`--new`, `--closed`, `--upsized`, `--trimmed`,
  `--hold`, each with a `-bg`), and one `--shadow`. **This file is the actual
  token source of truth today — but it exists in two copies, not one.** A
  change to a color must currently be made twice, in lockstep, with nothing
  enforcing that they stay in sync.
- Actual component styling is overwhelmingly **inline `style={{ }}` objects**,
  not Tailwind utility classes. Tailwind classes appear mainly for layout
  (flex/grid utilities) and a handful of text-size/rounded-corner utilities;
  every color, most spacing, and most typography values are set via inline
  style literals referencing the CSS vars (or, very often, raw literal hex —
  see the value inventory).

## Existing partial systems (per the spec's "consolidate, don't parallel" rule)

Three pockets of reusable UI already exist, none of them a formal design
system and none aware of the others:

1. **`packages/ui/src/primitives/`** — `EmptyState.tsx`, `LoadingSpinner.tsx`,
   `TickerLink.tsx`. Genuinely shared (imported across features), but tiny —
   3 components, and `EmptyState` is a single fixed string/no variants,
   nowhere near the spec's `EmptyState` (icon + message + optional action).
2. **`packages/ui/src/features/macro/components/macroVisuals.tsx`** — the
   most mature informal system in the repo. Exports `ModuleHeader` (section
   title + collapsible ⓘ help), `SourceNote`, `StatTile` (a KPI-tile), `
   SleeveSummary`, `TileGrid`, `scoreColor`. All tokens-only (no literal hex),
   reasonably consistent internally. But it is scoped to — and only imported
   by — the Macro feature; nothing outside `features/macro/` reuses it, and
   it isn't exported from `packages/ui`'s public surface.
3. **`SectionHeader`** — referenced by name in CLAUDE.md's "UI consistency"
   conventions as if it were a shared component ("Overview blocks share one
   header pattern... via `SectionHeader`"). In the actual code it is a
   **local, unexported function defined once inside
   `packages/ui/src/features/picks/components/PortfolioDashboard.tsx`** and
   used only by that file's four Overview blocks. It is not importable by
   any other feature. Its visual treatment (`fontSize: 10, fontWeight: 600,
   letterSpacing: '0.12em', uppercase`) is near-identical to `ModuleHeader`'s
   label style, but the two share no code.

**Net finding:** there is no gap to fill from scratch — `macroVisuals.tsx` and
`tiers.ts` are reasonable seeds for Phase 2/3 (tokens + `KpiCard`/
`SectionHeader`/badge taxonomy) and should be promoted/extended rather than
replaced. The CSS-var set in the duplicated `index.css` files is the right
color source of truth; Phase 2 should consolidate it into one file the two
apps both import (or one app-agnostic module in `packages/ui`), not invent a
parallel token file.

## Not yet in scope (PR #67 / #69, unmerged)

`git show` against `claude/portfolio-limits-redesign` and
`claude/week1-integrity-guardrails` confirms neither branch's new surfaces
exist on `staging` yet: `packages/ui/src/features/limits/` (LimitsPanel,
RiskConfigForm, ViolationsSummary), `RegimeLight`, and
`PortfolioPositionDetail.tsx` (the My Portfolio detail pane) are all
PR-only. Per CLAUDE.md's Current Status, PR #69 already surfaced some of
this audit's exact symptoms first-hand (3+ badge treatments, two unrelated
"primary button" styles). When Phase 3's components land, both PRs' pages
are strong candidates to be **rebuilt directly on the new components**
rather than restyled twice — flagged here so Phase 4's migration-order
proposal accounts for them explicitly.

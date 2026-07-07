# STW Companion — Design Token & Component System Consolidation

## Context

STW Companion is a pnpm monorepo web app (portfolio tracker tailing a Discord
stock-picking community). It has grown page-by-page and every page re-implements
shared concepts with different executions. Known symptom inventory from a visual
audit (Settings, My Portfolio, My Portfolio detail pane, Stock Picks admin,
Stock Picks detail pane):

- 3+ badge treatments for parallel concepts: green source chip ("STW"), purple
  basket tag ("Robotics + Edge AI"), orange text-only flags ("Mid-Term Caution"),
  gray text-only ("STW conviction 2") — same concept class, four renderings
- Status rendered inconsistently: pills ("OK", "BREACH", "Connected"), plain
  colored text ("ACKNOWLEDGED"), red inline prose ("1 breach")
- Section headers: green small-caps, gray small-caps, bold sentence case —
  varies by page
- Numerals: monospace in risk rows, proportional in KPI cards
- Two unrelated primary button styles (solid green "Save"/"Sync" vs. pale
  green "Save" that reads as disabled)
- Two different detail-pane skeletons (Stock Picks ADEA pane vs. My Portfolio
  BDC pane) for the same job
- KPI cards with inconsistent primary/secondary value placement
- Form rows in Settings with three different label/input/suffix alignments

## Your task — in strictly this order. STOP for my review at each checkpoint.

### Phase 1: Audit (read-only, no code changes)

1. Map the monorepo structure: apps, packages, where styles live (CSS modules,
   Tailwind config, styled-components, inline — whatever exists), and whether a
   shared UI package already exists in any form.
2. Produce an inventory of every hardcoded color, font-size, spacing value,
   border-radius, and shadow across the app code. Group by value and count
   occurrences (e.g., "#16a34a × 41, #15803d × 12, green-600 × 8 — likely all
   'the green'").
3. Produce a component duplication report: every place a KPI card, badge/chip,
   status indicator, data table, detail pane, section header, form row, button,
   empty state, or alert strip is implemented, with file paths. Flag near-
   duplicates that differ only in styling.
4. Output both reports as markdown files in `docs/design-system/audit/`.

**CHECKPOINT 1: Present the audit summary. Wait for my approval before Phase 2.**

### Phase 2: Design tokens

Create a tokens package (or module within the shared package): single source
of truth, consumable by the existing styling approach found in Phase 1 (if
Tailwind, extend the theme from the tokens file; do not maintain two sources).

Define:

1. **Color** — semantic, not literal. Required roles:
   - `surface` (page, card, inset, hover)
   - `border` (default, strong)
   - `text` (primary, secondary, muted, inverse)
   - `brand` (primary green + interaction states)
   - `status`: `positive`, `negative`, `warning`, `neutral`, `unevaluated`
     — each with `bg`, `border`, `text` variants for pill/chip use
   - `pnl.gain` / `pnl.loss` — distinct from status colors; P&L red-green must
     be reserved so status warnings don't visually collide with losses
   - Contrast requirement: all text tokens ≥ WCAG AA on their paired surfaces.
     The current muted-green small-caps headers and light-gray helper text fail;
     fix at the token level.
2. **Typography** — type scale (max ~6 sizes), weights, line heights. Explicit
   rule: `font-variant-numeric: tabular-nums` (or mono stack) for ALL numeric
   data in tables, risk rows, and KPI values; define a `numeric` text style.
3. **Spacing** — 4px-base scale. Named layout tokens for card padding, table
   row height, section gaps.
4. **Radii, shadows, borders** — one small set. Current app mixes at least
   three radii on cards alone.
5. **Motion** — durations/easings for pane slide-in, accordion, hover.

Deliverable: tokens source + a generated reference page in
`docs/design-system/tokens.md`.

**CHECKPOINT 2: Present the token set. Wait for approval before Phase 3.**

### Phase 3: Core component library

Build in a shared package (`packages/ui` or align with existing structure).
Every component consumes tokens only — zero literal color/size values.
Storybook or a simple internal `/design-system` route for visual review
(pick whichever the repo already leans toward; if neither, use a route —
lighter weight).

Build exactly these, in this order:

1. **StatusPill** — variants: `ok`, `near`, `breach`, `unevaluated`, `info`.
   `near` (amber) is new: fires at ≥80% of a limit. `unevaluated` (gray) is
   new: for missing data (e.g., unmapped sectors) — missing data is NOT a
   breach.
2. **Badge/Chip taxonomy** — four visually distinct types, one component with
   a `kind` prop:
   - `source` (trader chips: STW, future traders) — must support N traders,
     not hardcoded STW
   - `category` (baskets/themes)
   - `tier` (conviction tiers)
   - `flag` (cautions/warnings)
3. **KpiCard** — primary value, secondary value, label, optional
   delta/status accent. One layout rule for value placement, applied always.
4. **SectionHeader** — one treatment (small-caps, tokenized color), optional
   right-slot for actions/status.
5. **Button** — primary / secondary / ghost / destructive + disabled and
   dirty-state conventions. Kills the pale-green ambiguous Save.
6. **DataTable** — header style, row height, numeric column alignment
   (right + tabular-nums), sub-caption pattern (e.g., option leg descriptors),
   hover/selected states, empty state slot.
7. **DetailPane skeleton** — the ADEA-pane structure generalized: header row
   (ticker + name + badge strip), metric block (3-col), stacked section cards,
   standard close affordance. Both Stock Picks and My Portfolio panes will be
   instances of this.
8. **FormRow** — label / input / suffix on one aligned grid (fixes Settings).
9. **EmptyState** — icon + one-line message + optional action. Replaces
   paragraph-length "coming soon" prose.
10. **AlertStrip** — severity variants, dismissible, optional action link.
11. **SubNav** — the secondary tab bar from STW Admin (Portfolio Overview /
    Ticker Details / Trades pattern), extracted for reuse on My Portfolio.

**CHECKPOINT 3: Visual review of the component gallery. Wait for approval
before Phase 4.**

### Phase 4: Enforcement + migration prep (no page migrations yet)

1. Lint rules: block literal hex/rgb colors and raw px font-sizes in app code
   (allowlist the tokens package). ESLint + stylelint or Tailwind config
   restriction — match the stack.
2. `docs/design-system/CONTRIBUTING.md`: when to use which badge kind, status
   pill semantics (ok/near/breach/unevaluated definitions), numeric formatting
   rules (tabular-nums, sign display, currency abbreviation: $46.2K style),
   P&L color rules.
3. Migration order proposal with per-page effort estimates. Proposed order —
   validate against what the audit found: (1) Settings (smallest surface),
   (2) My Portfolio + its detail pane (biggest offender, and a planned
   redesign will land on the new components), (3) Stock Picks (closest to
   target already), (4) GEX Signals / Macro.
4. Update the repo SKILL.md / CLAUDE.md so future sessions build UI from
   `packages/ui` and tokens only.

**CHECKPOINT 4: Present migration plan. Page migrations are a separate
session.**

## Hard rules

- Do NOT restyle or migrate any existing page in this session. Foundation only.
- Do NOT introduce a new styling technology; extend what the repo uses.
- Every component prop that encodes a business concept (status, trader source,
  tier) must be an enum/union, not a free color prop — no `color="red"`
  escape hatches, or the system erodes immediately.
- If the audit reveals an existing partial system (a half-built theme, a
  constants file), consolidate into it rather than adding a parallel one.
- All docs output goes to `docs/design-system/`.

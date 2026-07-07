# STW Companion — Design System: Contributing

Phase 4 deliverable per [`plans/stw-design-system.md`](../../plans/stw-design-system.md).
This is the guide for **new code**. It does not describe how any existing page is
styled today — see [`docs/design-system/migration-plan.md`](migration-plan.md) for that.

## The golden rule

**New UI code consumes tokens and components only — never a literal color, px font-size,
or a hand-rolled badge/pill/table/modal.** Concretely:

- Colors: `var(--...)` from [`packages/ui/src/styles/tokens.css`](../../packages/ui/src/styles/tokens.css) (status/pnl/surface/border/text roles), or a component from `packages/ui/src/primitives/`.
- Non-color scales (spacing, radius, shadow, motion, breakpoint, type scale): `SPACE`,
  `RADIUS`, `SHADOW`, `DURATION`/`EASING`, `BREAKPOINT`, `FONT_SIZE`/`FONT_WEIGHT`/
  `LETTER_SPACING`/`NUMERIC_STYLE` from `@stw/shared` (`packages/shared/src/constants/tokens.ts`).
- A recurring visual pattern (badge, status pill, table, modal, detail pane, form row,
  empty state, alert, sub-nav, icon) — reach for the matching component in
  `packages/ui/src/primitives/` before writing new JSX for it. If nothing fits, that's
  a real gap — raise it rather than writing a sixth ad hoc version (see how Phase 3 got
  Phase 4-side pressure-tested against the Phase 1 audit for what "a real gap" looks like).

This is enforced by lint, not just convention — see [Enforcement](#enforcement) below.

## Component guide

### StatusPill

Six variants, each a fixed semantic — do not repurpose one to mean something it doesn't:

| Variant | Meaning | Do NOT use for |
|---|---|---|
| `ok` | The thing being evaluated is fine right now | A default/no-data state (`unevaluated`) |
| `near` | ≥80% of a limit/threshold — a warning about to become a breach | Any other kind of caution (use `Badge kind="flag"` for a narrative caution like "Mid-Term Caution") |
| `breach` | A limit has actually been exceeded | "This is broken" (that's an `AlertStrip severity="negative"`, a bigger, more prominent unit) |
| `unevaluated` | Data needed to evaluate this is missing (e.g. an unmapped sector) | A breach — **missing data is explicitly not a breach**, don't let it read as one |
| `info` | Neutral informational status | — |
| `neutral` | An inactive/steady state that isn't being evaluated at all (e.g. "Not connected", a flat bias reading) | `unevaluated` (that's "should have data, doesn't" — `neutral` is "there's nothing to evaluate here by design") |

`StatusPill` is for a single evaluative state word. If you need a fuller explanation with
an icon and more room, that's `AlertStrip`, not a `StatusPill` with a long label.

### Badge

One component, five `kind`s — pick by what the chip actually represents, not by what
color it happens to need:

| `kind` | Represents | Color source | Example |
|---|---|---|---|
| `source` | Which trader/analyst this call came from | fixed brand green (works for any trader name you pass — never hardcode a single trader) | `<Badge kind="source" trader="STW" />` |
| `category` | A basket/theme/sector | `bColor()` — the shared per-basket hex map | `<Badge kind="category" category="Nuclear" />` |
| `tier` | Conviction level 0–5 | `TIERS` from `@stw/shared` | `<Badge kind="tier" tier={5} />` |
| `flag` | A narrative caution/warning that isn't a limit breach | `status.warning`/`status.negative` via `tone` | `<Badge kind="flag" label="Mid-Term Caution" />` |
| `action` | A transaction lifecycle event (New/Upsized/Trimmed/Closed) | `ACTION_VARS` from `@stw/shared` | `<Badge kind="action" action="Upsized" />` |

If you're tempted to add a `color` prop to force a one-off shade: don't. That's exactly
the escape hatch the spec forbids — if a real 6th concept shows up, it gets a 6th `kind`
with its own token source, not a free color prop.

### KpiCard

One value-placement rule, always: label (small-caps, muted) → primary value (large,
`status`-colored) → optional secondary value beside it → optional delta below. Don't
invent a second layout for "a KPI with slightly different data" — reshape the data to
fit the one layout (see `PortfolioDashboard.tsx`'s three stat cards for the pattern this
generalizes).

### SectionHeader

One treatment: uppercase small-caps title, optional colored (for an attention state, e.g.
`color="var(--c3)"`), optional right-aligned slot. The right slot is generic —
compose an "Updated: …" stamp, an action button, or a `StatusPill` into it; don't add a
dedicated prop per use case.

### Button

Four variants, chosen by semantic weight, not by "what looks right here":

- `primary` — the one main action of this form/row. Always solid `--acc` fill,
  `--text-inverse` text. **Never** make a primary look disabled-but-clickable by
  lowering its opacity as a design choice — use the real `disabled` prop, which already
  dims it consistently.
- `secondary` — a real but non-primary action (e.g. "Sync" beside "Save").
- `ghost` — a low-emphasis/tertiary action (e.g. "Cancel").
- `destructive` — an action that deletes or removes something. Not for a real-money
  broker order — see the note below.

Use `dirty` (paired with `disabled={!dirty}`) on a Save button that should look inert
until there's something to save.

**A real-money/broker action is not a `Button` variant.** Per CLAUDE.md's standing rule,
give it its own solid, distinct color (the existing IBKR order flow uses a solid dark
green, deliberately different from both `primary`'s brand green and `destructive`'s red)
so it can never be mistaken for either at a glance.

### DataTable

Generic `columns`/`rows` table. Mark a numeric column with `numeric: true` — it gets
right-alignment and `tabular-nums` for free; don't hand-roll that pairing again. Use
`subCaption` for a secondary line under a cell's primary content (e.g. an option leg
descriptor under its ticker) instead of stuffing two lines into one `render`.

### DetailPane + ListDetailSplit

Two separate concerns, meant to be used together:
- `DetailPane` is the **visual skeleton** — header (title/subtitle/badges), a 3-column
  metric block, a close button, then your stacked section content as `children`.
- `ListDetailSplit` is the **responsive behavior** — desktop resizable split, mobile
  full-screen swap. Any list+detail surface (Stock Picks, My Portfolio, future ones)
  should compose `<ListDetailSplit list={...} detail={selected && <DetailPane .../>} />`
  rather than re-deriving the split/swap logic by hand (this was hand-copied once already
  before `ListDetailSplit` existed — see the audit).

### FormRow + TextInput

`FormRow` is layout-only (label/prefix/input/suffix/hint on one aligned grid); it does
not render an input itself, so it works with a `<select>` or a custom control too. For a
plain text/password/number/date input, use `TextInput`, not a raw `<input style={...}>` —
`TextInput` is the fix for a real keyboard-accessibility bug (see
[Enforcement](#enforcement)): it pairs `focus:outline-none` with a visible focus border,
never removes the outline without a replacement.

```tsx
<FormRow label="Flex Token" hint="Stored server-side, never exposed in the browser.">
  <TextInput placeholder="Paste your token" />
</FormRow>
```

### EmptyState

Icon + one-line message + optional action link. Not a place for paragraph-length
"coming soon" prose — if you need more explanation than one line, that content belongs
in the surrounding page copy, not the empty state itself.

### AlertStrip

Four severities (`info`/`positive`/`warning`/`negative`), left-accent bar, optional
dismiss and action link. This is the "something happened, here's what and maybe what to
do" unit — bigger and more persistent than a `StatusPill`. Don't use it for a single
evaluative word; that's `StatusPill`.

### SubNav

The secondary tab-bar pattern (Portfolio Overview / Ticker Details / Trades). Generic
`items`/`active`/`onChange` — any list+detail-style page's own tab row should use this
instead of a bespoke `tabBtn` function.

### Modal

Always vertically centered, always the same backdrop (`OVERLAY.backdrop`), always
`Z_INDEX.modal`. **There is no `align="top"` escape hatch** — CLAUDE.md's own documented
rule says every modal centers, and this component exists specifically because two
existing modals had drifted from that rule (one of them the file CLAUDE.md itself cited
as "the canonical version"). If a form is genuinely too tall to center well, that's a
product conversation about the form, not a reason to reintroduce a top-aligned variant.
Pick a `width` from the named scale (`sm`/`md`/`lg`) — never a new `maxWidth` number.

### Icon

A thin `lucide-react` wrapper, scoped to the names this library's own components need
(`info`/`positive`/`warning`/`negative`/`close`/`up`/`down`/`flat`). Use it instead of
typing a Unicode glyph (→ ✓ ⚠ ✕ etc.) in new code — Unicode glyphs have no `aria-label`,
so a screen reader gets unlabeled raw text. If you need a name that isn't in the list,
add it to `ICONS` in `Icon.tsx` rather than falling back to a Unicode character; `lucide-
react` almost certainly already has it.

## Numeric formatting rules

- **Tabular numerals everywhere numeric data renders** (tables, risk rows, KPI values):
  spread `NUMERIC_STYLE` into the element's style, or use a component that already does
  (`KpiCard`, `DataTable`'s `numeric: true` columns).
- **Sign display**: a percentage or delta always shows an explicit `+` for non-negative
  values, never a bare number — `formatPct()` in `@stw/shared` already does this
  (`+4.2%`, `-6.1%`); use it rather than hand-formatting a sign.
- **Currency abbreviation** ($46.2K style): values ≥ $1,000 should abbreviate to one
  decimal with a `K`/`M` suffix (`$46.2K`, `$1.2M`), never a full comma-grouped number in
  a dense UI context (KPI cards, table cells). **No shared formatter for this exists
  yet** — `packages/shared/src/utils/format.ts` only has `formatPct`/`formatDate`/
  `formatWeight`/`fmtDateTime`. Add a `formatCurrency`/`formatMoney` helper there,
  following this convention, the first time a real consumer needs it (e.g. a portfolio
  market-value KPI) — don't write it speculatively before something calls it.

## P&L color rules

- Gains always read `var(--pnl-gain)`; losses always read `var(--pnl-loss)`. **Never**
  `var(--acc)`/`var(--c1)` directly, even though they resolve to the same values today —
  the P&L tokens are a reserved, distinct identity so a future brand-color change can't
  silently redefine what a gain looks like (see `docs/design-system/tokens.md`).
- **Never a literal hex** (`#16A34A`, `#DC2626`, etc.) for P&L color — three existing
  files still do this and it's a live dark-mode bug, not a style nit (see
  [`docs/design-system/audit/04-additional-inconsistencies.md`](audit/04-additional-inconsistencies.md#2-pl-color-literals--a-real-dark-mode-bug-not-just-inconsistency)).
  Migrating those three files is tracked in the [migration plan](migration-plan.md).
- The one sanctioned exception: `GexChart.tsx`'s `lightweight-charts` candlestick colors,
  which is a canvas library that cannot consume CSS custom properties and needs literal
  color strings at chart-construction time. Don't "fix" this one — it's a real technical
  constraint, not an oversight (same file should still ideally read
  `getComputedStyle(...).getPropertyValue('--acc')` once at chart-init so a theme toggle
  restyles it too, but that's a smaller, separate improvement).
- A second sanctioned exception, same shape: `LoginPage.tsx`'s "Continue with Google"
  icon uses Google's 4 official brand colors (`#4285F4`/`#34A853`/`#FBBC05`/`#EA4335`).
  These are an external brand mark, not an STW design choice — there's no var() for
  "Google's blue" that would make sense in this app's own token file, and theming them
  to match STW's palette would misrepresent someone else's logo. Left as literals,
  permanently suppressed in `eslint-suppressions.json` the same way as `GexChart.tsx`
  (found + decided during the Layout/LoginPage/IbkrBadge sweep, 2026-07-07 — the STW
  logo mark elsewhere in the same file/in `Layout.tsx` is NOT exempt and was migrated
  onto `var(--acc)`/`var(--surface)`/the new `--logo-mic-*` tokens; only the Google
  icon's own colors are the exception).

## Enforcement

`eslint.config.mjs` (repo root) blocks two things repo-wide, matching exactly what the
Phase 1 audit found at scale — literal hex/rgb color values and raw numeric `fontSize`s
— in any `.ts`/`.tsx` file under `apps/**` or `packages/**`:

```bash
pnpm lint
```

This repo had no lint tooling before Phase 4. Introducing the rule against a codebase
that already had ~419 violations (the audit's own tally: 48 distinct hex colors, 348
inline font-size literals) would either block every unrelated future commit or get
disabled outright — neither is useful. Instead, **`eslint-suppressions.json`** (repo
root, committed) is a baseline snapshot of every violation that existed the day this rule
shipped, one count per file. `pnpm lint` only fails on a violation **not** already in
that baseline — i.e., **new** literal colors/font-sizes in new or existing code fail
immediately; the pre-existing debt does not, until it's migrated.

**When you migrate a file off literal colors/font-sizes** (per the
[migration plan](migration-plan.md) or otherwise), run:

```bash
pnpm lint:prune
```

This shrinks or removes that file's baseline entry to match reality, and **fails on
purpose** if you haven't (a plain `pnpm lint` errors with "suppressions left that do not
occur anymore" once a file's real violation count drops below its baseline — that's the
tool telling you to prune, not a false alarm). Commit the updated
`eslint-suppressions.json` alongside your migration change — its shrinking file-by-file
is a live, objective progress record for the migration, not just a lint artifact.

**Two sanctioned literal-color files are permanently exempt** (in `eslint.config.mjs`'s
`ignores`), not "pending migration": `packages/shared/src/constants/tiers.ts` and
`constants/baskets.ts` are the actual token-source files for their respective color
domains, and `constants/tokens.ts` legitimately defines `OVERLAY.backdrop`/
`SHADOW.modal` as literal `rgba()` strings — these are consumed by `var(...)` /
imported-constant everywhere else, so their own definitions are supposed to be literals.
Do not add these three files' entries to `eslint-suppressions.json` even if pruning
touches them incidentally — they should never appear there since they're excluded from
linting entirely, not merely suppressed.

The rule intentionally covers only what the spec asked for (color, font-size) — it does
not yet check spacing/radius/letter-spacing against `SPACE`/`RADIUS`/`LETTER_SPACING`, or
flag `outline: 'none'` without a focus replacement (see the audit's accessibility
finding — the fix there is "use `TextInput`", not a lintable AST pattern). Broaden the
rule only if a specific new drift shows up with real evidence, the same bar the original
two rules were held to.

## Extending the system

- If you find a real new concept that doesn't fit an existing `kind`/`variant`, add a
  case to the existing component (like `Badge`'s `action` kind or `StatusPill`'s
  `neutral` variant were added post-Phase-3) — never start a parallel one-off component.
- If you need a new token, add it to the existing token files
  (`packages/ui/src/styles/tokens.css` for colors, `packages/shared/src/constants/
  tokens.ts` for everything else) — never a second token module, a Tailwind theme
  extension that duplicates an existing key, or a hardcoded value "just this once."
- Visual review lives at `/design-system` in the admin app
  (`packages/ui/src/primitives/DesignSystemGallery.tsx`) — add a section there for any
  new component or variant so it's visible without hunting through a real page.

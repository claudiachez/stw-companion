# STW Companion — Design Tokens Reference

Phase 2 deliverable per [`plans/stw-design-system.md`](../../plans/stw-design-system.md).
Source files:
- **Color** (CSS custom properties, for runtime dark/light theme switching):
  [`packages/ui/src/styles/tokens.css`](../../packages/ui/src/styles/tokens.css)
  — now the single file both apps' `index.css` import, replacing two
  byte-identical hand-maintained copies (see
  [audit doc 00](audit/00-structure-overview.md)).
- **Everything else** (spacing, radius, shadow, motion, breakpoint, z-index,
  type scale — plain values, since these don't need to react to theme):
  [`packages/shared/src/constants/tokens.ts`](../../packages/shared/src/constants/tokens.ts),
  exported from `@stw/shared`.

Verified in-browser (dark + light) via `apps/web`'s login page — see
end-of-phase verification note at the bottom of this doc.

## ⚠️ Two decisions in here need your explicit sign-off, not just a skim

This checkpoint is exactly the point to push back on either of these before
Phase 3 builds on top of them.

1. **`--t3` (muted/tertiary text) changed value in both themes**, to fix a
   real WCAG AA contrast failure the spec named directly. Dark:
   `#525252` → `#808080`. Light: `#6b916b` → `#527052`. This is not a new
   token — it's the existing variable every current `var(--t3)` consumer
   already uses (SectionHeader/ModuleHeader labels, helper text, timestamps,
   muted table cells), so **every one of those gets visibly lighter (dark
   theme) automatically, with no page code touched.** See §Color below for
   the exact contrast math. If you'd rather land this separately from the
   rest of Phase 2, or want a different exact shade, say so now — it's one
   line to change or revert.
2. **The type scale collapses 14 observed pixel values into 6 named sizes**,
   and picking which values fold into which bucket is a judgment call (see
   §Typography). This doesn't touch any existing component yet — nothing
   currently imports `FONT_SIZE` — but Phase 4's migration plan will
   eventually move existing `fontSize: 13` (etc.) call sites onto whichever
   bucket this scale assigns them to, so it's worth checking the buckets
   feel right before that happens.

Everything else in this doc is purely additive: new token names, zero
change to any already-rendered pixel.

## Color

All color tokens are CSS custom properties in `packages/ui/src/styles/tokens.css`,
switched by `[data-theme="light"]` on `<html>` (default: dark). Both apps'
`tailwind.config.ts` also expose the new roles as Tailwind color classes
(`bg-surface-hover`, `text-pnl-gain`, etc.) for any component that wants them
via Tailwind rather than `var(--...)` in an inline style.

### Existing tokens (unchanged values, just now defined once)

| Token | Dark | Light | Role |
|---|---|---|---|
| `--bg` | `#0a0a0a` | `#f5faf5` | page background |
| `--surface` | `#111111` | `#ffffff` | card background |
| `--s2` | `#1a1a1a` | `#edf6ed` | secondary surface (nested panels, table headers) |
| `--border` | `#2a2a2a` | `#cce5cc` | default border |
| `--bsub` | `#1f1f1f` | `#e0f0e0` | subtle divider |
| `--text` | `#f0f0f0` | `#0a0a0a` | primary text |
| `--t2` | `#a0a0a0` | `#2d4a2d` | secondary text |
| `--acc` | `#22c55e` | `#16a34a` | brand green |
| `--c0`…`--c5` (+`bg`/`b`/`l` each) | tier colors | tier colors | conviction tiers (Legacy → Highest) |
| `--new`/`--closed`/`--upsized`/`--trimmed`/`--hold` (+`-bg` each) | action colors | action colors | transaction-action badges |
| `--shadow` | `0 1px 3px rgba(0,0,0,0.5)` | `0 1px 3px rgba(0,0,0,0.08)` | card elevation |

### `--t3` — changed (see sign-off note above)

| | Old | New | Contrast vs. `--bg` | Contrast vs. `--surface` |
|---|---|---|---|---|
| Dark | `#525252` | **`#808080`** | 2.53:1 → 5.01:1 | 2.41:1 → 4.78:1 |
| Light | `#6b916b` | **`#527052`** | 3.38:1 → 5.24:1 | (surface is white, higher still) |

WCAG AA requires 4.5:1 for normal-weight text this size (10px bold uppercase
labels don't meet the "large text" 3:1 exception). Both old values failed;
both new values pass with margin against the two backgrounds `--t3` is
actually used on (bare page background and card surfaces).

### New: surface / border / text-inverse

| Token | Dark | Light | Role |
|---|---|---|---|
| `--surface-hover` | `#242424` | `#e3f2e3` | hover state for a card/row |
| `--surface-inset` | `var(--bg)` | `var(--bg)` | recessed surface (input fields inside a card) — formalizes the existing convention (`SettingsPage.tsx`'s inputs already use `--bg` this way) rather than inventing a new value |
| `--border-strong` | `#3a3a3a` | `#a8d1a8` | a more prominent border (vs. default `--border`) |
| `--text-inverse` | `#ffffff` | `#ffffff` | text on a filled colored button — formalizes ~15 existing literal `#fff`/`'white'` occurrences and CLAUDE.md's "white text on green, never black" rule |

### New: `pnl.gain` / `pnl.loss`

| Token | Dark | Light |
|---|---|---|
| `--pnl-gain` | `var(--acc)` (`#22c55e`) | `var(--acc)` (`#16a34a`) |
| `--pnl-loss` | `var(--c1)` (`#ef4444`) | `var(--c1)` (`#dc2626`) |

Same color as brand green / tier-1 red today, but a **distinct token
identity** per the spec's explicit requirement — a future brand-color change
shouldn't silently also redefine "what a gain looks like." This is also the
named fix for [the P&L color bug in audit doc 04](audit/04-additional-inconsistencies.md#2-pl-color-literals--a-real-dark-mode-bug-not-just-inconsistency):
`HoldingRow.tsx`/`HoldingDetail.tsx`/`SignalsTable.tsx` currently hardcode
the light theme's exact hex (`#16A34A`/`#DC2626`) regardless of active
theme. That fix is a follow-up page change (out of scope this phase, per
"no migration yet"), but the correct token now exists for it to land on.

### New: `status.*` (for Phase 3's `StatusPill`/`Badge`)

| Role | `bg` | `border` | `text` | Built from |
|---|---|---|---|---|
| `positive` | `--c5bg` | `--c5b` | `--c5` | existing tier-5 green |
| `warning` | `--c3bg` | `--c3b` | `--c3` | existing tier-3 amber |
| `negative` | `--c1bg` | `--c1b` | `--c1` | existing tier-1 red |
| `info` | `--c4bg` | `--c4b` | `--c4` | existing tier-4 blue |
| `neutral` | `--s2` | `--border` | `--t2` | plain surface tokens |
| `unevaluated` | `--s2` | `--border` | `--t3` | plain surface tokens (deliberately *not* a tier color — spec: "missing data is NOT a breach," and a status pill should never look like a conviction-tier badge) |

`near` (the spec's ≥80%-of-limit amber state) uses the same `warning` triple
— there's no visual difference between "warning" and "near a limit" at the
token level; `StatusPill` can name the variant `near` in Phase 3 while
pointing at these same three CSS vars.

## Typography

`packages/shared/src/constants/tokens.ts`: `FONT_SIZE`, `FONT_WEIGHT`,
`LETTER_SPACING`, `LINE_HEIGHT`, `NUMERIC_STYLE`.

| Token | Value | Replaces (from [audit doc 01](audit/01-style-value-inventory.md)) |
|---|---|---|
| `FONT_SIZE['2xs']` | 10px | collapses inline `9`/`10` (badges, uppercase labels, table headers) |
| `FONT_SIZE.xs` | 11px | dense secondary text |
| `FONT_SIZE.sm` | 12px | dense primary text — the single most common inline size (107 occurrences) |
| `FONT_SIZE.base` | 14px | collapses inline `13`/`14` (emphasis, buttons, form labels) |
| `FONT_SIZE.lg` | 18px | collapses inline `16`/`17`/`18` (section/page sub-headings) |
| `FONT_SIZE.display` | 26px | collapses inline `20`/`22`/`26`/`28` (KPI hero numbers) — the widest single bucket; if a specific KPI's 20px/28px really needs to read as visually distinct from another's 26px, flag it in Phase 4 rather than assuming this bucket is exactly right |
| `FONT_SIZE.input` | 16px | added Phase 5 (Settings migration) — `<input>` only, sourced from the pre-migration `SettingsPage.tsx`'s own literal `fontSize: 16` comment: mobile Safari zooms the viewport on focus for any input under 16px. Not a visual-rhythm bucket like the rest of the scale — a browser-behavior floor. `TextInput.tsx` is the only consumer; never use it for non-input text. |
| `FONT_WEIGHT.medium/semibold/bold` | 500/600/700 | already consistent (600/700 dominate) — just named |
| `LETTER_SPACING.label` | `0.08em` | collapses 8 distinct inline values, all serving the same uppercase-label intent |
| `NUMERIC_STYLE` | `{ fontVariantNumeric: 'tabular-nums' }` | already in wide, consistent use (dozens of call sites) — this just gives it one importable name instead of retyping the object literal each time |

**Not added to either Tailwind config's `xs`/`sm`/`base`/`lg` keys** —
Tailwind's own defaults for those names (12/14/16/18px) differ slightly from
the values above, and 51 existing `text-xs`/`text-sm`/`text-lg` Tailwind
class call sites already render with Tailwind's defaults. Redefining those
keys would have silently changed already-shipped pages by ~1-2px, which this
phase must not do. Only the two genuinely new sizes (`2xs`, `display`) were
added to Tailwind's `fontSize` theme, as `text-2xs`/`text-display` — nothing
currently uses either class name, so this is a pure addition.

## Spacing

`SPACE` in `packages/shared/src/constants/tokens.ts` mirrors Tailwind's own
*default* spacing scale (already shipped, already unused — see
[audit doc 01](audit/01-style-value-inventory.md)'s finding that ~39 distinct
inline padding combinations exist with no scale). Rather than inventing a
parallel scale, this just exposes the same numbers Tailwind already has as
plain JS values, so inline-`style` code (the dominant pattern in this
codebase) can reference `SPACE[2]` (`=8`) instead of typing `8` from memory
— same source as a Tailwind `gap-2` class, without requiring a page to
switch to Tailwind classes to get a shared value.

| Key | px | Key | px | Key | px |
|---|---|---|---|---|---|
| `0` | 0 | `2` | 8 | `4` | 16 |
| `0.5` | 2 | `2.5` | 10 | `5` | 20 |
| `1` | 4 | `3` | 12 | `6` | 24 |
| `1.5` | 6 | `3.5` | 14 | `8` | 32 |

(Full set incl. `7`, `10`, `12`, `16` in the source file.)

## Radius, shadow, border

| Token | Value | Replaces |
|---|---|---|
| `RADIUS.sm` | 2px | |
| `RADIUS.DEFAULT` | 4px | |
| `RADIUS.md` | 6px | 8 distinct ad hoc inline values (2,3,4,5,6,8,10,12) + 4 Tailwind classes, per [audit doc 01](audit/01-style-value-inventory.md) |
| `RADIUS.lg` | 8px | |
| `RADIUS.xl` | 12px | |
| `RADIUS.full` | 9999px | |
| `SHADOW.card` | `var(--shadow)` | already-consistent card elevation (6 existing call sites) |
| `SHADOW.modal` | `0 12px 40px rgba(0,0,0,0.5)` | names the ad hoc value 2 modals already used independently |

`RADIUS`'s values are identical to Tailwind's own defaults (verified against
`tailwindcss/defaultTheme.js`) — both `tailwind.config.ts` files re-declare
them from this token purely so the number has one named source, not because
the rendered pixel value changes.

## Motion

| Token | Value | Note |
|---|---|---|
| `DURATION.fast` | 150ms | already the dominant value (7 of 8 transition literals found in the audit) |
| `DURATION.slow` | 400ms | names the one outlier (a width/resize transition) — worth a look in Phase 4 to confirm it's deliberately slower, not just picked by eye |
| `EASING.standard` | `ease` | |

## Breakpoint

| Token | Value | Note |
|---|---|---|
| `BREAKPOINT.mobile` | 640px | `useIsMobile()`'s existing default — the hook now imports this constant instead of a bare `640` literal, so this is the actual source of truth, not just documentation of it |
| `BREAKPOINT.minSupportedWidth` | 390px | names the Ground Rules' "design for ≤390px first" floor as a distinct number from the 640px layout-mode switch point — these were never reconciled in writing before (see [audit doc 03](audit/03-responsive-mobile-conventions.md)) |

Also added to both `tailwind.config.ts`s as a new `mobile:` responsive
variant (`screens.mobile`) — unused by any existing class today, a pure
addition.

## Z-index

| Token | Value |
|---|---|
| `Z_INDEX.dropdown` | 10 |
| `Z_INDEX.sticky` | 100 |
| `Z_INDEX.modal` | 1000 |

`modal` matches all 5 existing modal instances exactly (already perfectly
consistent, per audit doc 03) — named for documentation value, not because
anything needed fixing.

## Modal width

| Token | Value |
|---|---|
| `MODAL_WIDTH.sm` | 420px |
| `MODAL_WIDTH.md` | 480px |
| `MODAL_WIDTH.lg` | 520px |

Names the 3 distinct ad hoc modal `maxWidth` values found in
[audit doc 03](audit/03-responsive-mobile-conventions.md), ahead of Phase
3's `Modal` component (added to the spec's component list based on that
doc's findings — backdrop color is already consistent, but vertical
alignment is a real 2-vs-3 split worth fixing when `Modal` is built).

## What changed in existing files (and what didn't)

- `apps/web/src/index.css` / `apps/admin/src/index.css`: reduced from ~80
  lines of duplicated variable definitions to a 3-line `@import` of
  `packages/ui/src/styles/tokens.css` (which must precede `@tailwind` —
  CSS drops an `@import` that isn't a stylesheet's first rule, caught during
  in-browser verification below).
- `apps/web/tailwind.config.ts` / `apps/admin/tailwind.config.ts`: added the
  new semantic color keys, the two new font-size keys, the `mobile` screen,
  and pinned `borderRadius` to `RADIUS` (identical values to Tailwind's
  existing defaults — confirmed against `tailwindcss/defaultTheme.js`
  before changing, specifically to avoid an accidental visual diff).
- `packages/ui/src/hooks/useIsMobile.ts`: default parameter now reads
  `BREAKPOINT.mobile` instead of a bare `640`. Identical runtime behavior.
- **No component/page file changed.** `pnpm -r typecheck` and `pnpm -r test`
  (152 tests, `@stw/shared`) both pass unmodified.

## In-browser verification

Ran `apps/web` locally (`preview_start`), screenshotted the login page (no
auth needed) in both themes:
- Dark: background/card/button/input colors all resolve correctly;
  `getComputedStyle(document.documentElement)` confirmed `--t3: #808080`,
  `--acc: #22c55e`, `--pnl-gain: #22c55e`, `--surface-hover: #242424` etc.
  all live.
- Light (`data-theme="light"` set manually): same check, correct green-
  tinted palette, no washed-out or missing colors.
- No console errors, no failed network requests.
- **Caught and fixed one real bug in this process**: the initial `@import`
  was placed after the `@tailwind` directives in both `index.css` files,
  which is invalid CSS ordering — an `@import` that isn't a stylesheet's
  first rule is silently dropped, so the first render showed an unstyled
  page (white background, black borders, no theme at all). Moving `@import`
  above `@tailwind` in both files fixed it; re-verified after the fix.

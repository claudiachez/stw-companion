# Design System Audit — Phase 1, Part 5: Additional Inconsistencies

A second, more adversarial pass looking specifically for things the first
three docs' category-by-category sweep could miss: icons, the actual P&L
color values (not just the badge/table/button treatments around them),
focus/accessibility, z-index, and motion. Two of these are more than
cosmetic — flagged as such below. Same scope/branch as the other docs.

## 1. Icons — zero componentization, two unrelated authoring mechanisms

No icon library is installed anywhere in the workspace (`grep` for `lucide`,
`heroicons`, `react-icons` across all three `package.json`s: nothing).
Icons are produced two ways, with no shared code in either:

- **Unicode/emoji glyphs typed directly into JSX strings**: 90 occurrences
  across ~13 distinct characters (`→` ×41, `↑` ×9, `↓` ×8, `✎` ×5, `⚠` ×5,
  `✓` ×4, `▼`/`▲` ×4 each, `✕` ×3, `★` ×2, `●` ×2, `⬇`/`◷`/`←` ×1 each). No
  wrapper component, no `aria-label`s on any of them — a screen reader hits
  these as raw Unicode text ("right arrow", "black star", etc. depending on
  the reader), not a labeled icon.
- **Hand-copied inline `<svg>` markup**: 4 files (`LoginPage.tsx`'s Google
  logo, `SourceLink.tsx`'s external-link glyph, `Layout.tsx`'s 6 nav/theme
  icons + the STW logo, `PortfolioPage.tsx`'s 2 eye/eye-off icons). All of
  these (excluding the Google logo and the STW logo, which are legitimately
  one-off brand marks) are drawn in the same stroke-based style
  (`stroke="currentColor" strokeWidth="2" strokeLinecap="round"`,
  `viewBox="0 0 24 24"`) — recognizably the same open-source icon set
  (Feather Icons / what `lucide-react` ships today, since lucide is Feather's
  maintained fork with mostly-identical path data). **The art style is
  already consistent; the code isn't** — every icon is copy-pasted raw path
  data at one of 3 different sizes (12px `SourceLink`, 15px most of
  `Layout.tsx`, 16px `Layout.tsx`'s last one and both of `PortfolioPage.tsx`'s)
  with no shared `Icon` component and no single place to add a new icon
  without hand-tracing more SVG path data.

**Recommendation for Phase 2/3**: this is a strong candidate to adopt
`lucide-react` (small, tree-shakeable, same visual language already in use)
rather than inventing an `Icon` primitive from scratch — it would directly
replace the 4 files' hand-copied SVGs with an import, and give Phase 3 a
real icon system to reference when building `AlertStrip`/`StatusPill`/etc.
severity glyphs instead of falling back to more Unicode characters.

## 2. P&L color literals — a real dark-mode bug, not just inconsistency

CLAUDE.md's own convention states `pnl.gain`/`pnl.loss` should be
distinct, reserved tokens (this is also explicit in
`plans/stw-design-system.md`'s Phase 2 spec). Checking what color is
actually used for "gain" green across the app:

| File | Green value used |
|---|---|
| `TradesTable.tsx` (`pnlCell`, 2 call sites) | `var(--acc)` — correctly theme-aware |
| `HoldingRow.tsx` (2 call sites) | **`'#16A34A'`** — a literal hex |
| `HoldingDetail.tsx` (7 call sites) | **`'#16A34A'`** — a literal hex |
| `SignalsTable.tsx`'s `VCOLS` map | **`'#16A34A'`** — a literal hex |

`#16A34A` is not an arbitrary shade someone picked — **it is the exact
value of `--acc` in the `[data-theme="light"]` block of `index.css`**
(`apps/web/src/index.css:56`, `--acc: #16a34a;`). The dark theme (the
app's default, per CLAUDE.md — "Default theme: Dark") defines `--acc` as
`#22c55e` instead. So `HoldingRow.tsx`, `HoldingDetail.tsx`, and
`SignalsTable.tsx` are **hardcoding the light-theme green into components
that render in dark mode by default** — meaning right now, today, with no
theme toggle involved, a position's P&L text in `HoldingDetail`/`HoldingRow`
renders a visibly different, dimmer green than every badge/pill elsewhere
in the app that correctly reads `var(--acc)`. (Same story for the loss red:
`#DC2626` is the light theme's `--c1`, vs. dark's `#ef4444`.) This is the
single highest-priority literal-color fix in the whole audit — not a
"someday, tokenize this" item, an active visual bug in the default theme.

**One legitimate, narrower exception**: `GexChart.tsx`'s candlestick
`upColor`/`downColor`/`borderUpColor`/etc. also hardcode `#22C55E`/`#EF4444`/
`#16A34A`/`#DC2626`, but that's the `lightweight-charts` canvas library,
which cannot consume CSS custom properties — it needs literal color
strings passed to its JS API at chart-construction time. That part is a
real technical constraint, not an oversight. It should still ideally
resolve `getComputedStyle(...).getPropertyValue('--acc')` once at
chart-init (so a theme toggle would restyle the chart too), but that's a
smaller, lower-priority gap than the plain-DOM `style` props in
`HoldingRow`/`HoldingDetail`/`SignalsTable`, which have zero excuse.

## 3. Focus/keyboard accessibility — inconsistent by authoring mechanism

This tracks the same Tailwind-class-vs-inline-style split already found for
buttons (report #02, item 8), but with a real accessibility consequence
this time rather than just a visual one:

- **Tailwind-class inputs** (`LoginPage.tsx` ×2, `UsersPage.tsx`,
  `ConfigPage.tsx`'s `rowInput`) all pair `focus:outline-none` with
  `focus:border-acc` — the browser's default focus ring is removed, but a
  visible border-color change on focus replaces it. This is a reasonable,
  accessible pattern.
- **Inline-style inputs** (`SettingsPage.tsx`'s `inputStyle`,
  `FilterBar.tsx`, `TradesFilterBar.tsx`, `PortfolioFilterBar.tsx` — 4
  files) set `outline: 'none'` as a plain inline style with **no focus-state
  replacement at all**, because a plain `style` object has no way to express
  a `:focus` pseudo-class without an `onFocus`/`onBlur` handler, and none of
  these implement one. **A keyboard user tabbing to these specific inputs
  gets no visible focus indicator whatsoever** — the outline is removed and
  nothing takes its place. This is a real accessibility regression on
  `staging` today, present in at least the IBKR connection form and all
  three list-page filter bars.

Phase 2/3's `FormRow`/`Button`/input primitives should standardize on the
Tailwind-class pattern's approach (remove-and-replace, never just remove)
and this specific gap should be called out directly in Phase 4's
enforcement doc, not just fixed silently as part of a later page migration.

## 4. Z-index — mostly fine

```
5  zIndex: 1000   (every modal — matches the 5 modal chrome instances exactly)
2  zIndex: 10
2  zIndex: 0
1  zIndex: 2
1  zIndex: 100
```
Modals are perfectly consistent (`1000`, all 5). The handful of smaller
values (`10`, `2`, `100`) look like local stacking-context fixes (a sticky
header above scrolling content, a dropdown above a row) rather than a real
problem — worth a single named z-index scale (`modal`, `dropdown`,
`sticky`) in Phase 2 purely for documentation value, not because anything
is currently broken.

## 5. Motion — already close to consistent

```
7  transition: '<property> 0.15s[, ...]'   (7 of 8 total transition literals)
1  transition: 'width 0.4s'                (one outlier — a resize/expand animation)
```
`0.15s` is close to a de facto standard already. Phase 2's Motion tokens
(spec 2.5) can mostly just name this rather than reconcile real drift — the
`0.4s` outlier is worth a one-line look (is a width/resize transition
supposed to be slower than a color/opacity fade, or was `0.4s` picked by
eye like the padding values in report #01?) but isn't urgent.

## Priority addition to the Phase 4 list (report #02's summary)

Ranking these against the existing list: the **P&L color literal bug (§2)**
and the **focus-indicator gap (§3)** are both more urgent than most of
report #02's items — they're live defects in the default (dark) theme and
in keyboard accessibility respectively, not just drift/duplication waiting
to be cleaned up. Recommend fixing both directly once Phase 2's color
tokens exist (§2 is a one-line `var(--acc)`/`var(--c1)` swap in 3 files;
§3 needs the standardized focus-visible pattern from Phase 3's form
primitives), ahead of the cosmetic-only items.

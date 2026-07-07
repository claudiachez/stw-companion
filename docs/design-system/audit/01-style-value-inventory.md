# Design System Audit — Phase 1, Part 2: Hardcoded Style-Value Inventory

Scope: `apps/web/src`, `apps/admin/src`, `packages/ui/src`, `packages/shared/src`
(`.ts`/`.tsx` only). Counts are raw string-literal matches via grep, not a
static analysis of computed styles — good enough to show scale and shape of
the problem, not a byte-exact census. `staging` @ `a57f166`.

## TL;DR

| Category | Distinct values found | Dominant styling mechanism |
|---|---|---|
| Colors (literal hex) | 48 distinct hex strings | inline `style` |
| Font size | 14 distinct px values (inline) + 5 Tailwind scale classes | inline `style` (~6.5x the Tailwind usage) |
| Border radius | 8 distinct px values (inline) + 4 Tailwind classes | inline `style` |
| Padding | ~39 distinct `"Npx Npx"` combinations | inline `style`, no scale at all |
| Gap | 13 distinct px values | inline `style` |
| Box shadow | 3 distinct values (1 tokenized, 2 ad hoc) | mixed |
| Letter spacing | 8 distinct values, all clustered 0.02em–0.12em (likely all "the small-caps header" style) | inline `style` |
| Font weight | 4 distinct values, dominated by 600/700 | inline `style` — this one is actually fine |

The app has a real token layer for **color** (CSS vars in `index.css`) that is
inconsistently used, and **no scale at all** for spacing, font size, or radius
— every one of those is a component-by-component literal.

## Color

### Literal hex colors, by occurrence count

```
  23 #ef4444        13 #DC2626        7 #f59e0b       4 #9CA3AF
  15 #fff           11 #16A34A        5 #aaaaaa       4 #6b7280
  14 #22c55e         3 #f97316        4 #ef444415     3 #c8c8c8
   3 #EF4444         3 #D97706        3 #9ca3af       3 #2d0c0c
   3 #22c55e15       3 #22C55E        3 #14b8a6       2 #f59e0b33
   2 #f59e0b22       2 #ef444422      2 #F97316       2 #22c55e33
   2 #111111         1 #fbbf24        1 #f59e0b10     1 #ef444410
   1 #e2e2e2         1 #b4b4b4        1 #a78bfa       1 #a0a0a0
   1 #FBBC05         1 #EA4335        1 #7C3AED       1 #6366F1
   1 #52525b         1 #4285F4        1 #3b82f6       1 #34A853
   1 #2a2a2a         1 #2563EB        1 #22d3ee       1 #22c55e22
   1 #15803d         1 #06B6D4
```

Findings:
- **Same color, multiple spellings.** Red alone appears as `#ef4444`,
  `#EF4444`, `#DC2626`, and `#dc2626`-equivalent `#D97706`-adjacent ambers —
  i.e. red/green/amber each already have CSS var tokens (`--c1`, `--c5`,
  `--c3` / `--acc`) but are frequently re-typed as literal hex instead of
  `var(--c1)` etc. Casing is inconsistent even for the identical value
  (`#22c55e` vs `#22C55E` vs `#22c55e` — 3 separate literal spellings of the
  brand green, on top of the 14 lowercase and the CSS var itself).
- **Alpha via string-suffix hack, not `rgba()` or an opacity token.** Values
  like `#ef444415`, `#22c55e33`, `#f59e0b22` are the base hex with a 2-digit
  hex alpha appended (`color + '15'`, `color + '22'` etc., built at runtime in
  components like `RegimeBadge.tsx`/`HoldingRow.tsx`). At least 4 different
  alpha suffixes are in use (`10`, `15`, `22`/`18`/`28`, `33`) with no shared
  constant — every badge component picked its own translucency by eye.
  See component report for the exact call sites.
- **Google brand colors** (`#4285F4`, `#EA4335`, `#FBBC05`, `#34A853`) are a
  legitimate one-off (Google OAuth button) — not a token candidate, just
  noting so Phase 2 doesn't try to "fix" it.
- `rgba()`/`rgb()` literal usage is small and mostly consistent: `rgba(0,0,0,
  0.55)` ×5 (the canonical modal backdrop per CLAUDE.md), plus one
  `rgba(0,0,0,0.5)` ×4 and one `rgba(0,0,0,0.25)` ×1 — two stray shadow/backdrop
  values that don't match the documented 0.55 standard and should be
  reconciled (they read like leftover shadow experiments, not backdrops, but
  worth a direct look in Phase 2).

### No literal Tailwind palette classes

Zero occurrences of `bg-red-500`, `text-green-600`, etc. anywhere in scope —
color is applied via inline style or the semantic Tailwind theme keys
(`bg-surface`, `text-t2`, ...), never Tailwind's default palette. This is
good news for Phase 2: there's no competing color system to unwind, only the
literal-hex-vs-CSS-var inconsistency above.

## Typography

### Font size — inline literal (`fontSize: N`)

```
 107  fontSize: 12      8  fontSize: 14      2  fontSize: 20
  77  fontSize: 11      5  fontSize: 26      2  fontSize: 18
  75  fontSize: 10      4  fontSize: 28      1  fontSize: 15
  39  fontSize: 9       4  fontSize: 16
  23  fontSize: 13      3  fontSize: 17      2  fontSize: 22
```
**348 inline occurrences across 14 distinct pixel values** (9–28px). By
comparison, Tailwind's type-scale classes are used only 56 times total
(`text-xs` ×24, `text-sm` ×24, `text-2xl` ×4, `text-lg` ×3, `text-xl` ×1),
plus one arbitrary-value escape hatch (`text-[10px]`). Inline literals
outnumber the Tailwind scale roughly 6:1 — the app has, in practice,
abandoned Tailwind's type scale in favor of picking a fresh px value per
component. This is the single strongest argument in the whole audit for a
tokenized `max ~6 size` type scale (spec Phase 2.2) — 14 sizes is not a scale,
it's noise, and most of the values cluster close enough (9/10/11/12/13) that
they're almost certainly meant to be 2–3 sizes that drifted.

### Font weight — actually consistent

```
 85  fontWeight: 600
 64  fontWeight: 700
  3  fontWeight: 500
  2  fontWeight: 400
```
Nearly all weight usage is 600 or 700. No action needed beyond naming these
two as the `medium`/`bold` tokens — this is the one typography axis that
doesn't need fixing, just formalizing.

### Letter spacing — one intent, eight values

```
 20  letterSpacing: '0.08em'     4  letterSpacing: '0.12em'
 17  letterSpacing: '0.1em'      1  letterSpacing: '0.03em'
  8  letterSpacing: '0.06em'     1  letterSpacing: '0.02em'
                                 1  letterSpacing: '-0.01em'
```
These are overwhelmingly attached to small-caps section/label headers (see
component report — `SectionHeader` uses `0.12em`, `ActionBadge` uses
`0.08em`, `BiasChip` uses `0.02em`...). One `-uppercase-label` text style with
one letter-spacing value would cover the visual intent of nearly all 52
occurrences.

## Spacing

### Padding — no scale exists

`padding: '<top/bottom>px <left/right>px'` literals produced **~39 distinct
combinations**, e.g.:
```
16  padding: '6px 8px'      7  padding: '14px 16px'    4  padding: '16px 18px'
10  padding: '2px 6px'      7  padding: '10px 12px'    4  padding: '12px 14px'
 9  padding: '1px 5px'      5  padding: '7px 16px'     4  padding: '10px 14px'
 7  padding: '8px 13px'     4  padding: '9px 13px'     ...(~25 more, 1-3× each)
 7  padding: '6px 14px'     4  padding: '8px 12px'
```
No 4px-base rhythm is visible — values like `13px`, `18px` don't fit any
base-4 or base-8 scale, confirming components size their own padding by eye
per instance rather than picking from a set. This is the clearest case for
the spec's "4px-base spacing scale" requirement.

### Gap — same pattern, smaller scale

```
41  gap: 8      4  gap: 4      2  gap: 24
25  gap: 6      4  gap: 2      1  gap: 9
22  gap: 10     4  gap: 0      1  gap: 7
                3  gap: 3      1  gap: 32
                3  gap: 12     1  gap: 16
                3  gap: 14
```
Better than padding — `8`/`6`/`10` dominate — but still 13 distinct values
including odd ones (`gap: 3`, `gap: 7`, `gap: 9`) that don't belong to any
4px-base scale.

## Radius

```
Inline:  27 borderRadius: 4    10 borderRadius: 3    5 borderRadius: 10
         25 borderRadius: 8     8 borderRadius: 2     1 borderRadius: 12
         25 borderRadius: 5
         23 borderRadius: 6
Tailwind: 10 rounded (=4px)  9 rounded-lg (=8px)  8 rounded-full  6 rounded-xl (=12px)
```
8 distinct inline pixel values plus 4 Tailwind radius classes — worse than
the spec's own claim of "at least three radii on cards alone." A `sm/md/lg/
pill` 4-value radius scale would cover all observed intents.

## Shadow

```
6  boxShadow: 'var(--shadow)'                       ← the actual token, already in use
4  boxShadow: '0 12px 40px rgba(0,0,0,0.5)'          ← ad hoc, modal-adjacent
1  boxShadow: '0 4px 20px rgba(0,0,0,0.25)'          ← ad hoc, one-off
```
Only 3 distinct values total — smallest inconsistency found in the audit.
`var(--shadow)` is already the right pattern; the two ad hoc values are
almost certainly meant to be a second "elevated/modal" shadow tier that was
never named as a token. Phase 2 should just formalize a 2-tier shadow scale
(`card`, `modal`) — cheap fix, high consistency payoff.

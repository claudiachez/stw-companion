# Design System Audit — Phase 1, Part 4: Responsive / Mobile-Desktop Conventions

CLAUDE.md carries several standing rules on this axis (Ground Rules: "All UI
changes must work on mobile — design for ≤390px first"; "UI consistency"
section: modal chrome, multi-column stacking, list+detail split behavior).
These are real product requirements, not just visual polish, so they belong
in this audit rather than being left as prose-only rules the token/component
system is unaware of. Same scope/branch as the other three docs.

## The actual mechanism: one JS hook, not CSS breakpoints

`packages/ui/src/hooks/useIsMobile.ts` is the only responsive primitive in
the codebase:

```ts
export function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < breakpoint);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    ...
  }, [breakpoint]);
  return isMobile;
}
```

- Called at **8 sites**, every single one with the default `640` — no
  caller overrides it. This is a good sign for consistency (one real
  breakpoint, not several), but that `640` is a bare number sitting in one
  hook file, not a named token — nothing else in the app can reference "the
  mobile breakpoint" without either importing this hook or re-typing `640`.
- Tailwind's responsive prefixes (`sm:`/`md:`/`lg:`/`xl:`) are used **4 times
  total** across the whole app (`sm:block` ×2, `sm:inline` ×1, `sm:hidden`
  ×1) — negligible. The app has, in effect, standardized on **JS-conditional
  rendering via `useIsMobile()`** as the actual responsive strategy, not CSS
  media queries. This is consistent enough to keep as-is; Phase 2/3 should
  formalize `640` as a named breakpoint token consumed by the hook (and stop
  there) rather than introducing Tailwind responsive classes as a second,
  competing mechanism.
- **Note the "≤390px" ground rule vs. the `640` code threshold aren't the
  same number.** They're not necessarily in conflict — 390px reads as "the
  narrowest device to design against," 640 as "the layout-mode switch point"
  (a layout can be single-column-stacked well before 390px and still be
  called "mobile" up to 640px) — but this gap is currently undocumented.
  Phase 2 should either name both explicitly (`breakpoint.mobile = 640`,
  `breakpoint.minSupportedWidth = 390` as a testing floor) or confirm they're
  meant to collapse into one number.

## Layout stacking — consistent pattern, no shared primitive

`flexWrap` appears 24 times as the mechanism for "multi-column desktop,
single-column mobile" (per CLAUDE.md's own documented rule). Conditional
`!isMobile &&` gating (to hide a column/element outright rather than
reflow it) appears another 24 times. Both are used correctly and
consistently per-component — no drift found here — but neither is wrapped
in a shared layout primitive (e.g. a `Stack`/`ResponsiveRow` component); every
component reimplements the same `flexWrap: 'wrap'` + gap combination by hand.
Low-priority relative to the other findings, but a natural freebie once
Phase 3 builds any layout primitives.

## List+detail split/mobile-swap — the documented "canonical pattern" exists in exactly one place

CLAUDE.md states this is "the canonical list+detail pattern for any
list+detail surface, not just Ticker Details": desktop shows a resizable
split pane; mobile fully swaps to the detail view, hiding the list/filter
chrome. In the actual code, this is implemented **only inside
`packages/ui/src/features/picks/PicksView.tsx`**, as inline state/logic
(`mobileDetail`, a drag-resize handler, `onClose` wiring) — there is no
extracted hook or component another feature can import. This directly
compounds the DetailPane finding in report #02 item 6: PR #69's new
`PortfolioPositionDetail.tsx` was, per CLAUDE.md's own handoff notes, built
by manually re-following `PicksView.tsx`'s contract rather than reusing
shared code, because no shared code exists. **Phase 3's DetailPane skeleton
(spec 3.7) should bake in this responsive split/swap behavior as part of the
component, not just the visual header/metric-block/section-card structure**
— otherwise a 4th hand-rolled copy is only a matter of time.

## Modal chrome — mostly consistent, one real contradiction of CLAUDE.md's own documented example

CLAUDE.md states: "Every modal in the app uses the same fixed-overlay
chrome: `position: 'fixed', inset: 0` dark backdrop (`rgba(0,0,0,0.55)`),
**vertically centered** (`alignItems: 'center'`, not `flex-start`/
top-aligned) ... See `PositionEditor.tsx` ... for the canonical version."

Checking the 5 modal instances found in-scope:

| File | Backdrop | Vertical alignment |
|---|---|---|
| `PositionEditor.tsx:61` | `rgba(0,0,0,0.55)` ✓ | **`alignItems: 'flex-start'`, `padding: '6vh 16px 16px'`** — top-anchored |
| `TradeEditForm.tsx:63` | `rgba(0,0,0,0.55)` ✓ | **`alignItems: 'flex-start'`, `padding: '8vh 16px 16px'`** — top-anchored (own, slightly different vh offset) |
| `LegTimeline.tsx:358` (EventForm) | `rgba(0,0,0,0.55)` ✓ | `alignItems: 'center'` ✓ |
| `LegTimeline.tsx:432` | `rgba(0,0,0,0.55)` ✓ | `alignItems: 'center'` ✓ |
| `LegTimeline.tsx:567` | `rgba(0,0,0,0.55)` ✓ | `alignItems: 'center'` ✓ |

**The backdrop color is genuinely consistent (5/5).** Vertical alignment is
not: it's a **2-vs-3 split**, not a single outlier — `PositionEditor.tsx`
and `TradeEditForm.tsx` both top-anchor (with two slightly different `vh`
offsets, 6 vs 8, suggesting neither was copied from the other either), while
all three of `LegTimeline.tsx`'s modals center. And `PositionEditor.tsx` is
the exact file CLAUDE.md cites as "the canonical version" for vertical
centering, so the rule's own reference example contradicts the rule. This
is a concrete case of documentation and code having drifted apart, not a
hypothetical: worth a direct decision in Phase 2/3 (standardize both
outliers to center, per the documented rule, unless top-anchoring was
actually intentional for taller forms — in which case that should become an
explicit, named modal variant rather than an undocumented one-off).

Modal content width also has no shared token: `520` (`PositionEditor`),
`480` and `420`×2 (`LegTimeline`'s three modals) — three different values
for "how wide is a modal," never a named size.

## Summary for Phase 2/3 planning

Add to the token/component scope already identified in reports #01/#02:
1. **Name the `640` breakpoint as a token**; decide explicitly how it
   relates to the documented "≤390px" design floor.
2. **`Modal` as a Phase 3 component** (not currently in the spec's numbered
   list) — chrome is consistent enough on backdrop that it should be
   extracted verbatim, which would have caught the `PositionEditor.tsx`
   centering drift automatically. Give it 2-3 named width tokens (e.g.
   `sm`/`md`/`lg`) instead of ad hoc `maxWidth` numbers.
3. **DetailPane skeleton (already in report #02) should own the
   responsive split/full-screen-swap behavior**, not just the static visual
   layout — this is the piece that's actually been copy-paste-by-hand risk
   so far, more than the visual chrome.

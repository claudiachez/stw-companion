// Design tokens — non-color scales (spacing, radius, shadow, motion, breakpoint,
// z-index, type scale). Framework-agnostic plain values so both Tailwind configs
// and any inline `style={{ }}` object can read the same numbers. Color stays in
// CSS custom properties (packages/ui/src/styles/tokens.css) since the app needs
// runtime dark/light theme switching, which a static JS value can't do.
//
// See docs/design-system/tokens.md for the full reference + the audit findings
// (docs/design-system/audit/01-style-value-inventory.md) each scale replaces.

// Mirrors Tailwind's own default spacing scale (already shipped, unused —
// components use inline px numbers instead of `p-2`/`gap-3` etc.). Exposing the
// same numbers here means an inline `style` object and a Tailwind class now
// agree by construction, instead of a component picking its own padding by eye.
export const SPACE = {
  0: 0, px: 1, 0.5: 2, 1: 4, 1.5: 6, 2: 8, 2.5: 10, 3: 12, 3.5: 14,
  4: 16, 5: 20, 6: 24, 7: 28, 8: 32, 10: 40, 12: 48, 16: 64,
} as const;

// Mirrors Tailwind's default radius scale. Replaces 8 ad hoc inline values
// (2,3,4,5,6,8,10,12) found in the audit with 4 named steps.
export const RADIUS = {
  sm: 2,
  DEFAULT: 4,
  md: 6,
  lg: 8,
  xl: 12,
  full: 9999,
} as const;

// 2-tier shadow scale. `card` is the existing `var(--shadow)` token (already in
// consistent use); `modal` formalizes the ad hoc elevated-shadow value that two
// modals already used independently without naming it.
export const SHADOW = {
  card: 'var(--shadow)',
  modal: '0 12px 40px rgba(0,0,0,0.5)',
} as const;

// Durations in ms. `fast` covers 7 of the 8 transition literals found in the
// audit (color/background/opacity/transform fades); `slow` names the one
// width/resize outlier so a future resize animation has a real token to reach
// for instead of picking another number by eye.
export const DURATION = { fast: 150, slow: 400 } as const;
export const EASING = { standard: 'ease' } as const;

// Single JS-side breakpoint, matching `useIsMobile`'s existing default (640) —
// this constant is now the source useIsMobile reads, instead of a bare literal.
// `minSupportedWidth` names the Ground Rules' "design for ≤390px" floor as a
// distinct, smaller number: the narrowest device layouts must still work at,
// not the point layout mode switches (640).
export const BREAKPOINT = { mobile: 640, minSupportedWidth: 390 } as const;

// Names the one already-consistent stacking value (every modal: 1000) plus the
// handful of local stacking-context values found in the audit.
export const Z_INDEX = { dropdown: 10, sticky: 100, modal: 1000 } as const;

// Type scale. Originally 6 collapsed steps, EXPANDED 2026-07-20 to the full ladder the
// webapp redesign uses so redesigned screens are pixel-exact (lint bans literal font-sizes,
// so every size the design specifies needs a token). Values ARE the design's exact px:
// 9/10/11/12/13/14/15/16/20/22/26/30. `lg` changed 18→16 (the redesign tops its headings at
// 16; 18 is unused by the redesign) — a minor shrink on not-yet-redesigned sub-headings.
export const FONT_SIZE = {
  '3xs': 9,   // table headers, "▼ you are here", the tiniest uppercase labels
  '2xs': 10,  // badges, uppercase section/module labels, source lines
  xs: 11,     // dense secondary text (sub-lines, notes)
  sm: 12,     // dense primary text — the single most common size
  sms: 13,    // row primary text / plain-English sentences
  base: 14,   // card section titles, buttons, form labels
  md: 15,     // verdict / summary headline
  lg: 16,     // headings, identity name (was 18)
  xl: 20,     // at-a-glance stat numbers
  '2xl': 22,  // avatar initial
  display: 26, // big KPI numbers (drawdown / invested)
  hero: 30,   // account-value hero
  // input === lg (16) by value, kept as its own name: mobile Safari zooms the viewport on
  // focus for any <input> under 16px, so TextInput must never drop below it regardless of
  // where the heading scale lands. Its own name documents that browser-behavior floor.
  input: 16,
} as const;

// fontWeight was already consistent in the audit (600/700 dominate) — just naming it.
export const FONT_WEIGHT = { medium: 500, semibold: 600, bold: 700 } as const;

// The dominant uppercase-label letter-spacing value, replacing 8 distinct
// inline values (0.02em–0.12em) that were all serving the same visual intent.
export const LETTER_SPACING = { label: '0.08em' } as const;

export const LINE_HEIGHT = { tight: 1.1, normal: 1.5, relaxed: 1.6 } as const;

// The numeric text style the spec requires everywhere numeric data renders
// (tables, risk rows, KPI values). Spread this into a numeric value's style
// object: `style={{ ...NUMERIC_STYLE, ...restOfStyle }}`.
export const NUMERIC_STYLE = { fontVariantNumeric: 'tabular-nums' } as const;

// Named widths for the Modal component (spec addendum — see
// docs/design-system/audit/03-responsive-mobile-conventions.md). Replaces 3
// distinct ad hoc modal maxWidth values (420, 480, 520).
export const MODAL_WIDTH = { sm: 420, md: 480, lg: 520 } as const;

// The one literal rgba value every existing modal (PositionEditor, EventForm,
// IbkrOrderModal, etc.) already uses consistently for its backdrop — named here so
// Phase 3's Modal component (and any future modal) has a token instead of retyping
// the literal.
export const OVERLAY = { backdrop: 'rgba(0,0,0,0.55)' } as const;

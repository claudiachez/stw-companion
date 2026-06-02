// Conviction-tier and action-chip presentation metadata. Values are CSS custom
// properties resolved by each app's stylesheet (see CLAUDE.md design system), so
// the same constants drive identical colors across web + admin.

export interface TierMeta {
  label: string;
  short: string;
  color: string;
  bg: string;
  border: string;
  light: string;
}

// Keyed by `number` (not ConvictionLevel) because `holdings.conviction` arrives as
// a plain number; callers do `TIERS[h.conviction] ?? TIERS[0]`.
export const TIERS: Record<number, TierMeta> = {
  5: { label: 'Tier 1 — Highest Conviction', short: 'HIGHEST',  color: 'var(--c5)', bg: 'var(--c5bg)', border: 'var(--c5b)', light: 'var(--c5l)' },
  4: { label: 'Tier 2 — High Conviction',    short: 'HIGH',     color: 'var(--c4)', bg: 'var(--c4bg)', border: 'var(--c4b)', light: 'var(--c4l)' },
  3: { label: 'Tier 3 — Moderate',           short: 'MODERATE', color: 'var(--c3)', bg: 'var(--c3bg)', border: 'var(--c3b)', light: 'var(--c3l)' },
  2: { label: 'Tier 4 — Waning Interest',    short: 'WANING',   color: 'var(--c2)', bg: 'var(--c2bg)', border: 'var(--c2b)', light: 'var(--c2l)' },
  1: { label: 'Tier 5 — Concern',            short: 'CONCERN',  color: 'var(--c1)', bg: 'var(--c1bg)', border: 'var(--c1b)', light: 'var(--c1l)' },
  0: { label: 'Tier 6 — Legacy Positions',   short: 'LEGACY',   color: 'var(--c0)', bg: 'var(--c0bg)', border: 'var(--c0b)', light: 'var(--c0l)' },
};

// "Hold" is intentionally omitted — holding is the implicit default state, so it
// gets no action badge in the row or detail pane (both gate rendering on a hit here).
export const ACTION_VARS: Record<string, { color: string; bg: string }> = {
  New:     { color: 'var(--new)',     bg: 'var(--new-bg)' },
  Upsized: { color: 'var(--upsized)', bg: 'var(--upsized-bg)' },
  Trimmed: { color: 'var(--trimmed)', bg: 'var(--trimmed-bg)' },
  Closed:  { color: 'var(--closed)',  bg: 'var(--closed-bg)' },
};

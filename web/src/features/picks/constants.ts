export const TIERS: Record<number, { label: string; short: string; color: string; bg: string; border: string; light: string }> = {
  5: { label: 'Tier 1 — Highest Conviction', short: 'HIGHEST',  color: 'var(--c5)', bg: 'var(--c5bg)', border: 'var(--c5b)', light: 'var(--c5l)' },
  4: { label: 'Tier 2 — High Conviction',    short: 'HIGH',     color: 'var(--c4)', bg: 'var(--c4bg)', border: 'var(--c4b)', light: 'var(--c4l)' },
  3: { label: 'Tier 3 — Moderate',           short: 'MODERATE', color: 'var(--c3)', bg: 'var(--c3bg)', border: 'var(--c3b)', light: 'var(--c3l)' },
  2: { label: 'Tier 4 — Waning Interest',    short: 'WANING',   color: 'var(--c2)', bg: 'var(--c2bg)', border: 'var(--c2b)', light: 'var(--c2l)' },
  1: { label: 'Tier 5 — Concern',            short: 'CONCERN',  color: 'var(--c1)', bg: 'var(--c1bg)', border: 'var(--c1b)', light: 'var(--c1l)' },
  0: { label: 'Tier 6 — Legacy Positions',   short: 'LEGACY',   color: 'var(--c0)', bg: 'var(--c0bg)', border: 'var(--c0b)', light: 'var(--c0l)' },
};

export const BASKET_COLORS: Record<string, string> = {
  'Robotics + Edge AI':             '#7C3AED',
  'Power Infrastructure':           '#16A34A',
  'Datacenter + AI Infrastructure': '#2563EB',
  'Telecom + Voice AI':             '#D97706',
  'U.S. Chips Supply Chain':        '#DC2626',
  'Defense':                        '#a78bfa',
  'AI Fraud / Verified Identity':   '#22d3ee',
  'Nuclear':                        '#fbbf24',
  'Legacy Positions':               '#6b7280',
};

export function bColor(basket: string): string {
  return BASKET_COLORS[basket] ?? '#6b7280';
}

export const ACTION_VARS: Record<string, { color: string; bg: string }> = {
  New:     { color: 'var(--new)',     bg: 'var(--new-bg)' },
  Upsized: { color: 'var(--upsized)', bg: 'var(--upsized-bg)' },
  Hold:    { color: 'var(--hold)',    bg: 'var(--hold-bg)' },
  Trimmed: { color: 'var(--trimmed)', bg: 'var(--trimmed-bg)' },
  Closed:  { color: 'var(--closed)',  bg: 'var(--closed-bg)' },
};

export function positionType(positionDetail: string | null): 'shares' | 'options' | 'mixed' | null {
  const d = positionDetail ?? '';
  if (!d) return null;
  const hasShares  = /Common\s*@/i.test(d);
  const hasOptions = /\$[\d.]+[CP]\b|\b(options\s+only)\b|\d+[CP]\s+[@$]/i.test(d);
  if (hasShares && hasOptions) return 'mixed';
  if (hasOptions) return 'options';
  if (hasShares)  return 'shares';
  return null;
}

export function parseCostBasis(positionDetail: string | null): number | null {
  const m = (positionDetail ?? '').match(/Common\s*@\s*\$([0-9]+\.?[0-9]*)/i);
  return m ? parseFloat(m[1]) : null;
}

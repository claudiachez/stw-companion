import type { ConvictionLevel } from '../types/holding';

export interface TierMeta {
  label: string;
  short: string;
  hex: string;
  tailwind: string;
  cssColor: string;
  cssBg: string;
  cssBorder: string;
}

export const TIERS: Record<ConvictionLevel, TierMeta> = {
  5: { label: 'Tier 1 — Highest Conviction', short: 'HIGHEST',  hex: '#22c55e', tailwind: 'text-green-500',  cssColor: 'var(--c5)', cssBg: 'var(--c5bg)', cssBorder: 'var(--c5b)' },
  4: { label: 'Tier 2 — High Conviction',    short: 'HIGH',     hex: '#3b82f6', tailwind: 'text-blue-500',   cssColor: 'var(--c4)', cssBg: 'var(--c4bg)', cssBorder: 'var(--c4b)' },
  3: { label: 'Tier 3 — Moderate',           short: 'MODERATE', hex: '#f59e0b', tailwind: 'text-amber-500',  cssColor: 'var(--c3)', cssBg: 'var(--c3bg)', cssBorder: 'var(--c3b)' },
  2: { label: 'Tier 4 — Waning Interest',    short: 'WANING',   hex: '#6b7280', tailwind: 'text-gray-500',   cssColor: 'var(--c2)', cssBg: 'var(--c2bg)', cssBorder: 'var(--c2b)' },
  1: { label: 'Tier 5 — Concern',            short: 'CONCERN',  hex: '#ef4444', tailwind: 'text-red-500',    cssColor: 'var(--c1)', cssBg: 'var(--c1bg)', cssBorder: 'var(--c1b)' },
  0: { label: 'Tier 6 — Legacy Positions',   short: 'LEGACY',   hex: '#52525b', tailwind: 'text-zinc-500',   cssColor: 'var(--c0)', cssBg: 'var(--c0bg)', cssBorder: 'var(--c0b)' },
};

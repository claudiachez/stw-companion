import { TierConfig } from './types'

export const COLORS = {
  bg: '#0a0a0a',
  surface: '#111111',
  s2: '#1a1a1a',
  border: '#2a2a2a',
  bsub: '#1f1f1f',
  text: '#f0f0f0',
  t2: '#a0a0a0',
  t3: '#525252',
  acc: '#22c55e',
} as const

export const TIERS: Record<number, TierConfig> = {
  5: {
    color: '#22c55e',
    bg: '#0d1f0f',
    border: '#163b1b',
    label: 'Highest Conviction',
    short: 'T5',
  },
  4: {
    color: '#3b82f6',
    bg: '#0d1526',
    border: '#1a3a6e',
    label: 'High Conviction',
    short: 'T4',
  },
  3: {
    color: '#f59e0b',
    bg: '#1f1700',
    border: '#78450f',
    label: 'Moderate',
    short: 'T3',
  },
  2: {
    color: '#6b7280',
    bg: '#161618',
    border: '#2a2b2f',
    label: 'Waning',
    short: 'T2',
  },
  1: {
    color: '#ef4444',
    bg: '#1f0d0d',
    border: '#7f1d1d',
    label: 'Concern',
    short: 'T1',
  },
  0: {
    color: '#52525b',
    bg: '#161618',
    border: '#27272a',
    label: 'Legacy',
    short: 'T0',
  },
}

import { describe, it, expect } from 'vitest';
import {
  MARKET_MOVERS, nextUpcomingEarnings, daysUntil, earningsProximity,
  earningsHourLabel, fmtEpsEstimate,
} from './earnings';
import type { EarningsEvent } from '../types/earnings';

// 2026-07-13 12:00 ET (16:00 UTC) — a fixed "now" so date math is deterministic.
const NOW = Date.parse('2026-07-13T16:00:00Z');

function ev(symbol: string, date: string, extra: Partial<EarningsEvent> = {}): EarningsEvent {
  return { symbol, date, hour: null, quarter: null, year: null, epsEstimate: null, epsActual: null, revenueEstimate: null, revenueActual: null, ...extra };
}

describe('MARKET_MOVERS', () => {
  it('is the MAG7 set', () => {
    expect(MARKET_MOVERS).toContain('NVDA');
    expect(MARKET_MOVERS).toHaveLength(7);
  });
});

describe('nextUpcomingEarnings', () => {
  it('returns the soonest date on or after today', () => {
    const events = [ev('X', '2026-07-27'), ev('X', '2026-07-20'), ev('X', '2026-10-26')];
    expect(nextUpcomingEarnings(events, NOW)?.date).toBe('2026-07-20');
  });
  it('includes today', () => {
    expect(nextUpcomingEarnings([ev('X', '2026-07-13')], NOW)?.date).toBe('2026-07-13');
  });
  it('skips past dates', () => {
    expect(nextUpcomingEarnings([ev('X', '2026-07-01')], NOW)).toBeNull();
  });
  it('returns null on empty', () => {
    expect(nextUpcomingEarnings([], NOW)).toBeNull();
  });
});

describe('daysUntil', () => {
  it('0 for today, 1 for tomorrow', () => {
    expect(daysUntil('2026-07-13', NOW)).toBe(0);
    expect(daysUntil('2026-07-14', NOW)).toBe(1);
  });
  it('negative for the past', () => {
    expect(daysUntil('2026-07-10', NOW)).toBe(-3);
  });
});

describe('earningsProximity', () => {
  it('reads today / tomorrow / in N days / in N weeks', () => {
    expect(earningsProximity('2026-07-13', NOW)).toBe('today');
    expect(earningsProximity('2026-07-14', NOW)).toBe('tomorrow');
    expect(earningsProximity('2026-07-16', NOW)).toBe('in 3 days');
    expect(earningsProximity('2026-07-27', NOW)).toBe('in 2 weeks');
  });
  it('says reported for a past date', () => {
    expect(earningsProximity('2026-07-01', NOW)).toBe('reported');
  });
});

describe('earningsHourLabel', () => {
  it('maps the sessions', () => {
    expect(earningsHourLabel('bmo')).toBe('before open');
    expect(earningsHourLabel('amc')).toBe('after close');
    expect(earningsHourLabel(null)).toBe('');
  });
});

describe('fmtEpsEstimate', () => {
  it('formats positive + negative to 2dp', () => {
    expect(fmtEpsEstimate(0.4833)).toBe('est. EPS 0.48');
    expect(fmtEpsEstimate(-0.12)).toBe('est. EPS −0.12');
  });
  it('empty when null', () => {
    expect(fmtEpsEstimate(null)).toBe('');
  });
});

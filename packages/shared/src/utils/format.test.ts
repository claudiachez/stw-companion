import { describe, it, expect } from 'vitest';
import { tradingDateET } from './format';

describe('tradingDateET', () => {
  it('reads a placeholder midnight-UTC timestamp\'s date directly (no TZ shift)', () => {
    // A bare date-only diary entry, e.g. "2026-06-12 00:00:00+00" — the calendar
    // date IS the intended ET date; localizing would wrongly roll it back to 6/11.
    expect(tradingDateET('2026-06-12T00:00:00Z')).toBe('2026-06-12');
  });

  it('localizes a real intraday UTC timestamp to its ET calendar date', () => {
    // 2026-06-12 02:00 UTC = 2026-06-11 10:00pm EDT (UTC-4) — the evening-before event.
    expect(tradingDateET('2026-06-12T02:00:00Z')).toBe('2026-06-11');
  });

  it('keeps the same-day ET date for a daytime UTC timestamp', () => {
    // 2026-06-12 15:30 UTC = 2026-06-12 11:30am EDT — same calendar day both ways.
    expect(tradingDateET('2026-06-12T15:30:00Z')).toBe('2026-06-12');
  });

  it('accepts a Date instance directly', () => {
    expect(tradingDateET(new Date('2026-01-15T00:00:00Z'))).toBe('2026-01-15');
  });
});

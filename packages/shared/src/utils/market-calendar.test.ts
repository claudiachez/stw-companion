import { describe, it, expect } from 'vitest';
import { isTradingDay, lastTradingDay } from './market-calendar';

describe('isTradingDay', () => {
  it('is true on an ordinary weekday', () => {
    expect(isTradingDay('2026-07-10')).toBe(true); // Friday
    expect(isTradingDay('2026-07-13')).toBe(true); // Monday
  });

  it('is false on weekends', () => {
    expect(isTradingDay('2026-07-11')).toBe(false); // Saturday
    expect(isTradingDay('2026-07-12')).toBe(false); // Sunday
  });

  it('is false on NYSE holidays', () => {
    expect(isTradingDay('2026-01-01')).toBe(false); // New Year's
    expect(isTradingDay('2026-11-26')).toBe(false); // Thanksgiving
    expect(isTradingDay('2026-12-25')).toBe(false); // Christmas
  });

  it('honors the observed (weekend-shifted) holiday, not the nominal date', () => {
    // Jul 4 2026 is a Saturday → the market observes Friday Jul 3.
    expect(isTradingDay('2026-07-03')).toBe(false); // observed closure
    expect(isTradingDay('2026-07-06')).toBe(true);  // Monday, open
  });

  it('is false on malformed input', () => {
    expect(isTradingDay('')).toBe(false);
    expect(isTradingDay('not-a-date')).toBe(false);
  });
});

describe('lastTradingDay', () => {
  it('returns the day itself when it is a trading day', () => {
    expect(lastTradingDay('2026-07-10')).toBe('2026-07-10'); // Friday
  });

  it('walks a weekend back to Friday', () => {
    expect(lastTradingDay('2026-07-11')).toBe('2026-07-10'); // Saturday → Fri
    expect(lastTradingDay('2026-07-12')).toBe('2026-07-10'); // Sunday → Fri
  });

  it('walks a holiday (and its weekend) back to the last open day', () => {
    expect(lastTradingDay('2026-07-03')).toBe('2026-07-02'); // Jul-4 observed (Fri) → Thu
    expect(lastTradingDay('2026-12-25')).toBe('2026-12-24'); // Christmas (Fri) → Thu
  });
});

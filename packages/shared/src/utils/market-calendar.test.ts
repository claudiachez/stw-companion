import { describe, it, expect } from 'vitest';
import { isTradingDay } from './market-calendar';

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

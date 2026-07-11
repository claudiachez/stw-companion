import { describe, it, expect } from 'vitest';
import { nyseHolidays } from './nyse-calendar';

// Oracle: the known NYSE closures for 2025–2027 (the same list seeded in
// migration 068 + the market-calendar.ts client mirror). If the computed output
// matches these exactly, the rules — incl. Good Friday and every weekend
// observance shift — are correct, so future years are trustworthy.
const EXPECTED: Record<number, string[]> = {
  2025: ['2025-01-01', '2025-01-20', '2025-02-17', '2025-04-18', '2025-05-26', '2025-06-19', '2025-07-04', '2025-09-01', '2025-11-27', '2025-12-25'],
  2026: ['2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25'],
  2027: ['2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24'],
};

describe('nyseHolidays', () => {
  for (const [year, dates] of Object.entries(EXPECTED)) {
    it(`matches the known ${year} closures exactly`, () => {
      expect(nyseHolidays(Number(year)).map((h) => h.date)).toEqual(dates);
    });
  }

  it('tags weekend-observed holidays', () => {
    // 2026-07-04 is a Saturday → observed Friday 07-03.
    const jul = nyseHolidays(2026).find((h) => h.date === '2026-07-03');
    expect(jul?.name).toMatch(/observed/i);
    // 2027-07-04 is a Sunday → observed Monday 07-05.
    const jul27 = nyseHolidays(2027).find((h) => h.date === '2027-07-05');
    expect(jul27?.name).toMatch(/observed/i);
  });

  it('omits New Year when Jan 1 is a Saturday (no Dec 31 close)', () => {
    // Jan 1 2028 falls on a Saturday — NYSE does not close, so no Jan entry.
    const jan = nyseHolidays(2028).filter((h) => h.date.startsWith('2028-01-0'));
    expect(jan.some((h) => h.name.includes("New Year"))).toBe(false);
  });
});

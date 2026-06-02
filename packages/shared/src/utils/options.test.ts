import { describe, it, expect } from 'vitest';
import { parseOptionLegs } from './options';

describe('parseOptionLegs', () => {
  it('parses a dated leg ($STRIKE C MONTH DD \'YY @ $ENTRY)', () => {
    expect(parseOptionLegs("$7.5C July 17 '26 @ $0.65", 'CXDO')).toEqual([
      { symbol: 'CXDO', strike: 7.5, right: 'C', expiry: '20260717', entry: 0.65 },
    ]);
  });

  it('parses a month + year leg ($STRIKE C MONTH \'YY @ $ENTRY) → YYYYMM', () => {
    expect(parseOptionLegs("$22.5C Oct '26 @ $2.67", 'X')).toEqual([
      { symbol: 'X', strike: 22.5, right: 'C', expiry: '202610', entry: 2.67 },
    ]);
  });

  it('parses a month-ONLY leg with no year/day ($120C Sep @ $8.68) → defaults the year', () => {
    expect(parseOptionLegs('Common @ $125.85 + $120C Sep @ $8.68', 'BDC')).toEqual([
      { symbol: 'BDC', strike: 120, right: 'C', expiry: '202609', entry: 8.68 },
    ]);
  });

  it('parses multiple mixed-format legs without double-counting', () => {
    expect(parseOptionLegs("$7.5C July 17 '26 @ $0.65 + $10C Oct '26 @ $2.24", 'CXDO')).toEqual([
      { symbol: 'CXDO', strike: 7.5, right: 'C', expiry: '20260717', entry: 0.65 },
      { symbol: 'CXDO', strike: 10, right: 'C', expiry: '202610', entry: 2.24 },
    ]);
  });

  it('returns no legs for a shares-only position', () => {
    expect(parseOptionLegs('Common @ $50.00', 'X')).toEqual([]);
  });

  it('returns no legs for CASH or empty detail', () => {
    expect(parseOptionLegs('whatever', 'CASH')).toEqual([]);
    expect(parseOptionLegs('', 'X')).toEqual([]);
  });
});

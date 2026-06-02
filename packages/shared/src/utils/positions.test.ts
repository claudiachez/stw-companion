import { describe, it, expect } from 'vitest';
import { positionType, parseCostBasis } from './positions';

describe('positionType', () => {
  it('returns null for empty / null', () => {
    expect(positionType(null)).toBeNull();
    expect(positionType('')).toBeNull();
  });

  it('detects shares', () => {
    expect(positionType('Common @ $12.50')).toBe('shares');
  });

  it('detects options', () => {
    expect(positionType('$150C Jan 26 @ $3.20')).toBe('options');
    expect(positionType('options only')).toBe('options');
  });

  it('detects mixed (shares + options)', () => {
    expect(positionType('Common @ $40.00 + $50C Jun 26 @ $2.10')).toBe('mixed');
  });

  it('returns null when nothing matches', () => {
    expect(positionType('just a note')).toBeNull();
  });
});

describe('parseCostBasis', () => {
  it('parses the Common @ $X cost basis', () => {
    expect(parseCostBasis('Common @ $12.50')).toBe(12.5);
    expect(parseCostBasis('Common @ $100')).toBe(100);
  });

  it('returns null when no cost basis present', () => {
    expect(parseCostBasis('$150C Jan 26 @ $3.20')).toBeNull();
    expect(parseCostBasis(null)).toBeNull();
  });
});

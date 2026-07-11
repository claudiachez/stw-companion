import { describe, it, expect } from 'vitest';
import { matchConvictionBand } from './conviction';

describe('matchConvictionBand', () => {
  it('empty band matches every tier (incl. null)', () => {
    for (const c of [null, 0, 1, 2, 3, 4, 5]) expect(matchConvictionBand(c, '')).toBe(true);
  });

  it('null / undefined conviction never matches a chosen band', () => {
    expect(matchConvictionBand(null, 'low')).toBe(false);
    expect(matchConvictionBand(undefined, 'high')).toBe(false);
  });

  it('high = tiers 4–5', () => {
    expect(matchConvictionBand(5, 'high')).toBe(true);
    expect(matchConvictionBand(4, 'high')).toBe(true);
    expect(matchConvictionBand(3, 'high')).toBe(false);
  });

  it('medium = tier 3 only', () => {
    expect(matchConvictionBand(3, 'medium')).toBe(true);
    expect(matchConvictionBand(4, 'medium')).toBe(false);
    expect(matchConvictionBand(2, 'medium')).toBe(false);
  });

  it('low = tiers 1–2, matching the Overview chip (excludes Legacy 0)', () => {
    expect(matchConvictionBand(1, 'low')).toBe(true);
    expect(matchConvictionBand(2, 'low')).toBe(true);
    expect(matchConvictionBand(0, 'low')).toBe(false);
    expect(matchConvictionBand(3, 'low')).toBe(false);
  });

  it('legacy = tier 0 only', () => {
    expect(matchConvictionBand(0, 'legacy')).toBe(true);
    expect(matchConvictionBand(1, 'legacy')).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import {
  deriveGexLevels, gexSleeveScore, gexPositioningLabel, gexPositioningImplication,
  type FlashAlphaGexResponse,
} from './gex';

const sample: FlashAlphaGexResponse = {
  symbol: 'SPY',
  underlying_price: 597.505,
  as_of: '2026-02-28T16:30:45Z',
  gamma_flip: 595.25,
  net_gex: 2850000000,
  net_gex_label: 'positive',
  strikes: [
    { strike: 590, call_gex: 5_000_000, put_gex: 20_000_000, net_gex: 25_000_000 },
    { strike: 600, call_gex: 30_000_000, put_gex: 4_000_000, net_gex: 34_000_000 },
    { strike: 610, call_gex: 12_000_000, put_gex: 1_000_000, net_gex: 13_000_000 },
  ],
};

describe('deriveGexLevels', () => {
  it('carries native fields through', () => {
    const l = deriveGexLevels(sample);
    expect(l.symbol).toBe('SPY');
    expect(l.spot).toBe(597.505);
    expect(l.gammaFlip).toBe(595.25);
    expect(l.netGex).toBe(2850000000);
    expect(l.netGexLabel).toBe('positive');
    expect(l.asOf).toBe('2026-02-28T16:30:45Z');
  });

  it('derives the call wall (max call gamma) and put wall (max put gamma)', () => {
    const l = deriveGexLevels(sample);
    expect(l.callWall).toBe(600); // greatest call_gex
    expect(l.putWall).toBe(590);  // greatest put_gex
  });

  it('handles a missing/empty strikes array', () => {
    const l = deriveGexLevels({ ...sample, strikes: [] });
    expect(l.callWall).toBeNull();
    expect(l.putWall).toBeNull();
  });

  it('coerces non-finite numeric fields to null', () => {
    const l = deriveGexLevels({ ...sample, underlying_price: null, gamma_flip: null, net_gex: null, net_gex_label: 'weird' });
    expect(l.spot).toBeNull();
    expect(l.gammaFlip).toBeNull();
    expect(l.netGex).toBeNull();
    expect(l.netGexLabel).toBeNull();
  });
});

describe('gexSleeveScore', () => {
  it('is 50 at the flip', () => {
    expect(gexSleeveScore(600, 600)).toBe(50);
  });

  it('rises above the flip (positive gamma) and falls below it', () => {
    const above = gexSleeveScore(606, 600)!; // +1% → +20
    const below = gexSleeveScore(594, 600)!; // -1% → -20
    expect(above).toBeGreaterThan(50);
    expect(below).toBeLessThan(50);
    expect(above).toBe(70);
    expect(below).toBe(30);
  });

  it('clamps to [5, 95]', () => {
    expect(gexSleeveScore(660, 600)).toBe(95); // +10% would be 250 → clamp
    expect(gexSleeveScore(540, 600)).toBe(5);  // -10% would be -150 → clamp
  });

  it('returns null on missing inputs', () => {
    expect(gexSleeveScore(null, 600)).toBeNull();
    expect(gexSleeveScore(600, null)).toBeNull();
    expect(gexSleeveScore(0, 600)).toBeNull();
  });
});

describe('gexPositioningLabel / implication', () => {
  it('labels positive/negative/at-flip by spot vs flip', () => {
    expect(gexPositioningLabel({ spot: 606, gammaFlip: 600 })).toBe('Positive γ');
    expect(gexPositioningLabel({ spot: 594, gammaFlip: 600 })).toBe('Negative γ');
    expect(gexPositioningLabel({ spot: 600, gammaFlip: 600 })).toBe('At flip');
    expect(gexPositioningLabel({ spot: null, gammaFlip: 600 })).toBe('—');
  });

  it('gives a distinct implication per state', () => {
    expect(gexPositioningImplication({ spot: 606, gammaFlip: 600 })).toMatch(/dampen/i);
    expect(gexPositioningImplication({ spot: 594, gammaFlip: 600 })).toMatch(/amplify/i);
    expect(gexPositioningImplication({ spot: 600, gammaFlip: 600 })).toMatch(/pivot/i);
  });
});

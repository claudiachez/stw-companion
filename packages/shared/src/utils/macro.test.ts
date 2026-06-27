import { describe, it, expect } from 'vitest';
import {
  trendBucket, trendSubScore, trendSleeveScore,
  environmentScore, regimeBand, hv30, SLEEVE_WEIGHTS,
} from './macro';

describe('trendBucket', () => {
  it('above all three MAs → momentum', () => {
    expect(trendBucket(100, 95, 90, 80)).toBe('momentum');
  });
  it('above 21 & 200 but below 9 → healthy_pullback', () => {
    expect(trendBucket(92, 95, 90, 80)).toBe('healthy_pullback');
  });
  it('above 200 but below 9 & 21 → mid_caution', () => {
    expect(trendBucket(85, 95, 90, 80)).toBe('mid_caution');
  });
  it('above 200 & 9 but below 21 → mid_caution (edge case)', () => {
    // a200 true, a9 true, a21 false → not momentum, not healthy(needs !a9), → mid_caution
    expect(trendBucket(91, 90, 92, 80)).toBe('mid_caution');
  });
  it('below 200 but above 9/21 → bear_rally (the v2 fix, not bullish)', () => {
    expect(trendBucket(85, 80, 82, 90)).toBe('bear_rally');
  });
  it('below all three → risk_off', () => {
    expect(trendBucket(70, 80, 82, 90)).toBe('risk_off');
  });
  it('missing 200D MA → null', () => {
    expect(trendBucket(100, 95, 90, null)).toBeNull();
  });
});

describe('trendSubScore', () => {
  it('maps buckets to their scores', () => {
    expect(trendSubScore('momentum')).toBe(90);
    expect(trendSubScore('bear_rally')).toBe(35);
    expect(trendSubScore('risk_off')).toBe(10);
    expect(trendSubScore(null)).toBeNull();
  });
});

describe('trendSleeveScore', () => {
  it('averages active buckets, ignoring nulls', () => {
    // momentum(90) + mid_caution(50) → 70
    expect(trendSleeveScore(['momentum', 'mid_caution', null])).toBe(70);
  });
  it('all null → null', () => {
    expect(trendSleeveScore([null, null])).toBeNull();
  });
});

describe('environmentScore', () => {
  it('weights present sleeves and redistributes missing weight', () => {
    // Only trend(60) + gex(80) present: weights 0.30 and 0.20 → total 0.50
    // (60*0.30 + 80*0.20) / 0.50 = (18 + 16) / 0.5 = 68
    const score = environmentScore([
      { key: 'trend', score: 60 },
      { key: 'volatility', score: null },
      { key: 'credit', score: null },
      { key: 'rates_dollar', score: null },
      { key: 'gex', score: 80 },
    ]);
    expect(score).toBe(68);
  });
  it('full set sums to the simple weighted mean when weights total 1', () => {
    const score = environmentScore([
      { key: 'trend', score: 50 },
      { key: 'volatility', score: 50 },
      { key: 'credit', score: 50 },
      { key: 'rates_dollar', score: 50 },
      { key: 'gex', score: 50 },
    ]);
    expect(score).toBe(50);
  });
  it('all null → null', () => {
    expect(environmentScore([{ key: 'trend', score: null }])).toBeNull();
  });
  it('sleeve weights total 1.0', () => {
    const total = Object.values(SLEEVE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 10);
  });
});

describe('regimeBand', () => {
  it('maps scores to the five bands', () => {
    expect(regimeBand(80).label).toBe('Risk-On');
    expect(regimeBand(65).label).toBe('Constructive / Selective');
    expect(regimeBand(50).label).toBe('Cautious / Neutral');
    expect(regimeBand(35).label).toBe('Defensive');
    expect(regimeBand(10).label).toBe('Risk-Off');
  });
  it('band edges are inclusive of the lower bound', () => {
    expect(regimeBand(75).label).toBe('Risk-On');
    expect(regimeBand(60).label).toBe('Constructive / Selective');
    expect(regimeBand(45).label).toBe('Cautious / Neutral');
    expect(regimeBand(30).label).toBe('Defensive');
    expect(regimeBand(0).label).toBe('Risk-Off');
  });
  it('carries a trading-mode guidance string', () => {
    expect(regimeBand(80).tradingMode).toMatch(/breakouts/i);
  });
});

describe('hv30', () => {
  it('returns null with fewer than 31 closes', () => {
    expect(hv30(Array(30).fill(100))).toBeNull();
  });
  it('flat series → 0 volatility', () => {
    expect(hv30(Array(40).fill(100))).toBeCloseTo(0, 6);
  });
  it('returns a positive annualized number for a varying series', () => {
    const closes = Array.from({ length: 40 }, (_, i) => 100 + (i % 2 === 0 ? 1 : -1));
    const v = hv30(closes);
    expect(v).not.toBeNull();
    expect(v as number).toBeGreaterThan(0);
  });
});

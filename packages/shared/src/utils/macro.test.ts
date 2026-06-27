import { describe, it, expect } from 'vitest';
import {
  trendBucket, trendSubScore, trendSleeveScore, trendSleeveLabel,
  environmentScore, regimeBand, hv30, SLEEVE_WEIGHTS,
  vixScore, vvixScore, ivPremiumScore, vixDirectionScore,
  volatilityStressScore, stressLabel, percentileRank,
  creditHygScore, creditLabel,
  us10yScore, uupScore, ratesDollarScore, ratesDollarLabel,
  gexScore, gexBiasLabel, gexImplication,
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
  it('trendSleeveLabel maps the score to a word', () => {
    expect(trendSleeveLabel(90)).toBe('Strong');
    expect(trendSleeveLabel(65)).toBe('Constructive');
    expect(trendSleeveLabel(50)).toBe('Caution');
    expect(trendSleeveLabel(35)).toBe('Weak');
    expect(trendSleeveLabel(10)).toBe('Risk-Off');
    expect(trendSleeveLabel(null)).toBe('—');
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

describe('volatility / stress scorers', () => {
  it('vixScore: lower VIX = calmer (higher score)', () => {
    expect(vixScore(12)).toBe(90);
    expect(vixScore(17)).toBe(55);
    expect(vixScore(22)).toBe(30);
    expect(vixScore(30)).toBe(10);
    expect(vixScore(null)).toBeNull();
  });
  it('vvixScore: bands by tail risk', () => {
    expect(vvixScore(80)).toBe(85);
    expect(vvixScore(92)).toBe(50);
    expect(vvixScore(110)).toBe(20);
  });
  it('ivPremiumScore: implied below realized = calm', () => {
    expect(ivPremiumScore(0.8)).toBe(85);
    expect(ivPremiumScore(1.1)).toBe(55);
    expect(ivPremiumScore(1.4)).toBe(20);
  });
  it('vixDirectionScore: falling calms, rising frightens', () => {
    expect(vixDirectionScore(-2)).toBe(80);
    expect(vixDirectionScore(0.5)).toBe(50);
    expect(vixDirectionScore(3)).toBe(20);
  });
  it('volatilityStressScore averages present sub-scores', () => {
    expect(volatilityStressScore([90, 50, null])).toBe(70);
    expect(volatilityStressScore([null, null])).toBeNull();
  });
  it('stressLabel maps the sleeve score to a word', () => {
    expect(stressLabel(80)).toBe('Calm');
    expect(stressLabel(50)).toBe('Normal');
    expect(stressLabel(30)).toBe('Elevated');
    expect(stressLabel(10)).toBe('Stress');
    expect(stressLabel(null)).toBe('—');
  });
  it('percentileRank: share of values at or below', () => {
    expect(percentileRank(19, [10, 15, 19, 25, 30])).toBe(60);
    expect(percentileRank(5, [])).toBeNull();
  });
});

describe('credit / liquidity scorers', () => {
  it('creditHygScore: above 50D + rising = confirming', () => {
    expect(creditHygScore(true, true)).toBe(80);
    expect(creditHygScore(true, false)).toBe(60);
    expect(creditHygScore(false, true)).toBe(45);
    expect(creditHygScore(false, false)).toBe(20);
  });
  it('creditLabel maps scores', () => {
    expect(creditLabel(80)).toBe('Confirming');
    expect(creditLabel(60)).toBe('Mild Caution');
    expect(creditLabel(45)).toBe('Mixed');
    expect(creditLabel(20)).toBe('Warning');
    expect(creditLabel(null)).toBe('—');
  });
});

describe('rates + dollar scorers', () => {
  it('us10yScore: low + falling = tailwind', () => {
    expect(us10yScore(4.1, -0.05, false)).toBe(80);
    expect(us10yScore(4.1, 0.02, false)).toBe(65);
  });
  it('us10yScore: mid band neutral, high + rising = headwind', () => {
    expect(us10yScore(4.4, 0, false)).toBe(55);
    expect(us10yScore(4.6, 0.05, false)).toBe(20);
    expect(us10yScore(4.6, -0.02, false)).toBe(35);
  });
  it('us10yScore: fast drop during stress = flight to safety, not bullish', () => {
    expect(us10yScore(4.1, -0.15, true)).toBe(30);
    // same drop but no stress → normal tailwind read
    expect(us10yScore(4.1, -0.15, false)).toBe(80);
  });
  it('us10yScore: null yield → null', () => {
    expect(us10yScore(null, -0.1, true)).toBeNull();
  });
  it('uupScore: below both = tailwind, above both = headwind', () => {
    expect(uupScore(false, false)).toBe(80);
    expect(uupScore(true, true)).toBe(20);
    expect(uupScore(true, false)).toBe(50);
  });
  it('ratesDollarScore averages present sub-scores; label maps it', () => {
    expect(ratesDollarScore([80, 20])).toBe(50);
    expect(ratesDollarScore([null, null])).toBeNull();
    expect(ratesDollarLabel(70)).toBe('Tailwind');
    expect(ratesDollarLabel(50)).toBe('Neutral');
    expect(ratesDollarLabel(20)).toBe('Headwind');
  });
});

describe('gex / positioning scorers', () => {
  it('gexScore maps bias text to a score', () => {
    expect(gexScore('Bullish')).toBe(90);
    expect(gexScore('strongly bearish')).toBe(10);
    expect(gexScore('conflicted')).toBe(35);
    expect(gexScore('flat / neutral')).toBe(55);
    expect(gexScore('')).toBeNull();
    expect(gexScore(null)).toBeNull();
  });
  it('gexBiasLabel canonicalizes', () => {
    expect(gexBiasLabel('BULLISH bias')).toBe('Bullish');
    expect(gexBiasLabel('mixed')).toBe('Conflicted');
    expect(gexBiasLabel(undefined)).toBe('—');
  });
  it('gexImplication gives an action line per bias', () => {
    expect(gexImplication('bearish')).toMatch(/avoid chasing/i);
    expect(gexImplication('bullish')).toMatch(/breakouts/i);
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

import { describe, it, expect } from 'vitest';
import {
  trendBucket, trendStructure, trendSubScore, trendSleeveScore, trendSleeveLabel,
  environmentScore, regimeBand, hv30, SLEEVE_WEIGHTS,
  vixScore, ivPremiumScore, vixDirectionScore,
  volatilityStressScore, stressLabel, percentileRank,
  creditHygScore, creditOasScore, creditLabel,
  us10yScore, uupScore, ratesDollarScore, ratesDollarLabel,
  gexScore, gexBiasLabel, gexImplication,
  breadthScore, RISK_APPETITE_WEIGHTS, riskAppetiteScore,
  classifyTrendDirection, regimeDirectionLabel, trendDirectionPhrase, trendDirectionArrow,
  eventImportance, eventSurprise, eventPrintTrend, classifyEventRisk, eventOverlayLabel, eventImportanceLabel,
  SECTOR_ETFS, RS_LOOKBACKS, relativeStrength,
  weekRange,
  SECTOR_CONSTITUENTS, rankSectorConstituents,
  mapIndustryToSector, sectorStanding,
} from './macro';
import type { MacroEvent, SectorRotationRow } from '../types/macro';

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

describe('trendStructure', () => {
  const rising = Array.from({ length: 200 }, (_, i) => 100 + i);

  it('classifies off the latest daily close and matches the primitives', () => {
    const s = trendStructure(rising);
    expect(s.close).toBe(rising[rising.length - 1]); // 299, the last daily close
    expect(s.ma9).toBeCloseTo((291 + 292 + 293 + 294 + 295 + 296 + 297 + 298 + 299) / 9);
    expect(s.ma200).toBeCloseTo(rising.reduce((a, b) => a + b, 0) / 200);
    expect(s.bucket).toBe('momentum');
    expect(s.bucket).toBe(trendBucket(s.close, s.ma9, s.ma21, s.ma200));
  });

  it('classifies off the LIVE price when supplied — MAs stay close-based', () => {
    // Same close-based MAs as `rising` (bucket = momentum off the 299 close), but a live
    // price that has crashed below every MA regroups to risk_off intraday.
    const closeBased = trendStructure(rising);
    const live = trendStructure(rising, 50);
    expect(live.close).toBe(50);
    expect(live.ma9).toBe(closeBased.ma9);   // MAs unchanged — a moving average is fixed intraday
    expect(live.ma200).toBe(closeBased.ma200);
    expect(live.bucket).toBe(trendBucket(50, live.ma9, live.ma21, live.ma200));
    expect(live.bucket).toBe('risk_off');
    expect(live.bucket).not.toBe(closeBased.bucket); // the live price actually changed the group
  });

  it('ignores a non-positive/absent live price and falls back to the daily close', () => {
    expect(trendStructure(rising, 0).close).toBe(299);
    expect(trendStructure(rising, null).close).toBe(299);
    expect(trendStructure(rising, undefined).close).toBe(299);
  });

  it('is all-null until there is enough history for the 200-day MA', () => {
    const s = trendStructure([100, 101, 102]);
    expect(s.ma200).toBeNull();
    expect(s.bucket).toBeNull();
  });

  it('handles an empty series without throwing', () => {
    expect(trendStructure([])).toEqual({ close: null, ma9: null, ma21: null, ma200: null, bucket: null });
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
  it('accepts custom weights; percent scale == fraction scale (normalized)', () => {
    const sleeves = [
      { key: 'trend' as const, score: 60 },
      { key: 'volatility' as const, score: null },
      { key: 'credit' as const, score: null },
      { key: 'rates_dollar' as const, score: null },
      { key: 'gex' as const, score: 80 },
    ];
    const frac = environmentScore(sleeves, { trend: 0.30, volatility: 0.20, credit: 0.15, rates_dollar: 0.15, gex: 0.20 });
    const pct = environmentScore(sleeves, { trend: 30, volatility: 20, credit: 15, rates_dollar: 15, gex: 20 });
    expect(frac).toBe(68);
    expect(pct).toBe(68);
    // A heavier GEX weight pulls the blend toward gex's 80.
    expect(environmentScore(sleeves, { trend: 10, volatility: 20, credit: 15, rates_dollar: 15, gex: 90 })!).toBeGreaterThan(68);
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
  it('creditOasScore: spread below 50D + tightening = confirming (inverted vs HYG)', () => {
    expect(creditOasScore(true, true)).toBe(80);   // tight & tightening
    expect(creditOasScore(true, false)).toBe(60);  // tight but widening
    expect(creditOasScore(false, true)).toBe(45);  // wide but tightening
    expect(creditOasScore(false, false)).toBe(20); // wide & widening = warning
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

describe('breadthScore', () => {
  it('equal-weight leading = confirming (high)', () => {
    expect(breadthScore(true, true)).toBe(80);
    expect(breadthScore(true, false)).toBe(60);
    expect(breadthScore(false, true)).toBe(45);
    expect(breadthScore(false, false)).toBe(25);
  });
});

describe('riskAppetiteScore', () => {
  it('weights are exactly the 6 gauge inputs and sum to 100%', () => {
    const total = Object.values(RISK_APPETITE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it('returns null when no inputs are present', () => {
    expect(riskAppetiteScore({})).toBeNull();
  });

  it('weighted-averages whichever inputs are present, redistributing missing weight', () => {
    // Only momentum (18%) and breadth (10%) present, both scored 100 → still 100.
    expect(riskAppetiteScore({ momentum: 100, breadth: 100 })).toBe(100);
    // momentum=100 (18%), vix=0 (16%) → weighted toward momentum's larger weight.
    const score = riskAppetiteScore({ momentum: 100, vix: 0 });
    expect(score).toBe(Math.round((100 * RISK_APPETITE_WEIGHTS.momentum) / (RISK_APPETITE_WEIGHTS.momentum + RISK_APPETITE_WEIGHTS.vix)));
  });

  it('treats null and undefined inputs as absent', () => {
    expect(riskAppetiteScore({ momentum: 80, vix: null, ivPremium: undefined })).toBe(80);
  });

  it('full set of 6 inputs averages with their published weights', () => {
    const score = riskAppetiteScore({
      momentum: 90, vix: 90, ivPremium: 85, gex: 90, credit: 80, breadth: 80,
    });
    expect(score).toBe(87); // weighted avg over active weight sum (0.88), rounded
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

describe('classifyTrendDirection', () => {
  it('null delta → flat (no history yet)', () => {
    expect(classifyTrendDirection(null, null)).toBe('flat');
  });
  it('small delta with no prior → flat', () => {
    expect(classifyTrendDirection(1, null)).toBe('flat');
    expect(classifyTrendDirection(-2, null)).toBe('flat');
  });
  it('moderate positive delta → improving', () => {
    expect(classifyTrendDirection(5, null)).toBe('improving');
  });
  it('moderate negative delta → deteriorating', () => {
    expect(classifyTrendDirection(-5, null)).toBe('deteriorating');
  });
  it('large positive delta → strong_improvement', () => {
    expect(classifyTrendDirection(12, null)).toBe('strong_improvement');
  });
  it('large negative delta → strong_deterioration', () => {
    expect(classifyTrendDirection(-12, 1)).toBe('strong_deterioration');
  });
  it('was falling, now rising → reversing_up', () => {
    expect(classifyTrendDirection(4, -6)).toBe('reversing_up');
  });
  it('was rising, now falling → reversing_down', () => {
    expect(classifyTrendDirection(-4, 6)).toBe('reversing_down');
  });
  it('two small deltas in a row do not count as a reversal', () => {
    expect(classifyTrendDirection(1, -1)).toBe('flat');
  });
});

describe('regimeDirectionLabel', () => {
  it('maps improvement variants to Improving', () => {
    expect(regimeDirectionLabel('improving')).toBe('Improving');
    expect(regimeDirectionLabel('strong_improvement')).toBe('Improving');
  });
  it('maps deterioration variants to Deteriorating', () => {
    expect(regimeDirectionLabel('deteriorating')).toBe('Deteriorating');
    expect(regimeDirectionLabel('strong_deterioration')).toBe('Deteriorating');
  });
  it('maps reversals to their own labels', () => {
    expect(regimeDirectionLabel('reversing_up')).toBe('Reversing Up');
    expect(regimeDirectionLabel('reversing_down')).toBe('Reversing Down');
  });
  it('flat → Mixed', () => {
    expect(regimeDirectionLabel('flat')).toBe('Mixed');
  });
});

describe('trendDirectionPhrase + trendDirectionArrow', () => {
  it('pairs phrases with the correct arrow', () => {
    expect(trendDirectionPhrase('improving')).toBe('improving');
    expect(trendDirectionArrow('improving')).toBe('↑');
    expect(trendDirectionPhrase('deteriorating')).toBe('weakening');
    expect(trendDirectionArrow('deteriorating')).toBe('↓');
    expect(trendDirectionPhrase('strong_deterioration')).toBe('strong deterioration');
    expect(trendDirectionArrow('strong_deterioration')).toBe('↓');
    expect(trendDirectionPhrase('flat')).toBe('flat');
    expect(trendDirectionArrow('flat')).toBe('→');
  });
});

function mkEvent(overrides: Partial<MacroEvent>): MacroEvent {
  return {
    eventName: 'CPI',
    releaseTimeEt: '2026-06-28T08:30:00-04:00',
    period: 'May 2026',
    actual: null,
    consensus: '0.3%',
    previous: '0.2%',
    importance: 'very_high',
    source: 'MarketWatch',
    sourceTimestamp: '2026-06-27T00:00:00Z',
    ...overrides,
  };
}

describe('eventImportance', () => {
  it('classifies very-high events', () => {
    expect(eventImportance('CPI')).toBe('very_high');
    expect(eventImportance('Core CPI')).toBe('very_high');
    expect(eventImportance('PCE Inflation')).toBe('very_high');
    expect(eventImportance('FOMC Interest Rate Decision')).toBe('very_high');
    expect(eventImportance('Nonfarm Payrolls')).toBe('very_high');
    expect(eventImportance('Unemployment Rate')).toBe('very_high');
  });
  it('classifies high events', () => {
    expect(eventImportance('PPI')).toBe('high');
    expect(eventImportance('Average Hourly Earnings')).toBe('high');
  });
  it('classifies medium events', () => {
    expect(eventImportance('Initial Jobless Claims')).toBe('medium');
    expect(eventImportance('Retail Sales')).toBe('medium');
    expect(eventImportance('ISM Manufacturing PMI')).toBe('medium');
    expect(eventImportance('10-Year Note Auction')).toBe('medium');
  });
  it('falls back to low for unrecognized events', () => {
    expect(eventImportance('Some Obscure Indicator')).toBe('low');
  });
});

describe('eventSurprise', () => {
  it('computes actual minus consensus for numeric prints', () => {
    expect(eventSurprise('0.4%', '0.3%')).toBeCloseTo(0.1);
    expect(eventSurprise('175K', '200K')).toBeCloseTo(-25);
  });
  it('returns null when either side is missing or non-numeric', () => {
    expect(eventSurprise(null, '0.3%')).toBeNull();
    expect(eventSurprise('0.4%', null)).toBeNull();
    expect(eventSurprise('n/a', '0.3%')).toBeNull();
  });
});

describe('classifyEventRisk', () => {
  const now = new Date('2026-06-28T00:00:00-04:00');

  it('returns none/low when nothing is within 48h', () => {
    const events = [mkEvent({ releaseTimeEt: '2026-07-05T08:30:00-04:00' })];
    const read = classifyEventRisk(events, now);
    expect(read.overlay).toBe('none');
    expect(read.riskLevel).toBe('low');
  });

  it('flags Event Watch for a major event 24-48h out', () => {
    const events = [mkEvent({ releaseTimeEt: '2026-06-29T12:00:00-04:00' })]; // ~36h out
    const read = classifyEventRisk(events, now);
    expect(read.overlay).toBe('event_watch');
    expect(read.riskLevel).toBe('medium');
    expect(read.event?.eventName).toBe('CPI');
  });

  it('flags High Event Risk for a major event within 24h', () => {
    const events = [mkEvent({ releaseTimeEt: '2026-06-28T20:00:00-04:00' })]; // ~20h out
    const read = classifyEventRisk(events, now);
    expect(read.overlay).toBe('high_event_risk');
    expect(read.riskLevel).toBe('high');
  });

  it('flags a Reaction Overlay for a just-released event, with surprise', () => {
    const events = [mkEvent({
      releaseTimeEt: '2026-06-27T08:30:00-04:00', // ~16h ago
      actual: '0.4%',
      consensus: '0.3%',
    })];
    const read = classifyEventRisk(events, now);
    expect(read.overlay).toBe('reaction_overlay');
    expect(read.surprise).toBeCloseTo(0.1);
  });

  it('escalates to Shock on a large relative surprise', () => {
    const events = [mkEvent({
      releaseTimeEt: '2026-06-27T08:30:00-04:00',
      actual: '0.6%',
      consensus: '0.2%', // 200% relative miss
    })];
    const read = classifyEventRisk(events, now);
    expect(read.riskLevel).toBe('shock');
  });

  it('fades a reaction overlay after ~3 trading days', () => {
    const events = [mkEvent({
      releaseTimeEt: '2026-06-20T08:30:00-04:00', // well over 72h ago
      actual: '0.4%',
      consensus: '0.3%',
    })];
    const read = classifyEventRisk(events, now);
    expect(read.overlay).toBe('none');
  });

  it('prefers a released event over a still-upcoming one', () => {
    const events = [
      mkEvent({ eventName: 'PPI', releaseTimeEt: '2026-06-27T08:30:00-04:00', actual: '0.3%', consensus: '0.2%', importance: 'high' }),
      mkEvent({ eventName: 'CPI', releaseTimeEt: '2026-07-05T08:30:00-04:00' }),
    ];
    const read = classifyEventRisk(events, now);
    expect(read.overlay).toBe('reaction_overlay');
    expect(read.event?.eventName).toBe('PPI');
  });

  it('fires a Reaction Overlay the moment release time passes, even before the actual posts (FRED lag)', () => {
    // THE regression (CPI missing at 8:58am): FRED gives release DATES only, so `actual`
    // is null for the minutes-to-hours until FRED's data series updates. The overlay must
    // still fire on the release time — before the fix it was gated on `actual` and vanished.
    const events = [mkEvent({ releaseTimeEt: '2026-06-27T20:30:00-04:00', actual: null, consensus: null })]; // ~3.5h ago
    const read = classifyEventRisk(events, now);
    expect(read.overlay).toBe('reaction_overlay');
    expect(read.event?.eventName).toBe('CPI');
    expect(read.surprise).toBeNull();
  });

  it('a just-released major outranks a far-off upcoming major (closest wins)', () => {
    const events = [
      mkEvent({ eventName: 'CPI', releaseTimeEt: '2026-06-27T23:00:00-04:00', actual: null, consensus: null }), // ~1h ago
      mkEvent({ eventName: 'NFP', releaseTimeEt: '2026-06-28T20:00:00-04:00' }),                                // ~20h out
    ];
    const read = classifyEventRisk(events, now);
    expect(read.overlay).toBe('reaction_overlay');
    expect(read.event?.eventName).toBe('CPI');
  });

  it('an imminent upcoming major outranks a stale recent release (closest wins)', () => {
    const events = [
      mkEvent({ eventName: 'CPI', releaseTimeEt: '2026-06-26T08:30:00-04:00', actual: '3.1% YoY' }),   // ~40h ago
      mkEvent({ eventName: 'NFP', releaseTimeEt: '2026-06-28T02:00:00-04:00' }),                        // ~2h out
    ];
    const read = classifyEventRisk(events, now);
    expect(read.overlay).toBe('high_event_risk');
    expect(read.event?.eventName).toBe('NFP');
  });
});

describe('eventPrintTrend', () => {
  it('inflation falling is a favorable down-move (green ▼)', () => {
    expect(eventPrintTrend('3.1% YoY', '3.4% YoY', true)).toEqual({ dir: 'down', favorable: 'good' });
  });
  it('inflation rising is an unfavorable up-move (red ▲)', () => {
    expect(eventPrintTrend('3.4% YoY', '3.1% YoY', true)).toEqual({ dir: 'up', favorable: 'bad' });
  });
  it('jobs rising is a favorable up-move (higher-is-better)', () => {
    expect(eventPrintTrend('+200K MoM', '+150K MoM', false)).toEqual({ dir: 'up', favorable: 'good' });
  });
  it('jobs falling is an unfavorable down-move', () => {
    expect(eventPrintTrend('+100K MoM', '+150K MoM', false)).toEqual({ dir: 'down', favorable: 'bad' });
  });
  it('parses through thousands separators and units', () => {
    expect(eventPrintTrend('1,400K starts', '1,350K starts', false)).toEqual({ dir: 'up', favorable: 'good' });
  });
  it('unchanged print is flat/neutral', () => {
    expect(eventPrintTrend('3.1% YoY', '3.1% YoY', true)).toEqual({ dir: 'flat', favorable: 'neutral' });
  });
  it('no favorability convention → direction only, neutral color', () => {
    expect(eventPrintTrend('48.5', '46.0', undefined)).toEqual({ dir: 'up', favorable: 'neutral' });
  });
  it('returns null when a value is missing or non-numeric', () => {
    expect(eventPrintTrend(null, '3.1%', true)).toBeNull();
    expect(eventPrintTrend('3.1%', null, true)).toBeNull();
    expect(eventPrintTrend('n/a', '3.1%', true)).toBeNull();
  });
});

describe('eventOverlayLabel + eventImportanceLabel', () => {
  it('renders display labels', () => {
    expect(eventOverlayLabel('none')).toBe('No major event risk');
    expect(eventOverlayLabel('high_event_risk')).toBe('High Event Risk');
    expect(eventImportanceLabel('very_high')).toBe('Very High');
    expect(eventImportanceLabel('low')).toBe('Low');
  });
});

describe('SECTOR_ETFS', () => {
  it('lists exactly the 11 SPDR sectors, no XLSR', () => {
    expect(SECTOR_ETFS).toHaveLength(11);
    expect(SECTOR_ETFS.map((s) => s.symbol)).not.toContain('XLSR');
    expect(SECTOR_ETFS.map((s) => s.symbol)).toEqual(
      expect.arrayContaining(['XLK', 'XLV', 'XLF', 'XLE', 'XLI', 'XLY', 'XLP', 'XLU', 'XLRE', 'XLB', 'XLC']),
    );
  });
});

describe('relativeStrength', () => {
  const flat = Array.from({ length: 260 }, () => 100);

  it('outperformance vs a flat benchmark reads positive', () => {
    const closes = [...flat];
    closes[closes.length - 1] = 110; // +10% over the lookback
    expect(relativeStrength(closes, flat, RS_LOOKBACKS.week)).toBe(10);
  });

  it('underperformance vs a rising benchmark reads negative', () => {
    const sector = [...flat]; // flat sector
    const benchmark = [...flat];
    benchmark[benchmark.length - 1] = 105; // benchmark +5%
    expect(relativeStrength(sector, benchmark, RS_LOOKBACKS.week)).toBe(-5);
  });

  it('not enough history for the lookback → null', () => {
    expect(relativeStrength([100, 101, 102], flat, RS_LOOKBACKS.oneMonth)).toBeNull();
  });

  it('matching returns → 0', () => {
    expect(relativeStrength(flat, flat, RS_LOOKBACKS.oneYear)).toBe(0);
  });
});

describe('weekRange', () => {
  it('a mid-week date resolves to that week\'s Monday–Friday', () => {
    // Wednesday 2026-06-24
    expect(weekRange(new Date(2026, 5, 24))).toEqual({ start: '2026-06-22', end: '2026-06-26' });
  });

  it('a Sunday resolves to the prior Monday–Friday', () => {
    expect(weekRange(new Date(2026, 5, 28))).toEqual({ start: '2026-06-22', end: '2026-06-26' });
  });

  it('a Monday resolves to its own week', () => {
    expect(weekRange(new Date(2026, 5, 22))).toEqual({ start: '2026-06-22', end: '2026-06-26' });
  });

  it('handles a month boundary', () => {
    // Monday 2026-06-29
    expect(weekRange(new Date(2026, 5, 29))).toEqual({ start: '2026-06-29', end: '2026-07-03' });
  });
});

describe('SECTOR_CONSTITUENTS', () => {
  it('has an entry for every SPDR sector, each with at least one ticker', () => {
    for (const { symbol } of SECTOR_ETFS) {
      expect(SECTOR_CONSTITUENTS[symbol]?.length).toBeGreaterThan(0);
    }
  });
});

describe('rankSectorConstituents', () => {
  function row(symbol: string, bucket: SectorRotationRow['bucket'], rs1M: number | null): SectorRotationRow {
    return { symbol, name: symbol, close: 100, ma9: 100, ma21: 100, ma200: 100, bucket, rsWeek: null, rs1M, rs3M: null, rs6M: null, rs1Y: null };
  }

  it('leaders are confirmed-bullish names ranked by 1M RS descending', () => {
    const rows = [
      row('A', 'momentum', 2),
      row('B', 'healthy_pullback', 8),
      row('C', 'momentum', 5),
    ];
    expect(rankSectorConstituents(rows).leaders.map((r) => r.symbol)).toEqual(['B', 'C', 'A']);
  });

  it('setting up are unconfirmed names with improving 1M RS, ranked descending', () => {
    const rows = [
      row('A', 'mid_caution', 1),
      row('B', 'bear_rally', 4),
      row('C', 'mid_caution', -1), // not improving → excluded
    ];
    expect(rankSectorConstituents(rows).settingUp.map((r) => r.symbol)).toEqual(['B', 'A']);
  });

  it('risk-off names are excluded from both leaders and setting up', () => {
    const rows = [row('A', 'risk_off', 10)];
    const { leaders, settingUp } = rankSectorConstituents(rows);
    expect(leaders).toHaveLength(0);
    expect(settingUp).toHaveLength(0);
  });

  it('caps each list at 5 names', () => {
    const rows = Array.from({ length: 8 }, (_, i) => row(`S${i}`, 'momentum', 8 - i));
    expect(rankSectorConstituents(rows).leaders).toHaveLength(5);
  });
});

describe('mapIndustryToSector', () => {
  it('matches common industry labels to the right SPDR sector', () => {
    expect(mapIndustryToSector('Semiconductors')).toBe('XLK');
    expect(mapIndustryToSector('Software - Infrastructure')).toBe('XLK');
    expect(mapIndustryToSector('Biotechnology')).toBe('XLV');
    expect(mapIndustryToSector('Banks - Regional')).toBe('XLF');
    expect(mapIndustryToSector('Oil & Gas E&P')).toBe('XLE');
    expect(mapIndustryToSector('Aerospace & Defense')).toBe('XLI');
    expect(mapIndustryToSector('Specialty Retail')).toBe('XLY');
    expect(mapIndustryToSector('Household & Personal Products')).toBe('XLP');
    expect(mapIndustryToSector('Utilities - Regulated Electric')).toBe('XLU');
    expect(mapIndustryToSector('REIT - Industrial')).toBe('XLRE');
    expect(mapIndustryToSector('Chemicals')).toBe('XLB');
    expect(mapIndustryToSector('Telecom Services')).toBe('XLC');
  });

  it('is case-insensitive', () => {
    expect(mapIndustryToSector('SEMICONDUCTORS')).toBe('XLK');
  });

  it('returns null for an unrecognized or missing label', () => {
    expect(mapIndustryToSector('Some Made Up Industry')).toBeNull();
    expect(mapIndustryToSector(null)).toBeNull();
    expect(mapIndustryToSector(undefined)).toBeNull();
  });
});

describe('sectorStanding', () => {
  it('momentum and healthy_pullback → leader', () => {
    expect(sectorStanding('momentum')).toBe('leader');
    expect(sectorStanding('healthy_pullback')).toBe('leader');
  });
  it('mid_caution and bear_rally → setting_up', () => {
    expect(sectorStanding('mid_caution')).toBe('setting_up');
    expect(sectorStanding('bear_rally')).toBe('setting_up');
  });
  it('risk_off → laggard', () => {
    expect(sectorStanding('risk_off')).toBe('laggard');
  });
  it('null bucket → null', () => {
    expect(sectorStanding(null)).toBeNull();
  });
});

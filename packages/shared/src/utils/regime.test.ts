import { describe, it, expect } from 'vitest';
import {
  regimeGate, trendStateFromClose, volStateFromVix, REGIME_GATE_CONFIG,
  sma, rocPositive, smaSlopePositive, realizedVolAnnualized, percentileRankOf,
} from './regime';

describe('trendStateFromClose / volStateFromVix', () => {
  it('GREEN when close above 200SMA', () => {
    expect(trendStateFromClose(110, 100)).toBe('GREEN');
  });
  it('RED when close at or below 200SMA', () => {
    expect(trendStateFromClose(95, 100)).toBe('RED');
    expect(trendStateFromClose(100, 100)).toBe('RED');
  });
  it('UNKNOWN when either input is missing', () => {
    expect(trendStateFromClose(null, 100)).toBe('UNKNOWN');
    expect(trendStateFromClose(110, null)).toBe('UNKNOWN');
  });
  it('vol GREEN on normal contango (VIX < VIX3M)', () => {
    expect(volStateFromVix(15, 18)).toBe('GREEN');
  });
  it('vol RED on inverted term structure (VIX >= VIX3M)', () => {
    expect(volStateFromVix(25, 20)).toBe('RED');
    expect(volStateFromVix(20, 20)).toBe('RED');
  });
  it('vol UNKNOWN when either input is missing', () => {
    expect(volStateFromVix(null, 20)).toBe('UNKNOWN');
  });
});

describe('regimeGate — all four ladder cells', () => {
  it('GREEN+GREEN -> 1.0', () => {
    const r = regimeGate({ close: 110, sma200: 100 }, { vixClose: 15, vix3mClose: 18 });
    expect(r).toEqual({ trend_state: 'GREEN', vol_state: 'GREEN', risk_multiplier: 1.0 });
  });
  it('RED trend + GREEN vol -> one RED -> 0.5', () => {
    const r = regimeGate({ close: 90, sma200: 100 }, { vixClose: 15, vix3mClose: 18 });
    expect(r).toEqual({ trend_state: 'RED', vol_state: 'GREEN', risk_multiplier: 0.5 });
  });
  it('GREEN trend + RED vol -> one RED -> 0.5', () => {
    const r = regimeGate({ close: 110, sma200: 100 }, { vixClose: 25, vix3mClose: 20 });
    expect(r).toEqual({ trend_state: 'GREEN', vol_state: 'RED', risk_multiplier: 0.5 });
  });
  it('RED+RED -> 0.0', () => {
    const r = regimeGate({ close: 90, sma200: 100 }, { vixClose: 25, vix3mClose: 20 });
    expect(r).toEqual({ trend_state: 'RED', vol_state: 'RED', risk_multiplier: 0.0 });
  });
});

describe('regimeGate — UNKNOWN propagation', () => {
  it('UNKNOWN trend -> risk_multiplier is null regardless of vol state', () => {
    const r = regimeGate({ close: null, sma200: 100 }, { vixClose: 15, vix3mClose: 18 });
    expect(r.trend_state).toBe('UNKNOWN');
    expect(r.risk_multiplier).toBeNull();
  });
  it('UNKNOWN vol -> risk_multiplier is null regardless of trend state', () => {
    const r = regimeGate({ close: 110, sma200: 100 }, { vixClose: 15, vix3mClose: null });
    expect(r.vol_state).toBe('UNKNOWN');
    expect(r.risk_multiplier).toBeNull();
  });
});

describe('stats helpers', () => {
  it('sma averages the trailing window', () => {
    expect(sma([1, 2, 3, 4, 5], 5)).toBe(3);
    expect(sma([1, 2], 5)).toBeNull();
  });
  it('rocPositive compares today vs `window` days ago', () => {
    const closes = [100, 100, 100, 100, 110];
    expect(rocPositive(closes, 4)).toBe(true);
    expect(rocPositive([90, 100], 1)).toBe(true);
    expect(rocPositive([100, 90], 1)).toBe(false);
    expect(rocPositive([100], 5)).toBeNull();
  });
  it('smaSlopePositive compares the SMA now vs `slopeWindow` days ago', () => {
    // A steadily rising series: the 3-day SMA should be higher now than 2 days ago.
    const rising = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(smaSlopePositive(rising, 3, 2)).toBe(true);
    const falling = [8, 7, 6, 5, 4, 3, 2, 1];
    expect(smaSlopePositive(falling, 3, 2)).toBe(false);
    expect(smaSlopePositive([1, 2], 3, 2)).toBeNull();
  });
  it('realizedVolAnnualized returns null for too-short series and a positive number otherwise', () => {
    expect(realizedVolAnnualized([100, 101], 20)).toBeNull();
    const closes = Array.from({ length: 21 }, (_, i) => 100 + (i % 2 === 0 ? 1 : -1));
    expect(realizedVolAnnualized(closes, 20)).toBeGreaterThan(0);
  });
  it('percentileRankOf ranks a value within a series', () => {
    expect(percentileRankOf(5, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe(50);
    expect(percentileRankOf(10, [1, 2, 3])).toBe(100);
    expect(percentileRankOf(1, [])).toBeNull();
  });
});

describe('REGIME_GATE_CONFIG', () => {
  it('is frozen at engine_version 1.1.0 with the spec parameters', () => {
    expect(REGIME_GATE_CONFIG.engine_version).toBe('1.1.0');
    expect(REGIME_GATE_CONFIG.smaWindow).toBe(200);
    expect(REGIME_GATE_CONFIG.rocWindow).toBe(252);
    expect(REGIME_GATE_CONFIG.slopeWindow).toBe(20);
    expect(REGIME_GATE_CONFIG.percentileWindow).toBe(504);
  });
});

import { describe, it, expect } from 'vitest';
import {
  legUnrealizedPnlPct, legPnlPct, holdingPnlPct, holdingType,
  legMarkReason, fmtLegInstrument, computeRealizedPct, humanizeLegEnum, deriveLegWeights, type Leg,
} from './legs';

// Minimal leg factory — only the fields the pure functions read.
function leg(over: Partial<Leg>): Leg {
  return {
    id: 'l1', ticker: 'X', trader_id: 't', parent_leg_id: null,
    instrument_type: 'SHARES', option_strike: null, option_expiry: null, option_right: null,
    direction: 'long', status: 'OPEN', entry_price: null, weight: null, initial_weight: null, weight_overridden: false,
    mark_price: null, mark_price_source: null, mark_price_at: null,
    exit_price: null, realized_pnl_pct: null, opened_at: null, closed_at: null, close_reason: null,
    ...over,
  };
}

describe('legUnrealizedPnlPct', () => {
  it('shares leg uses the live underlying price', () => {
    const l = leg({ instrument_type: 'SHARES', entry_price: 30.1 });
    expect(legUnrealizedPnlPct(l, 33.11)).toBeCloseTo(10, 5); // +10%
  });

  it('option leg uses its own mark, ignores the live underlying', () => {
    const l = leg({ instrument_type: 'OPTION', option_strike: 30, option_right: 'CALL', option_expiry: '2026-09-18', entry_price: 1.5, mark_price: 3.0 });
    expect(legUnrealizedPnlPct(l, 999)).toBeCloseTo(100, 5); // +100%
  });

  it('flips sign for a short leg', () => {
    const l = leg({ instrument_type: 'SHARES', entry_price: 100, direction: 'short' });
    expect(legUnrealizedPnlPct(l, 90)).toBeCloseTo(10, 5); // short profits when price falls
  });

  it('null when no mark or no entry', () => {
    expect(legUnrealizedPnlPct(leg({ entry_price: 10 }), null)).toBeNull();
    expect(legUnrealizedPnlPct(leg({ instrument_type: 'OPTION', entry_price: null, mark_price: 2 }), null)).toBeNull();
  });
});

describe('legPnlPct', () => {
  it('closed leg returns its realized %', () => {
    const l = leg({ status: 'CLOSED', entry_price: 1.5, exit_price: 3, realized_pnl_pct: 100 });
    expect(legPnlPct(l, null)).toBe(100);
  });

  it('exercised leg returns null (value transferred to spawned shares leg)', () => {
    const l = leg({ status: 'EXERCISED', entry_price: 1.5, realized_pnl_pct: null });
    expect(legPnlPct(l, 999)).toBeNull();
  });
});

describe('holdingPnlPct (weight-weighted)', () => {
  it('weights a heavy share leg above a tiny option leg', () => {
    const legs = [
      leg({ instrument_type: 'SHARES', entry_price: 30.1, weight: 5.4 }),        // +10% at 33.11
      leg({ instrument_type: 'OPTION', option_strike: 30, option_right: 'CALL', option_expiry: '2026-09-18', entry_price: 1.5, weight: 0.2, mark_price: 0.75 }), // −50%
    ];
    // (5.4*10 + 0.2*-50) / 5.6 = (54 - 10) / 5.6 = 7.857…
    expect(holdingPnlPct(legs, 33.11)!).toBeCloseTo(7.857, 2);
  });

  it('null when no leg resolves', () => {
    expect(holdingPnlPct([leg({ entry_price: 10, weight: 1 })], null)).toBeNull();
    expect(holdingPnlPct([], 5)).toBeNull();
  });
});

describe('holdingType', () => {
  const shares = leg({ instrument_type: 'SHARES' });
  const option = leg({ instrument_type: 'OPTION', option_strike: 30, option_right: 'CALL', option_expiry: '2026-09-18' });
  it('classifies shares / options / mixed', () => {
    expect(holdingType([shares])).toBe('shares');
    expect(holdingType([option])).toBe('options');
    expect(holdingType([shares, option])).toBe('mixed');
    expect(holdingType([])).toBeNull();
  });
});

describe('legMarkReason', () => {
  it('flags an unpriced option leg, null for a priced one or a shares leg', () => {
    const opt = leg({ instrument_type: 'OPTION', option_strike: 30, option_right: 'CALL', option_expiry: '2026-09-18' });
    expect(legMarkReason(opt)?.title).toBe('Not priced yet');
    expect(legMarkReason({ ...opt, mark_price: 2 })).toBeNull();
    expect(legMarkReason(leg({ instrument_type: 'SHARES' }))).toBeNull();
  });
});

describe('computeRealizedPct', () => {
  it('matches the trigger formula for a winning long close', () => {
    expect(computeRealizedPct(11.9, 18.15)).toBeCloseTo(52.52, 2); // AMZN 300C
  });
  it('books a loss', () => {
    expect(computeRealizedPct(54, 21.15)).toBeCloseTo(-60.83, 2);  // KTOS 35C
  });
  it('flips sign for a short', () => {
    expect(computeRealizedPct(100, 90, 'short')).toBeCloseTo(10, 5);
  });
  it('exit 0 (expired worthless) → −100% long', () => {
    expect(computeRealizedPct(3.63, 0)).toBeCloseTo(-100, 5);
  });
  it('null on missing/zero entry', () => {
    expect(computeRealizedPct(null, 5)).toBeNull();
    expect(computeRealizedPct(0, 5)).toBeNull();
    expect(computeRealizedPct(5, null)).toBeNull();
  });
});

describe('deriveLegWeights (90/10 split)', () => {
  const wl = (id: string, t: 'SHARES' | 'OPTION', over = false, weight = 0) => ({ id, instrument_type: t, weight, weight_overridden: over });
  it('shares-only → 100% to the shares leg', () => {
    expect(deriveLegWeights(10.8, [wl('s', 'SHARES')])).toEqual({ s: 10.8 });
  });
  it('mixed → 90% shares / 10% split across options', () => {
    const r = deriveLegWeights(6.5, [wl('s', 'SHARES'), wl('o1', 'OPTION'), wl('o2', 'OPTION')]);
    expect(r.s).toBeCloseTo(5.85, 3);
    expect(r.o1).toBeCloseTo(0.325, 3);
    expect(r.o2).toBeCloseTo(0.325, 3);
  });
  it('options-only → even split', () => {
    const r = deriveLegWeights(3.4, [wl('o1', 'OPTION'), wl('o2', 'OPTION')]);
    expect(r.o1).toBeCloseTo(1.7, 3);
    expect(r.o2).toBeCloseTo(1.7, 3);
  });
  it('pins an overridden leg and splits the remainder among the rest', () => {
    const r = deriveLegWeights(6.5, [wl('s', 'SHARES'), wl('o1', 'OPTION', true, 0.5), wl('o2', 'OPTION')]);
    expect(r.s).toBeCloseTo(5.85, 3);    // shares bucket unaffected
    expect(r.o1).toBe(0.5);              // pinned
    expect(r.o2).toBeCloseTo(0.15, 3);   // 0.65 options bucket − 0.5 pinned = 0.15 to the free leg
  });
});

describe('humanizeLegEnum', () => {
  it('title-cases enum constants', () => {
    expect(humanizeLegEnum('EXPIRED_WORTHLESS')).toBe('Expired Worthless');
    expect(humanizeLegEnum('PROFIT_TARGET')).toBe('Profit Target');
    expect(humanizeLegEnum('OPEN')).toBe('Open');
    expect(humanizeLegEnum('SHARES')).toBe('Shares');
  });
});

describe('fmtLegInstrument', () => {
  it('labels shares and options', () => {
    expect(fmtLegInstrument(leg({ instrument_type: 'SHARES' }))).toBe('Common');
    expect(fmtLegInstrument(leg({ instrument_type: 'OPTION', option_strike: 30, option_right: 'CALL', option_expiry: '2026-09-18' }))).toBe("$30C Sep '26");
    expect(fmtLegInstrument(leg({ instrument_type: 'OPTION', option_strike: 35, option_right: 'PUT', option_expiry: '2026-09-18' }))).toBe("$35P Sep '26");
  });
});

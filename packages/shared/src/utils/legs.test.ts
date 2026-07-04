import { describe, it, expect } from 'vitest';
import {
  legUnrealizedPnlPct, legPnlPct, holdingPnlPct, holdingType,
  legMarkReason, fmtLegInstrument, computeRealizedPct, humanizeLegEnum, deriveLegWeights,
  positionWeight, displayInitialWeight, closedPnlPct, hasClosedPnl, closedPnlContribution,
  suggestOrderQuantity, type Leg,
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

describe('deriveLegWeights (90/10 equity:options, 20/80 short:long)', () => {
  const wl = (id: string, t: 'SHARES' | 'OPTION', over = false, weight = 0, expiry: string | null = null) =>
    ({ id, instrument_type: t, weight, weight_overridden: over, option_expiry: expiry });
  it('shares-only → 100% to the shares leg', () => {
    expect(deriveLegWeights(10.8, [wl('s', 'SHARES')])).toEqual({ s: 10.8 });
  });
  it('mixed → 90% shares / 10% options, options split 20/80 short:long by expiry', () => {
    const r = deriveLegWeights(6.5, [
      wl('s', 'SHARES'),
      wl('oShort', 'OPTION', false, 0, '2026-06-19'),
      wl('oLong', 'OPTION', false, 0, '2026-09-18'),
    ]);
    expect(r.s).toBeCloseTo(5.85, 3);        // 90% of 6.5
    expect(r.oShort).toBeCloseTo(0.13, 3);   // 20% of the 0.65 options bucket
    expect(r.oLong).toBeCloseTo(0.52, 3);    // 80% of 0.65
  });
  it('options-only, 2 legs with distinct expiries → 20/80 short:long', () => {
    const r = deriveLegWeights(2.0, [wl('oShort', 'OPTION', false, 0, '2026-06-19'), wl('oLong', 'OPTION', false, 0, '2026-09-18')]);
    expect(r.oShort).toBeCloseTo(0.4, 3);    // 20% of 2.0
    expect(r.oLong).toBeCloseTo(1.6, 3);     // 80% of 2.0
  });
  it('options-only, >2 legs → even split', () => {
    const r = deriveLegWeights(3.0, [wl('a', 'OPTION', false, 0, '2026-06-19'), wl('b', 'OPTION', false, 0, '2026-07-17'), wl('c', 'OPTION', false, 0, '2026-09-18')]);
    expect(r.a).toBeCloseTo(1.0, 3);
    expect(r.b).toBeCloseTo(1.0, 3);
    expect(r.c).toBeCloseTo(1.0, 3);
  });
  it('options-only, 2 legs without/equal expiry → even split (no short:long order)', () => {
    const r = deriveLegWeights(3.4, [wl('o1', 'OPTION'), wl('o2', 'OPTION')]);
    expect(r.o1).toBeCloseTo(1.7, 3);
    expect(r.o2).toBeCloseTo(1.7, 3);
  });
  it('pins an overridden option leg and splits the remainder among the rest', () => {
    const r = deriveLegWeights(6.5, [
      wl('s', 'SHARES'),
      wl('o1', 'OPTION', true, 0.5, '2026-06-19'),
      wl('o2', 'OPTION', false, 0, '2026-09-18'),
    ]);
    expect(r.s).toBeCloseTo(5.85, 3);    // shares bucket unaffected
    expect(r.o1).toBe(0.5);              // pinned
    expect(r.o2).toBeCloseTo(0.15, 3);   // 0.65 options bucket − 0.5 pinned = 0.15 to the free leg
  });
  it('honors a custom equity:options ratio (ADEA 30:70) and short share', () => {
    const r = deriveLegWeights(10.0, [
      wl('s', 'SHARES'),
      wl('oShort', 'OPTION', false, 0, '2026-06-19'),
      wl('oLong', 'OPTION', false, 0, '2026-09-18'),
    ], { equityPct: 0.3 });
    expect(r.s).toBeCloseTo(3.0, 3);         // 30% equity
    expect(r.oShort).toBeCloseTo(1.4, 3);    // 20% of the 7.0 options bucket
    expect(r.oLong).toBeCloseTo(5.6, 3);     // 80% of 7.0
  });
});

describe('positionWeight (Σ over open legs)', () => {
  const leg = (status: string, initial: number | null, weight: number | null) =>
    ({ id: Math.random().toString(), status, initial_weight: initial, weight } as unknown as Leg);
  it('sums only OPEN legs (ADEA: shares 0.6→2.0 + $35C 2.0; the two $30C closed)', () => {
    const legs = [
      leg('CLOSED', 0.6, 0), leg('CLOSED', 1.4, 0),
      leg('OPEN', 2.0, 2.0), leg('OPEN', 0.6, 2.0),
    ];
    expect(positionWeight(legs)).toEqual({ initial: 2.6, current: 4.0 });
  });
  it('null when there are no open legs', () => {
    expect(positionWeight([leg('CLOSED', 1, 0)])).toEqual({ initial: null, current: null });
  });
});

describe('displayInitialWeight (open lots, or closed legs entry when fully closed)', () => {
  const leg = (status: string, initial: number | null, weight: number | null) =>
    ({ id: Math.random().toString(), status, initial_weight: initial, weight } as unknown as Leg);
  it('uses Σ open legs current lots while any leg is open', () => {
    expect(displayInitialWeight([leg('CLOSED', 0.6, 0), leg('OPEN', 2.0, 2.0)])).toBe(2.0);
  });
  it('falls back to Σ closed legs entry lots when fully closed (ARKK)', () => {
    expect(displayInitialWeight([leg('CLOSED', 1.0, 0)])).toBe(1.0);
    expect(displayInitialWeight([leg('CLOSED', 0.5, 0), leg('EXPIRED', 1.5, 0)])).toBe(2.0);
  });
  it('null when fully closed and no entry lots are recorded', () => {
    expect(displayInitialWeight([leg('CLOSED', null, 0)])).toBeNull();
  });
});

describe('closedPnlPct (realized, weighted by initial lot)', () => {
  const cleg = (initial: number | null, realized: number | null) =>
    ({ id: Math.random().toString(), initial_weight: initial, realized_pnl_pct: realized } as unknown as Leg);
  it('weights each leg by its initial lot (closed legs have current weight 0)', () => {
    // -100% on a 0.6 lot + +50% on a 1.4 lot → (0.6*-100 + 1.4*50)/2.0 = +5%
    expect(closedPnlPct([cleg(0.6, -100), cleg(1.4, 50)])).toBeCloseTo(5, 6);
  });
  it('ignores legs with no realized P&L (still open, untrimmed)', () => {
    expect(closedPnlPct([cleg(2.0, null), cleg(1.0, 20)])).toBeCloseTo(20, 6);
  });
  it('null when nothing is realized', () => {
    expect(closedPnlPct([cleg(2.0, null)])).toBeNull();
    expect(hasClosedPnl([cleg(2.0, null)])).toBe(false);
    expect(hasClosedPnl([cleg(2.0, -100)])).toBe(true);
  });
});

describe('closedPnlContribution (portfolio weight points)', () => {
  const leg = (initial: number, realized: number | null, weight = 0) =>
    ({ id: Math.random().toString(), initial_weight: initial, realized_pnl_pct: realized, weight } as unknown as Leg);
  it('weights realized by the sold slice (IRDM: +600% on the 0.6 trimmed slice = +3.6)', () => {
    expect(closedPnlContribution([leg(1.5, 600, 0.9)])).toBeCloseTo(3.6, 6);
  });
  it('fully-closed leg (weight 0) uses the whole lot', () => {
    // -100% on a 1.0 lot fully closed = -1.0 points
    expect(closedPnlContribution([leg(1.0, -100, 0)])).toBeCloseTo(-1.0, 6);
  });
  it('null when nothing realized', () => {
    expect(closedPnlContribution([leg(2.0, null, 2.0)])).toBeNull();
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

describe('suggestOrderQuantity', () => {
  it('shares: $40k capital, 5% deploy, $119.55 price -> 16 shares, $1912.80', () => {
    expect(suggestOrderQuantity(40000, 0.05, 119.55, 'SHARES')).toEqual({ quantity: 16, totalCost: 1912.8 });
  });
  it('options: per-unit cost is price × 100 (one contract = 100 shares)', () => {
    // $40k capital, 5% deploy ($2000 budget), $9.20 premium -> per-contract cost $920 -> 2 contracts, $1840
    expect(suggestOrderQuantity(40000, 0.05, 9.2, 'OPTION')).toEqual({ quantity: 2, totalCost: 1840 });
  });
  it('floors rather than rounding up (never exceeds the budget)', () => {
    const { quantity, totalCost } = suggestOrderQuantity(1000, 0.5, 51, 'SHARES');
    expect(quantity).toBe(9); // 500 / 51 = 9.8 -> 9
    expect(totalCost).toBeCloseTo(459, 6);
  });
  it('zeros out on missing or non-positive inputs, never negative/fractional', () => {
    expect(suggestOrderQuantity(null, 0.05, 100, 'SHARES')).toEqual({ quantity: 0, totalCost: 0 });
    expect(suggestOrderQuantity(40000, 0, 100, 'SHARES')).toEqual({ quantity: 0, totalCost: 0 });
    expect(suggestOrderQuantity(40000, 0.05, 0, 'SHARES')).toEqual({ quantity: 0, totalCost: 0 });
    expect(suggestOrderQuantity(40000, 0.05, null, 'OPTION')).toEqual({ quantity: 0, totalCost: 0 });
    expect(suggestOrderQuantity(-1, 0.05, 100, 'SHARES')).toEqual({ quantity: 0, totalCost: 0 });
  });
});

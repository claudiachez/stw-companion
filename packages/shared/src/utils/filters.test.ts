import { describe, it, expect } from 'vitest';
import { applyFilters, sortFlat, sortByPnl, type FilterCriteria, type FilterableHolding } from './filters';
import type { Leg } from './legs';

const blank: FilterCriteria = { search: '', basket: '', tier: '', status: '', type: '' };

function legOf(instrument: 'SHARES' | 'OPTION'): Leg {
  return {
    id: 'l', ticker: 'X', trader_id: 't', parent_leg_id: null, instrument_type: instrument,
    option_strike: instrument === 'OPTION' ? 30 : null, option_expiry: instrument === 'OPTION' ? '2026-01-16' : null,
    option_right: instrument === 'OPTION' ? 'CALL' : null, direction: 'long', status: 'OPEN',
    entry_price: 1, weight: 1, mark_price: null, mark_price_source: null, mark_price_at: null,
    exit_price: null, realized_pnl_pct: null, opened_at: null, closed_at: null, close_reason: null,
  };
}

function h(over: Partial<FilterableHolding>): FilterableHolding {
  return {
    ticker: 'AAA', name: 'Alpha', basket: 'Defense', conviction: 3,
    last_action: 'Hold', legs: [legOf('SHARES')], rank: 1,
    action_date: '2026-01-01', current_weight: 5,
    ...over,
  };
}

describe('applyFilters', () => {
  const rows = [
    h({ ticker: 'NVDA', name: 'Nvidia',  basket: 'Defense', conviction: 5, last_action: 'New',    legs: [legOf('SHARES')] }),
    h({ ticker: 'PLTR', name: 'Palantir', basket: 'Defense', conviction: 4, last_action: 'Hold',   legs: [legOf('OPTION')] }),
    h({ ticker: 'NUKE', name: 'NuScale',  basket: 'Nuclear', conviction: 3, last_action: 'Closed', legs: [] }),
  ];

  it('no criteria → returns all', () => {
    expect(applyFilters(rows, blank)).toHaveLength(3);
  });

  it('filters by basket', () => {
    expect(applyFilters(rows, { ...blank, basket: 'Nuclear' }).map(r => r.ticker)).toEqual(['NUKE']);
  });

  it('filters by tier (conviction)', () => {
    expect(applyFilters(rows, { ...blank, tier: '5' }).map(r => r.ticker)).toEqual(['NVDA']);
  });

  it('filters by status (last_action)', () => {
    expect(applyFilters(rows, { ...blank, status: 'Closed' }).map(r => r.ticker)).toEqual(['NUKE']);
  });

  it('filters by position type', () => {
    expect(applyFilters(rows, { ...blank, type: 'options' }).map(r => r.ticker)).toEqual(['PLTR']);
    expect(applyFilters(rows, { ...blank, type: 'shares' }).map(r => r.ticker)).toEqual(['NVDA']);
  });

  it('search matches ticker / name / basket case-insensitively', () => {
    expect(applyFilters(rows, { ...blank, search: 'palan' }).map(r => r.ticker)).toEqual(['PLTR']);
    expect(applyFilters(rows, { ...blank, search: 'nuclear' }).map(r => r.ticker)).toEqual(['NUKE']);
  });

  it('hideClosed drops Closed positions', () => {
    expect(applyFilters(rows, { ...blank, hideClosed: true }).map(r => r.ticker)).toEqual(['NVDA', 'PLTR']);
  });

  it('hideClosed is overridden when explicitly filtering for Closed', () => {
    expect(applyFilters(rows, { ...blank, hideClosed: true, status: 'Closed' }).map(r => r.ticker)).toEqual(['NUKE']);
  });

  it('hideClosed undefined/false keeps Closed positions', () => {
    expect(applyFilters(rows, { ...blank, hideClosed: false })).toHaveLength(3);
    expect(applyFilters(rows, blank)).toHaveLength(3);
  });
});

describe('sortFlat', () => {
  const rows = [
    h({ ticker: 'BBB', conviction: 3, rank: 2, action_date: '2026-01-02', current_weight: 1 }),
    h({ ticker: 'AAA', conviction: 5, rank: 1, action_date: '2026-01-01', current_weight: 9 }),
    h({ ticker: 'CCC', conviction: 3, rank: 3, action_date: '2026-03-01', current_weight: 5 }),
  ];

  it('conviction desc, then rank asc', () => {
    expect(sortFlat(rows, 'conviction').map(r => r.ticker)).toEqual(['AAA', 'BBB', 'CCC']);
  });

  it('alphabetical a→z and z→a', () => {
    expect(sortFlat(rows, 'az').map(r => r.ticker)).toEqual(['AAA', 'BBB', 'CCC']);
    expect(sortFlat(rows, 'za').map(r => r.ticker)).toEqual(['CCC', 'BBB', 'AAA']);
  });

  it('recent / oldest by action_date', () => {
    expect(sortFlat(rows, 'recent').map(r => r.ticker)).toEqual(['CCC', 'BBB', 'AAA']);
    expect(sortFlat(rows, 'oldest').map(r => r.ticker)).toEqual(['AAA', 'BBB', 'CCC']);
  });

  it('weight desc / asc', () => {
    expect(sortFlat(rows, 'weight_desc').map(r => r.ticker)).toEqual(['AAA', 'CCC', 'BBB']);
    expect(sortFlat(rows, 'weight_asc').map(r => r.ticker)).toEqual(['BBB', 'CCC', 'AAA']);
  });

  it('does not mutate the input array', () => {
    const copy = [...rows];
    sortFlat(rows, 'az');
    expect(rows).toEqual(copy);
  });

  it('pnl modes fall back to conviction ordering (no price map available)', () => {
    expect(sortFlat(rows, 'pnl_desc').map(r => r.ticker)).toEqual(['AAA', 'BBB', 'CCC']);
    expect(sortFlat(rows, 'pnl_asc').map(r => r.ticker)).toEqual(['AAA', 'BBB', 'CCC']);
  });
});

describe('sortByPnl', () => {
  const rows = [
    h({ ticker: 'AAA' }),
    h({ ticker: 'BBB' }),
    h({ ticker: 'CCC' }),
    h({ ticker: 'DDD' }),
  ];
  const pnl = { AAA: 12, BBB: -5, CCC: 0, DDD: null };

  it('desc: highest P&L first, nulls last', () => {
    expect(sortByPnl(rows, pnl, 'desc').map(r => r.ticker)).toEqual(['AAA', 'CCC', 'BBB', 'DDD']);
  });

  it('asc: lowest P&L first, nulls last', () => {
    expect(sortByPnl(rows, pnl, 'asc').map(r => r.ticker)).toEqual(['BBB', 'CCC', 'AAA', 'DDD']);
  });

  it('missing ticker is treated as null (sorts last)', () => {
    expect(sortByPnl(rows, { AAA: 1, BBB: 2 }, 'desc').slice(0, 2).map(r => r.ticker)).toEqual(['BBB', 'AAA']);
  });

  it('does not mutate the input array', () => {
    const copy = [...rows];
    sortByPnl(rows, pnl, 'desc');
    expect(rows).toEqual(copy);
  });
});

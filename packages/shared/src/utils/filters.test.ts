import { describe, it, expect } from 'vitest';
import { applyFilters, sortFlat, type FilterCriteria, type FilterableHolding } from './filters';

const blank: FilterCriteria = { search: '', basket: '', tier: '', status: '', type: '' };

function h(over: Partial<FilterableHolding>): FilterableHolding {
  return {
    ticker: 'AAA', name: 'Alpha', basket: 'Defense', conviction: 3,
    last_action: 'Hold', position_detail: 'Common @ $10', rank: 1,
    action_date: '2026-01-01', current_weight: 5,
    ...over,
  };
}

describe('applyFilters', () => {
  const rows = [
    h({ ticker: 'NVDA', name: 'Nvidia',  basket: 'Defense',            conviction: 5, last_action: 'New',    position_detail: 'Common @ $100' }),
    h({ ticker: 'PLTR', name: 'Palantir', basket: 'Defense',           conviction: 4, last_action: 'Hold',   position_detail: '$30C Jan 26 @ $2' }),
    h({ ticker: 'NUKE', name: 'NuScale',  basket: 'Nuclear',           conviction: 3, last_action: 'Closed', position_detail: null }),
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
});

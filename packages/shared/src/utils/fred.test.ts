import { describe, it, expect } from 'vitest';
import { buildFredUrl, parseFredObservations, FRED_SERIES } from './fred';

describe('buildFredUrl', () => {
  it('includes series, key, json, desc + limit', () => {
    const url = buildFredUrl('VIXCLS', 'abc123', 300);
    expect(url).toContain('series_id=VIXCLS');
    expect(url).toContain('api_key=abc123');
    expect(url).toContain('file_type=json');
    expect(url).toContain('sort_order=desc');
    expect(url).toContain('limit=300');
  });
  it('defaults limit to 400', () => {
    expect(buildFredUrl('DGS10', 'k')).toContain('limit=400');
  });
});

describe('parseFredObservations', () => {
  it('returns ascending {date, close}, dropping "." missing rows', () => {
    const json = { observations: [
      { date: '2026-07-07', value: '17.2' },
      { date: '2026-07-06', value: '.' },      // holiday / not released
      { date: '2026-07-03', value: '16.8' },
    ] };
    expect(parseFredObservations(json)).toEqual([
      { date: '2026-07-03', close: 16.8 },
      { date: '2026-07-07', close: 17.2 },
    ]);
  });
  it('drops non-numeric values and tolerates junk input', () => {
    expect(parseFredObservations({ observations: [{ date: '2026-07-07', value: 'n/a' }] })).toEqual([]);
    expect(parseFredObservations(null)).toEqual([]);
    expect(parseFredObservations({})).toEqual([]);
  });
  it('exposes the canonical series ids', () => {
    expect(FRED_SERIES.vix).toBe('VIXCLS');
    expect(FRED_SERIES.vix3m).toBe('VXVCLS');
    expect(FRED_SERIES.us10y).toBe('DGS10');
    expect(FRED_SERIES.hyOas).toBe('BAMLH0A0HYM2');
    expect(FRED_SERIES.dollar).toBe('DTWEXBGS');
  });
});

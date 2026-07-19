import { describe, it, expect } from 'vitest';
import { liveNlvFromMarks, type LivePositionMark } from './nlv';

// A small book: two stock legs + one option leg. Synced NLV $41,099 (the verified PROD sync).
const BOOK: LivePositionMark[] = [
  { assetClass: 'STK', underlying: 'AAPL', quantity: 100, syncedMark: 150, multiplier: 1 },
  { assetClass: 'STK', underlying: 'MSFT', quantity: 50, syncedMark: 300, multiplier: 1 },
  { assetClass: 'OPT', underlying: 'AAPL', quantity: 5, syncedMark: 4.2, multiplier: 100 },
];
const SYNCED_NLV = 41_099;

// A quote map keyed by underlying → live price.
const quotes = (m: Record<string, number>) => (u: string) => (u in m ? m[u] : null);

describe('liveNlvFromMarks — live drawdown read (Item 2, Option A)', () => {
  it('no live quotes → falls back to the synced NLV, isLive false', () => {
    expect(liveNlvFromMarks(SYNCED_NLV, BOOK, () => null)).toEqual({ nlv: SYNCED_NLV, isLive: false });
  });

  it('a stock leg that ticks up raises the live NLV by the price delta × qty', () => {
    // AAPL 150 → 152 on 100 shares = +$200.
    const r = liveNlvFromMarks(SYNCED_NLV, BOOK, quotes({ AAPL: 152 }));
    expect(r.nlv).toBeCloseTo(SYNCED_NLV + 200, 5);
    expect(r.isLive).toBe(true);
  });

  it('a stock leg that ticks down lowers the live NLV', () => {
    // MSFT 300 → 290 on 50 shares = −$500.
    const r = liveNlvFromMarks(SYNCED_NLV, BOOK, quotes({ MSFT: 290 }));
    expect(r.nlv).toBeCloseTo(SYNCED_NLV - 500, 5);
  });

  it('sums deltas across multiple quoted stock legs', () => {
    // AAPL +$200, MSFT −$500 → net −$300.
    const r = liveNlvFromMarks(SYNCED_NLV, BOOK, quotes({ AAPL: 152, MSFT: 290 }));
    expect(r.nlv).toBeCloseTo(SYNCED_NLV - 300, 5);
  });

  it('IGNORES option legs — an underlying quote must not be applied to the option contract', () => {
    // Only the AAPL *stock* leg moves; the AAPL *option* leg keeps its synced mark.
    const r = liveNlvFromMarks(SYNCED_NLV, BOOK, quotes({ AAPL: 152 }));
    expect(r.nlv).toBeCloseTo(SYNCED_NLV + 200, 5); // +$200, NOT +200 + option contribution
  });

  it('a short stock leg moves the NLV the opposite way (signed quantity)', () => {
    const shortBook: LivePositionMark[] = [{ assetClass: 'STK', underlying: 'TSLA', quantity: -10, syncedMark: 200, multiplier: 1 }];
    // TSLA 200 → 210 on a −10 short = −$100 (a rising short is a loss).
    expect(liveNlvFromMarks(50_000, shortBook, quotes({ TSLA: 210 })).nlv).toBeCloseTo(49_900, 5);
  });

  it('respects the contract multiplier', () => {
    const book: LivePositionMark[] = [{ assetClass: 'STK', underlying: 'SPY', quantity: 2, syncedMark: 500, multiplier: 1 }];
    expect(liveNlvFromMarks(10_000, book, quotes({ SPY: 501 })).nlv).toBeCloseTo(10_002, 5);
  });

  it('a null synced NLV → null (nothing to base the live read off), isLive false', () => {
    expect(liveNlvFromMarks(null, BOOK, quotes({ AAPL: 152 }))).toEqual({ nlv: null, isLive: false });
  });

  it('a leg with a null synced mark is skipped (can\'t delta against nothing)', () => {
    const book: LivePositionMark[] = [{ assetClass: 'STK', underlying: 'NVDA', quantity: 10, syncedMark: null, multiplier: 1 }];
    expect(liveNlvFromMarks(10_000, book, quotes({ NVDA: 120 }))).toEqual({ nlv: 10_000, isLive: false });
  });
});

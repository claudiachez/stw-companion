import { describe, it, expect } from 'vitest';
import { chunk, runPaced, FEED_LIMITS } from './pacing';

describe('chunk', () => {
  it('splits into consecutive chunks of at most size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
  it('empty list → no chunks', () => {
    expect(chunk([], 8)).toEqual([]);
  });
  it('size >= length → single chunk', () => {
    expect(chunk([1, 2, 3], 10)).toEqual([[1, 2, 3]]);
  });
  it('throws on size < 1', () => {
    expect(() => chunk([1], 0)).toThrow();
  });
});

describe('runPaced', () => {
  const noSleep = async () => {};

  it('processes every item and preserves order', async () => {
    const out = await runPaced([1, 2, 3, 4, 5], async (n) => n * 10, FEED_LIMITS.twelvedata, { sleep: noSleep });
    expect(out).toEqual([10, 20, 30, 40, 50]);
  });

  it('passes the correct global index to the worker across chunks', async () => {
    const seen: Array<[number, number]> = [];
    await runPaced(['a', 'b', 'c'], async (item, i) => { seen.push([i, item.charCodeAt(0)]); return i; },
      FEED_LIMITS.twelvedata, { chunkSize: 2, sleep: noSleep });
    expect(seen.map((s) => s[0]).sort()).toEqual([0, 1, 2]);
  });

  it('sleeps between chunks but not after the last', async () => {
    const gaps: number[] = [];
    const sleep = async (ms: number) => { gaps.push(ms); };
    await runPaced([1, 2, 3, 4, 5], async (n) => n, FEED_LIMITS.twelvedata, { chunkSize: 2, gapMs: 1000, sleep });
    // 5 items / chunk 2 → 3 chunks → 2 gaps
    expect(gaps).toEqual([1000, 1000]);
  });

  it('does not sleep when everything fits in one chunk', async () => {
    const gaps: number[] = [];
    const sleep = async (ms: number) => { gaps.push(ms); };
    await runPaced([1, 2], async (n) => n, FEED_LIMITS.twelvedata, { chunkSize: 8, sleep });
    expect(gaps).toEqual([]);
  });

  it('a rejecting worker propagates', async () => {
    await expect(
      runPaced([1, 2], async (n) => { if (n === 2) throw new Error('boom'); return n; }, FEED_LIMITS.fred, { sleep: noSleep }),
    ).rejects.toThrow('boom');
  });

  it('config defaults apply when opts omit chunkSize/gapMs', async () => {
    // TwelveData chunkSize 8 → 10 items make 2 chunks → 1 gap at the config gapMs.
    const gaps: number[] = [];
    const sleep = async (ms: number) => { gaps.push(ms); };
    await runPaced(Array.from({ length: 10 }, (_, i) => i), async (n) => n, FEED_LIMITS.twelvedata, { sleep });
    expect(gaps).toEqual([FEED_LIMITS.twelvedata.gapMs]);
  });
});

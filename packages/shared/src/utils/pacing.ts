// Generic feed-pacing helper — one place that knows how to throttle a batch of
// work to stay under a provider's rate limit, so every data feed (TwelveData,
// FRED, Finnhub, Tiingo, …) routes through the SAME chunk-and-pause logic
// instead of each re-implementing it (and re-introducing the "unpaced burst
// 429s everything past the Nth" bug — see maCache.ts's history with TwelveData).
//
// The model: run `items` through `worker` in chunks of `chunkSize`, each chunk
// concurrently, pausing `gapMs` between chunks (never after the last). That maps
// cleanly onto every provider's "N calls per window" free tier — set chunkSize =
// N and gapMs = the window + a safety margin. `sleep` is injectable so the
// scheduling is unit-testable without real timers.

export interface FeedRateConfig {
  /** Human label for logs/errors, e.g. 'twelvedata'. */
  readonly name: string;
  /** Max units of work per window (TwelveData bills 1 credit/symbol → 8). */
  readonly chunkSize: number;
  /** Pause between chunks in ms — the provider's window + a safety margin. */
  readonly gapMs: number;
}

// Free-tier limits per provider (confirmed 2026-07: see plans/20260707_data_feeds_inventory_and_plan.md).
// gapMs is the rate window plus a safety margin so a chunk boundary never lands
// inside the previous window. Values that would gate a realistic batch (TwelveData)
// are tuned tight; roomy tiers (FRED/Finnhub/Tiingo) rarely reach a second chunk.
export const FEED_LIMITS = {
  /** 8 credits/min, 1 credit per symbol. */
  twelvedata: { name: 'twelvedata', chunkSize: 8, gapMs: 65_000 },
  /** ~120 requests/min. */
  fred: { name: 'fred', chunkSize: 100, gapMs: 65_000 },
  /** ~60 requests/min. */
  finnhub: { name: 'finnhub', chunkSize: 50, gapMs: 65_000 },
  /** 50 requests/hour (the binding window for Tiingo's free tier). */
  tiingo: { name: 'tiingo', chunkSize: 50, gapMs: 3_600_000 },
} as const satisfies Record<string, FeedRateConfig>;

/** Split a list into consecutive chunks of at most `size`. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size < 1) throw new Error(`chunk size must be >= 1, got ${size}`);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const realSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export interface PacedOptions {
  /** Overrides FeedRateConfig.chunkSize. */
  chunkSize?: number;
  /** Overrides FeedRateConfig.gapMs. */
  gapMs?: number;
  /** Injectable delay (tests pass a no-op); defaults to setTimeout. */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Run every item through `worker`, chunked and paced per `config`. Each chunk's
 * workers run concurrently; a `gapMs` pause separates chunks (not after the
 * last). Results come back in the SAME order as `items`. A worker that rejects
 * propagates — callers that want per-item resilience should catch inside `worker`
 * and return a sentinel (the maCache helpers return stale cache, for example).
 */
export async function runPaced<TItem, TResult>(
  items: readonly TItem[],
  worker: (item: TItem, index: number) => Promise<TResult>,
  config: FeedRateConfig,
  opts: PacedOptions = {},
): Promise<TResult[]> {
  const chunkSize = opts.chunkSize ?? config.chunkSize;
  const gapMs = opts.gapMs ?? config.gapMs;
  const sleep = opts.sleep ?? realSleep;

  const chunks = chunk(items, chunkSize);
  const results: TResult[] = [];
  for (let c = 0; c < chunks.length; c++) {
    const base = c * chunkSize;
    const chunkResults = await Promise.all(chunks[c].map((item, j) => worker(item, base + j)));
    results.push(...chunkResults);
    if (c < chunks.length - 1) await sleep(gapMs);
  }
  return results;
}

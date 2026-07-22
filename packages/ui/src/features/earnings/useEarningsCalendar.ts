import { useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { nextUpcomingEarnings, type EarningsEvent } from '@stw/shared';
import { useCapabilities } from '../../context/AppCapabilities';

// Upcoming earnings calendar (Finnhub), fetched PER SYMBOL for the tickers a surface
// tracks (holdings / MAG7 movers / the user's own positions).
//
// Why per-symbol and not one bulk call: Finnhub's free-tier BULK calendar
// (`/calendar/earnings` with no `symbol`) withholds roughly the nearest ~3 weeks — it
// only returns rows ~20+ days out — so a bulk call misses every near-term report, which
// is the whole point of the "Coming up" card (verified 2026-07-22: bulk earliest row was
// 3 weeks out; a per-symbol query returns the next-week date fine). We therefore fan out
// over exactly the tracked tickers, chunked to stay under Finnhub's free rate limit and
// cached 12h (report dates don't move intraday). Same VITE_FINNHUB_KEY as live quotes.

const WINDOW_DAYS = 45;
const CHUNK = 6;          // per-symbol requests fired at once
const BATCH_GAP_MS = 350; // pause between chunks to stay under the free-tier rate limit

interface FinnhubEarningsRow {
  symbol: string; date: string; hour?: string; quarter?: number; year?: number;
  epsEstimate?: number | null; epsActual?: number | null;
  revenueEstimate?: number | null; revenueActual?: number | null;
}

function num(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function toEvent(r: FinnhubEarningsRow): EarningsEvent {
  const hour = r.hour === 'bmo' || r.hour === 'amc' || r.hour === 'dmh' ? r.hour : null;
  return {
    symbol: r.symbol.toUpperCase(),
    date: r.date,
    hour,
    quarter: num(r.quarter),
    year: num(r.year),
    epsEstimate: num(r.epsEstimate),
    epsActual: num(r.epsActual),
    revenueEstimate: num(r.revenueEstimate),
    revenueActual: num(r.revenueActual),
  };
}

/** YYYY-MM-DD in ET, `offsetDays` from now. */
function etDate(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

async function fetchOne(symbol: string, from: string, to: string, key: string): Promise<EarningsEvent[]> {
  const url = `https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&symbol=${encodeURIComponent(symbol)}&token=${key}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Finnhub earnings HTTP ${res.status}`);
  const data = await res.json() as { earningsCalendar?: FinnhubEarningsRow[] };
  return (data.earningsCalendar ?? []).filter((r) => r.symbol && r.date).map(toEvent);
}

async function fetchEarnings(symbols: string[], finnhubKey: string): Promise<EarningsEvent[]> {
  const from = etDate(0);
  const to = etDate(WINDOW_DAYS);
  const out: EarningsEvent[] = [];
  let failures = 0;
  for (let i = 0; i < symbols.length; i += CHUNK) {
    const batch = symbols.slice(i, i + CHUNK);
    const results = await Promise.all(
      batch.map((s) => fetchOne(s, from, to, finnhubKey).catch(() => { failures += 1; return [] as EarningsEvent[]; })),
    );
    results.forEach((rs) => out.push(...rs));
    if (i + CHUNK < symbols.length) await new Promise((r) => setTimeout(r, BATCH_GAP_MS));
  }
  // Tolerate the odd per-symbol failure, but if EVERY call failed the feed is down — surface it.
  if (symbols.length > 0 && failures === symbols.length) throw new Error('Earnings feed unavailable');
  return out;
}

export interface EarningsCalendar {
  loading: boolean;
  /** Feed error (Finnhub non-200 / network / no key), so a silently-empty calendar is
   *  distinguishable from a genuinely empty one. */
  error: string | null;
  /** The soonest upcoming report for one ticker, or null. */
  getNext: (ticker: string) => EarningsEvent | null;
  /** Next report per ticker for the given set, soonest-first (tickers with none are dropped). */
  upcomingFor: (tickers: string[]) => EarningsEvent[];
}

/**
 * @param tickers The symbols to fetch earnings for (holdings / movers / own positions).
 *   Pass a single-element array on a detail pane. CASH and blanks are dropped.
 */
export function useEarningsCalendar(tickers: string[] = []): EarningsCalendar {
  const { finnhubKey } = useCapabilities();
  const symbols = useMemo(
    () => Array.from(new Set(tickers.map((t) => t.toUpperCase()).filter((t) => t && t !== 'CASH'))).sort(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tickers.join(',')],
  );

  const query = useQuery({
    queryKey: ['earnings-calendar', symbols],
    queryFn: () => fetchEarnings(symbols, finnhubKey!),
    enabled: !!finnhubKey && symbols.length > 0,
    staleTime: 12 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });

  const bySymbol = useMemo(() => {
    const m = new Map<string, EarningsEvent[]>();
    for (const e of query.data ?? []) {
      const list = m.get(e.symbol);
      if (list) list.push(e); else m.set(e.symbol, [e]);
    }
    return m;
  }, [query.data]);

  const getNext = useCallback(
    (ticker: string) => nextUpcomingEarnings(bySymbol.get(ticker.toUpperCase()) ?? []),
    [bySymbol],
  );

  const upcomingFor = useCallback(
    (list: string[]) => {
      const seen = new Set<string>();
      const out: EarningsEvent[] = [];
      for (const t of list) {
        const key = t.toUpperCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const next = getNext(key);
        if (next) out.push(next);
      }
      return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    },
    [getNext],
  );

  const error = query.isError
    ? (query.error instanceof Error ? query.error.message : 'Earnings feed unavailable')
    : (!finnhubKey ? 'No market-data key configured' : null);

  return { loading: query.isLoading, error, getNext, upcomingFor };
}

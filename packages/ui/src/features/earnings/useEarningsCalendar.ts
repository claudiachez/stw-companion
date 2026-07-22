import { useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { nextUpcomingEarnings, type EarningsEvent } from '@stw/shared';
import { useCapabilities } from '../../context/AppCapabilities';

// Upcoming earnings calendar (Finnhub). ONE forward-window call for the whole US
// tape is fetched + cached, then filtered client-side to whichever tickers a
// surface cares about (holdings / MAG7 / the user's own positions) — cheaper and
// simpler than per-symbol fan-out (Finnhub free ~60/min). Cached 12h: report
// dates don't move intraday. Uses the same VITE_FINNHUB_KEY already wired for
// live quotes (client-side by design).

const WINDOW_DAYS = 45;

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

async function fetchEarnings(finnhubKey: string): Promise<EarningsEvent[]> {
  const url = `https://finnhub.io/api/v1/calendar/earnings?from=${etDate(0)}&to=${etDate(WINDOW_DAYS)}&token=${finnhubKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Finnhub earnings HTTP ${res.status}`);
  const data = await res.json() as { earningsCalendar?: FinnhubEarningsRow[] };
  return (data.earningsCalendar ?? []).filter((r) => r.symbol && r.date).map(toEvent);
}

export interface EarningsCalendar {
  loading: boolean;
  /** Feed error (Finnhub non-200 / network), so a silent empty calendar is distinguishable
   *  from a genuinely empty one — e.g. a premium-gated or rate-limited earnings endpoint. */
  error: string | null;
  /** The soonest upcoming report for one ticker, or null. */
  getNext: (ticker: string) => EarningsEvent | null;
  /** Next report per ticker for the given set, soonest-first (tickers with none are dropped). */
  upcomingFor: (tickers: string[]) => EarningsEvent[];
}

export function useEarningsCalendar(): EarningsCalendar {
  const { finnhubKey } = useCapabilities();
  const query = useQuery({
    queryKey: ['earnings-calendar'],
    queryFn: () => fetchEarnings(finnhubKey!),
    enabled: !!finnhubKey,
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
    (tickers: string[]) => {
      const seen = new Set<string>();
      const out: EarningsEvent[] = [];
      for (const t of tickers) {
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

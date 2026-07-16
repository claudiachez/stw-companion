import { useState } from 'react';
import { earningsHourLabel, earningsProximity, fmtEpsEstimate, FONT_SIZE, FONT_WEIGHT, formatDate, type EarningsEvent } from '@stw/shared';

/** Which book a reporting ticker belongs to, most-relevant-first (yours > STW > index mover). */
export type EarningsCat = 'yours' | 'stw' | 'mover';

const CAT_META: Record<EarningsCat, { color: string; label: string }> = {
  yours: { color: 'var(--acc)', label: 'yours' },
  stw:   { color: 'var(--c3)',  label: 'STW' },
  mover: { color: 'var(--t3)',  label: 'mkt mover' },
};

interface Props {
  /** Upcoming reports for the tracked set, soonest-first. */
  events: EarningsEvent[];
  /** Tickers the signed-in user holds (their own IBKR positions) — highest priority. */
  ownTickers: string[];
  /** Tickers STW holds. A ticker in both `ownTickers` and here reads as "yours". */
  stwTickers: string[];
  loading: boolean;
  /** Open a held ticker's detail page. Called only for `yours`/`stw` rows (they have a
   *  detail page); `mover` rows have none, so they stay plain text. */
  onSelectTicker?: (symbol: string, cat: EarningsCat) => void;
}

/** One earnings row, single line: ticker · book tag · date · session · est EPS · proximity. */
function EarningsRow({ e, cat, onSelectTicker }: { e: EarningsEvent; cat: EarningsCat; onSelectTicker?: (symbol: string, cat: EarningsCat) => void }) {
  const hour = earningsHourLabel(e.hour);
  const eps = fmtEpsEstimate(e.epsEstimate);
  const meta = [hour, eps].filter(Boolean).join(' · ');
  const { color, label } = CAT_META[cat];
  const linkable = cat !== 'mover' && !!onSelectTicker;
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', padding: '7px 0', borderTop: '1px solid var(--border)', fontSize: FONT_SIZE.sm }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0, alignSelf: 'center' }} />
      {linkable ? (
        <button
          type="button"
          onClick={() => onSelectTicker!(e.symbol, cat)}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: FONT_WEIGHT.semibold, color: 'var(--acc)', fontSize: FONT_SIZE.sm }}
        >
          {e.symbol}
        </button>
      ) : (
        <span style={{ fontWeight: FONT_WEIGHT.semibold, color: 'var(--text)' }}>{e.symbol}</span>
      )}
      <span style={{ fontSize: FONT_SIZE['2xs'], color: cat === 'yours' ? 'var(--acc)' : 'var(--t3)' }}>{label}</span>
      <span style={{ color: 'var(--t2)' }}>{formatDate(e.date)}</span>
      {meta && <span style={{ color: 'var(--t3)' }}>{meta}</span>}
      <span style={{ marginLeft: 'auto', color: 'var(--t3)' }}>{earningsProximity(e.date)}</span>
    </div>
  );
}

export function EarningsAheadCard({ events, ownTickers, stwTickers, loading, onSelectTicker }: Props) {
  const [expanded, setExpanded] = useState(false);
  const own = new Set(ownTickers.map((t) => t.toUpperCase()));
  const stw = new Set(stwTickers.map((t) => t.toUpperCase()));
  const catOf = (symbol: string): EarningsCat => {
    const s = symbol.toUpperCase();
    return own.has(s) ? 'yours' : stw.has(s) ? 'stw' : 'mover';
  };

  if (loading && events.length === 0) return <div style={{ color: 'var(--t3)', fontSize: FONT_SIZE.sm }}>Loading earnings calendar…</div>;
  if (events.length === 0) return <div style={{ color: 'var(--t3)', fontSize: FONT_SIZE.sm }}>No tracked earnings scheduled in the next 45 days.</div>;

  const cutoff = Date.now() + 7 * 86_400_000;
  const within7 = events.filter((e) => new Date(`${e.date}T12:00:00Z`).getTime() <= cutoff);
  const laterCount = events.length - within7.length;
  const shown = expanded ? events : within7;

  return (
    <div>
      <div style={{ fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.semibold, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 2 }}>
        Reporting{expanded ? '' : ' · next 7 days'}
      </div>
      {shown.length === 0 && (
        <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t3)', padding: '7px 0', borderTop: '1px solid var(--border)' }}>
          Nothing reporting in the next 7 days.
        </div>
      )}
      {shown.map((e) => (
        <EarningsRow key={`${e.symbol}-${e.date}`} e={e} cat={catOf(e.symbol)} onSelectTicker={onSelectTicker} />
      ))}
      {laterCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{ marginTop: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: FONT_SIZE.sm, color: 'var(--t2)', textDecoration: 'underline' }}
        >
          {expanded ? 'Show less' : `Show more (${laterCount})`}
        </button>
      )}
      <div style={{ marginTop: 10, fontSize: FONT_SIZE['2xs'], color: 'var(--t3)' }}>
        Source: <a href="https://finnhub.io" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--t3)', textDecoration: 'underline' }}>Finnhub</a> earnings calendar · <span style={{ color: 'var(--acc)' }}>●</span> yours · <span style={{ color: 'var(--c3)' }}>●</span> STW · ● market-mover
      </div>
    </div>
  );
}

import { useState } from 'react';
import { earningsHourLabel, earningsProximity, fmtEpsEstimate, FONT_SIZE, FONT_WEIGHT, formatDate, type EarningsEvent } from '@stw/shared';

interface Props {
  /** Upcoming reports for the tracked set, soonest-first. */
  events: EarningsEvent[];
  /** Tickers STW holds — anything else in the list is a market-mover shown for index context. */
  heldTickers: string[];
  loading: boolean;
}

/** One earnings row, single line: ticker · date · session · est EPS · proximity. */
function EarningsRow({ e, held }: { e: EarningsEvent; held: boolean }) {
  const hour = earningsHourLabel(e.hour);
  const eps = fmtEpsEstimate(e.epsEstimate);
  const meta = [hour, eps].filter(Boolean).join(' · ');
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', padding: '7px 0', borderTop: '1px solid var(--border)', fontSize: FONT_SIZE.sm }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: held ? 'var(--acc)' : 'var(--t3)', flexShrink: 0, alignSelf: 'center' }} />
      <span style={{ fontWeight: FONT_WEIGHT.semibold, color: 'var(--text)' }}>{e.symbol}</span>
      {!held && <span style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)' }}>mkt mover</span>}
      <span style={{ color: 'var(--t2)' }}>{formatDate(e.date)}</span>
      {meta && <span style={{ color: 'var(--t3)' }}>{meta}</span>}
      <span style={{ marginLeft: 'auto', color: 'var(--t3)' }}>{earningsProximity(e.date)}</span>
    </div>
  );
}

export function EarningsAheadCard({ events, heldTickers, loading }: Props) {
  const [expanded, setExpanded] = useState(false);
  const held = new Set(heldTickers.map((t) => t.toUpperCase()));

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
        <EarningsRow key={`${e.symbol}-${e.date}`} e={e} held={held.has(e.symbol.toUpperCase())} />
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
        Source: <a href="https://finnhub.io" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--t3)', textDecoration: 'underline' }}>Finnhub</a> earnings calendar · <span style={{ color: 'var(--acc)' }}>●</span> held · ● market-mover
      </div>
    </div>
  );
}

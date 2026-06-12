import { useState, useMemo } from 'react';
import { mergeLegs, parseCostBasis, positionType, resolvePnl, inferDirection, type Direction } from '@stw/shared';
import { TradeEditForm } from './TradeEditForm';
import { TickerLink } from '../../../primitives/TickerLink';
import { usePriceCacheStore, type Quote } from '../../../store/priceCache';
import { useCapabilities } from '../../../context/AppCapabilities';
import { useIsMobile } from '../../../hooks/useIsMobile';
import type { Holding } from '../api';

const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtExpiry(e: string): string {
  if (!e || e.length < 6) return e || '';
  return `${MONTHS[parseInt(e.slice(4, 6), 10)] ?? ''} '${e.slice(2, 4)}`;
}
function daysBetween(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  const a = new Date(from + 'T00:00:00').getTime();
  const b = new Date(to + 'T00:00:00').getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

// One trade per parsed component of a holding: each option leg, plus a share lot.
interface TradeRow {
  key: string;
  holding: Holding;
  instrument: string;       // "Common" or "$7.5C Jul '26"
  openPrice: number | null; // entry, parsed from position_detail
  closePrice: number | null;
  currentPnl: number | null;
  realizedPnl: number | null;
  direction: Direction;
  isOpen: boolean;
  openDate: string | null;
  closeDate: string | null;
}

function buildTrades(holdings: Holding[], cache: Record<string, Quote>): TradeRow[] {
  const rows: TradeRow[] = [];
  for (const h of holdings) {
    if (h.ticker === 'CASH') continue;
    const isOpen = h.last_action !== 'Closed';
    const direction = h.direction ?? inferDirection(h.position_detail);
    const realizedPnl = isOpen ? null : (h.exit_pnl_pct ?? null);
    const openDate = h.action_date;
    const closeDate = isOpen ? null : h.action_date;
    const base = { holding: h, closePrice: null, realizedPnl, direction, isOpen, openDate, closeDate };
    let added = 0;

    for (const leg of mergeLegs(h.position_detail ?? '', h.ticker, h.ibkr_legs)) {
      rows.push({
        ...base,
        key: `${h.ticker}-${leg.strike}${leg.right}-${leg.expiry}`,
        instrument: `$${leg.strike}${leg.right} ${fmtExpiry(leg.expiry)}`,
        openPrice: leg.entry ?? null,
        currentPnl: isOpen ? (leg.pnl_pct ?? null) : null,
      });
      added++;
    }

    const cost = parseCostBasis(h.position_detail);
    if (cost != null) {
      const live = cache[h.ticker]?.c ?? h.last_price ?? null;
      rows.push({
        ...base,
        key: `${h.ticker}-common`,
        instrument: 'Common',
        openPrice: cost,
        currentPnl: isOpen ? resolvePnl({ positionType: 'shares', price: live, costBasis: cost, optionsPnlPct: null }).pnlPct : null,
      });
      added++;
    }

    // Unparseable detail → still show the position once, from holding-level data.
    if (added === 0) {
      const live = cache[h.ticker]?.c ?? h.last_price ?? null;
      rows.push({
        ...base,
        key: `${h.ticker}-pos`,
        instrument: h.position_detail || '—',
        openPrice: h.last_price ?? null,
        currentPnl: isOpen ? resolvePnl({ positionType: positionType(h.position_detail), price: live, costBasis: parseCostBasis(h.position_detail), optionsPnlPct: h.last_pnl_pct }).pnlPct : null,
      });
    }
  }

  return rows.sort((a, b) => {
    if (a.isOpen !== b.isOpen) return a.isOpen ? -1 : 1;
    if (a.holding.ticker !== b.holding.ticker) return a.holding.ticker < b.holding.ticker ? -1 : 1;
    return a.instrument < b.instrument ? -1 : 1;
  });
}

const th: React.CSSProperties = {
  textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.08em', color: 'var(--t3)', background: 'var(--s2)',
  padding: '7px 13px', borderBottom: '1px solid var(--bsub)', whiteSpace: 'nowrap',
};
const thR: React.CSSProperties = { ...th, textAlign: 'right' };

function pnlCell(v: number | null) {
  if (v == null) return { text: '—', color: 'var(--t3)' };
  return { text: `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`, color: v >= 0 ? 'var(--acc)' : '#ef4444' };
}
const money = (v: number | null) => (v != null ? `$${v.toFixed(2)}` : '—');
const days = (v: number | null) => (v != null ? `${v}d` : '—');

interface Props {
  holdings: Holding[];
  onSelectTicker?: (ticker: string) => void;
}

// Trade blotter — one row per parsed leg / share lot. Open Price comes from position_detail;
// open trades show live (unrealized) P&L, closed show the position's realized P&L.
export function TradesTable({ holdings, onSelectTicker }: Props) {
  const { canEdit } = useCapabilities();
  const priceCache = usePriceCacheStore((s) => s.cache);
  const isMobile = useIsMobile();
  const [editing, setEditing] = useState<Holding | null>(null);

  const trades = useMemo(() => buildTrades(holdings, priceCache), [holdings, priceCache]);
  const today = new Date().toISOString().slice(0, 10);

  const td: React.CSSProperties = {
    padding: '9px 13px', borderBottom: '1px solid var(--bsub)',
    verticalAlign: 'middle', lineHeight: 1.4, whiteSpace: 'nowrap',
  };
  const tdR: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

  return (
    <div>
      {editing && <TradeEditForm holding={editing} onDone={() => setEditing(null)} />}

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
        <div style={{ padding: '8px 13px', background: 'var(--s2)', borderBottom: '1px solid var(--bsub)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--t2)' }}>📈 Trades</span>
          {trades.length > 0 && <span style={{ fontSize: 10, color: 'var(--t3)', marginLeft: 'auto' }}>{trades.length}</span>}
        </div>

        <div style={{ overflowX: 'auto', paddingBottom: 9 }}>
          {trades.length === 0 ? (
            <p style={{ fontSize: 11, color: 'var(--t3)', padding: '12px 13px' }}>No trades yet.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={th}>Ticker</th>
                  <th style={thR}>Open</th>
                  {!isMobile && <th style={thR}>Close</th>}
                  <th style={th}>Type</th>
                  <th style={thR}>Current P&amp;L</th>
                  <th style={thR}>P&amp;L</th>
                  {!isMobile && <th style={thR}>Days Open</th>}
                  {!isMobile && <th style={thR}>Duration</th>}
                  {canEdit && <th style={thR}></th>}
                </tr>
              </thead>
              <tbody>
                {trades.map((t) => {
                  const cur = pnlCell(t.currentPnl);
                  const real = pnlCell(t.realizedPnl);
                  return (
                    <tr key={t.key}>
                      <td style={td}>
                        <TickerLink ticker={t.holding.ticker} onSelect={onSelectTicker} />
                        <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 1 }}>{t.instrument}</div>
                      </td>
                      <td style={{ ...tdR, color: 'var(--t2)' }}>{money(t.openPrice)}</td>
                      {!isMobile && <td style={{ ...tdR, color: 'var(--t2)' }}>{money(t.closePrice)}</td>}
                      <td style={{ ...td, color: 'var(--t2)', textTransform: 'capitalize' }}>{t.direction}</td>
                      <td style={{ ...tdR, color: cur.color, fontWeight: 600 }}>{cur.text}</td>
                      <td style={{ ...tdR, color: real.color, fontWeight: 600 }}>{real.text}</td>
                      {!isMobile && <td style={{ ...tdR, color: 'var(--t3)' }}>{days(t.isOpen ? daysBetween(t.openDate, today) : null)}</td>}
                      {!isMobile && <td style={{ ...tdR, color: 'var(--t3)' }}>{days(t.isOpen ? null : daysBetween(t.openDate, t.closeDate))}</td>}
                      {canEdit && (
                        <td style={tdR}>
                          <button
                            onClick={() => setEditing(t.holding)}
                            title="Edit trade"
                            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', color: 'var(--t2)', fontSize: 11, padding: '2px 8px' }}
                          >
                            Edit
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

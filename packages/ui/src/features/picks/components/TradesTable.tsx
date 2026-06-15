import { useState, useMemo } from 'react';
import { fmtLegInstrument, legIsOpen, legUnrealizedPnlPct, type Direction } from '@stw/shared';
import { TradeEditForm } from './TradeEditForm';
import { TickerLink } from '../../../primitives/TickerLink';
import { usePriceCacheStore, type Quote } from '../../../store/priceCache';
import { useCapabilities } from '../../../context/AppCapabilities';
import { useIsMobile } from '../../../hooks/useIsMobile';
import type { Holding } from '../api';

function daysBetween(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

// One trade row per leg (share lot or option leg). Open legs show live (unrealized) %-P&L;
// closed legs show their booked realized %; exercised legs carry no P&L (value moved to the
// spawned shares leg).
interface TradeRow {
  key: string;
  holding: Holding;
  instrument: string;       // "Common" or "$7.5C Jul '26"
  openPrice: number | null; // leg entry_price
  closePrice: number | null;
  currentPnl: number | null;
  realizedPnl: number | null;
  exercised: boolean;
  direction: Direction;
  isOpen: boolean;
  openDate: string | null;
  closeDate: string | null;
}

function buildTrades(holdings: Holding[], cache: Record<string, Quote>): TradeRow[] {
  const rows: TradeRow[] = [];
  for (const h of holdings) {
    if (h.ticker === 'CASH') continue;
    const live = cache[h.ticker]?.c ?? null;
    for (const leg of h.legs) {
      const isOpen = legIsOpen(leg);
      const exercised = leg.status === 'EXERCISED';
      rows.push({
        key: leg.id,
        holding: h,
        instrument: fmtLegInstrument(leg),
        openPrice: leg.entry_price,
        closePrice: leg.exit_price ?? null,
        currentPnl: isOpen ? legUnrealizedPnlPct(leg, live) : null,
        realizedPnl: isOpen ? null : leg.realized_pnl_pct,
        exercised,
        direction: leg.direction,
        isOpen,
        openDate: leg.opened_at ?? h.action_date,
        closeDate: leg.closed_at ?? null,
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

// Trade blotter — one row per leg (share lot or option leg). Open Price is the leg's
// entry_price; open legs show live (unrealized) %-P&L, closed show the leg's realized %.
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
                  const real = t.exercised
                    ? { text: 'Exercised', color: 'var(--t2)' }
                    : pnlCell(t.realizedPnl);
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

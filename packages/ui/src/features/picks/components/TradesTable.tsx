import { useState, useMemo } from 'react';
import { resolvePnl, positionType, parseCostBasis } from '@stw/shared';
import { useAllTransactions } from '../useHoldingHistory';
import { deriveTrades, daysBetween, type Trade } from '../trades';
import { TradeEditForm } from './TradeEditForm';
import { TickerLink } from '../../../primitives/TickerLink';
import { usePriceCacheStore } from '../../../store/priceCache';
import { useCapabilities } from '../../../context/AppCapabilities';
import { useIsMobile } from '../../../hooks/useIsMobile';
import type { Holding } from '../api';

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
const price = (v: number | null) => (v != null ? `$${v.toFixed(2)}` : '—');
const days = (v: number | null) => (v != null ? `${v}d` : '—');

interface Props {
  holdings: Holding[];
  onSelectTicker?: (ticker: string) => void;
}

// Trade blotter — one row per position lifecycle (leg). Open trades show live (unrealized)
// P&L; closed trades show realized P&L. Admin can edit each trade's open/close/direction.
export function TradesTable({ holdings, onSelectTicker }: Props) {
  const { data: transactions = [], isLoading } = useAllTransactions();
  const { canEdit } = useCapabilities();
  const priceCache = usePriceCacheStore((s) => s.cache);
  const isMobile = useIsMobile();
  const [editing, setEditing] = useState<Trade | null>(null);

  const trades = useMemo(() => deriveTrades(transactions), [transactions]);
  const holdingByTicker = useMemo(
    () => new Map(holdings.map((h) => [h.ticker, h])),
    [holdings],
  );
  const today = new Date().toISOString().slice(0, 10);

  // Live unrealized P&L for an open trade, from its current holding (matches the dashboard).
  function currentPnl(t: Trade): number | null {
    if (!t.isOpen) return null;
    const h = holdingByTicker.get(t.ticker);
    if (!h) return null;
    return resolvePnl({
      positionType: positionType(h.position_detail),
      price: priceCache[h.ticker]?.c ?? h.last_price ?? null,
      costBasis: parseCostBasis(h.position_detail),
      optionsPnlPct: h.last_pnl_pct,
    }).pnlPct;
  }

  const td: React.CSSProperties = {
    padding: '9px 13px', borderBottom: '1px solid var(--bsub)',
    verticalAlign: 'middle', lineHeight: 1.4, whiteSpace: 'nowrap',
  };
  const tdR: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

  return (
    <div>
      {editing && <TradeEditForm trade={editing} onDone={() => setEditing(null)} />}

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
        <div style={{ padding: '8px 13px', background: 'var(--s2)', borderBottom: '1px solid var(--bsub)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--t2)' }}>📈 Trades</span>
          {trades.length > 0 && <span style={{ fontSize: 10, color: 'var(--t3)', marginLeft: 'auto' }}>{trades.length}</span>}
        </div>

        <div style={{ overflowX: 'auto', paddingBottom: 9 }}>
          {isLoading ? (
            <p style={{ fontSize: 11, color: 'var(--t3)', padding: '12px 13px' }}>Loading…</p>
          ) : trades.length === 0 ? (
            <p style={{ fontSize: 11, color: 'var(--t3)', padding: '12px 13px' }}>No trades yet.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={th}>Ticker</th>
                  {!isMobile && <th style={thR}>Open</th>}
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
                  const cur = pnlCell(currentPnl(t));
                  const real = pnlCell(t.realizedPnl);
                  return (
                    <tr key={t.key}>
                      <td style={td}>
                        <TickerLink ticker={t.ticker} onSelect={onSelectTicker} />
                        {t.leg > 1 && <span style={{ fontSize: 9, color: 'var(--t3)', marginLeft: 4 }}>#{t.leg}</span>}
                      </td>
                      {!isMobile && <td style={{ ...tdR, color: 'var(--t2)' }}>{price(t.openPrice)}</td>}
                      {!isMobile && <td style={{ ...tdR, color: 'var(--t2)' }}>{price(t.closePrice)}</td>}
                      <td style={{ ...td, color: 'var(--t2)', textTransform: 'capitalize' }}>{t.direction}</td>
                      <td style={{ ...tdR, color: cur.color, fontWeight: 600 }}>{cur.text}</td>
                      <td style={{ ...tdR, color: real.color, fontWeight: 600 }}>{real.text}</td>
                      {!isMobile && <td style={{ ...tdR, color: 'var(--t3)' }}>{days(t.isOpen ? daysBetween(t.openDate, today) : null)}</td>}
                      {!isMobile && <td style={{ ...tdR, color: 'var(--t3)' }}>{days(t.isOpen ? null : daysBetween(t.openDate, t.closeDate))}</td>}
                      {canEdit && (
                        <td style={{ ...tdR }}>
                          <button
                            onClick={() => setEditing(t)}
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

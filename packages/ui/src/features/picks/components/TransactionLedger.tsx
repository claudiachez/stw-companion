import { useAllTransactions } from '../useHoldingHistory';
import { TickerLink } from '../../../primitives/TickerLink';
import { ActionBadge } from './ActionBadge';
import { useIsMobile } from '../../../hooks/useIsMobile';

const th: React.CSSProperties = {
  textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.08em', color: 'var(--t3)', background: 'var(--s2)',
  padding: '7px 13px', borderBottom: '1px solid var(--bsub)',
};

// Date-only display (no time component) — matches ConvictionTimeline / PortfolioDashboard.
function fmtEventDate(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface Props {
  onSelectTicker?: (ticker: string) => void;
}

// Combined blotter of every holding_transactions row across all tickers. Lives in the
// Picks overview panel; gated by canViewHistory at the call site.
export function TransactionLedger({ onSelectTicker }: Props) {
  const { data: transactions = [], isLoading } = useAllTransactions();
  const isMobile = useIsMobile();

  const td: React.CSSProperties = {
    padding: '9px 13px', borderBottom: '1px solid var(--bsub)',
    verticalAlign: 'middle', lineHeight: 1.4, whiteSpace: 'nowrap',
  };

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
      <div style={{ padding: '8px 13px', background: 'var(--s2)', borderBottom: '1px solid var(--bsub)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--t2)' }}>🧾 Transaction Ledger</span>
        {transactions.length > 0 && (
          <span style={{ fontSize: 10, color: 'var(--t3)', marginLeft: 'auto' }}>{transactions.length}</span>
        )}
      </div>

      <div style={{ overflowX: 'auto', paddingBottom: 9 }}>
        {isLoading ? (
          <p style={{ fontSize: 11, color: 'var(--t3)', padding: '12px 13px' }}>Loading…</p>
        ) : transactions.length === 0 ? (
          <p style={{ fontSize: 11, color: 'var(--t3)', padding: '12px 13px' }}>No transactions logged yet.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr>
                <th style={th}>Date</th>
                <th style={th}>Ticker</th>
                <th style={th}>Action</th>
                {!isMobile && <th style={{ ...th, textAlign: 'right' }}>Weight</th>}
                {!isMobile && <th style={{ ...th, textAlign: 'right' }}>Price</th>}
                <th style={{ ...th, textAlign: 'right' }}>P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.id}>
                  <td style={{ ...td, color: 'var(--t2)' }}>{fmtEventDate(tx.event_date)}</td>
                  <td style={td}><TickerLink ticker={tx.ticker} onSelect={onSelectTicker} /></td>
                  <td style={td}><ActionBadge action={tx.action} /></td>
                  {!isMobile && <td style={{ ...td, textAlign: 'right', color: 'var(--t2)' }}>{tx.weight != null ? `${tx.weight}%` : '—'}</td>}
                  {!isMobile && <td style={{ ...td, textAlign: 'right', color: 'var(--t3)' }}>{tx.price != null ? `$${tx.price.toFixed(2)}` : '—'}</td>}
                  <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: tx.pnl_pct == null ? 'var(--t3)' : tx.pnl_pct >= 0 ? 'var(--acc)' : '#ef4444' }}>
                    {tx.pnl_pct == null ? '—' : `${tx.pnl_pct >= 0 ? '+' : ''}${tx.pnl_pct.toFixed(1)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

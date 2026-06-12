import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Direction } from '@stw/shared';
import { updateHoldingTransaction } from '../api';
import type { Trade } from '../trades';

interface Props {
  trade: Trade;
  onDone: () => void;
}

const labelStyle: React.CSSProperties = {
  fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase',
  letterSpacing: '0.1em', marginBottom: 3, display: 'block',
};
const fieldStyle: React.CSSProperties = {
  width: '100%', background: 'var(--bg)', border: '1px solid var(--border)',
  borderRadius: 5, padding: '6px 8px', fontSize: 13, color: 'var(--text)',
};

const numOrNull = (v: string): number | null => (v.trim() === '' ? null : parseFloat(v));

// Full trade editor (admin only). Edits the open row (price/date/weight/position/direction)
// and, when present and distinct, the close row (price/date/realized P&L). Closing a still-open
// trade is done via the position's Status field, which the trigger logs as a Closed row.
export function TradeEditForm({ trade, onDone }: Props) {
  const queryClient = useQueryClient();
  const { openTx, closeTx } = trade;
  // Backfilled closed positions can have a single row that is both open and close.
  const sameRow = !!openTx && !!closeTx && openTx.id === closeTx.id;
  const showOpen = !!openTx && !sameRow;
  const showClose = !!closeTx;

  const [direction, setDirection] = useState<Direction>(trade.direction);
  const [openPrice, setOpenPrice] = useState(openTx?.price != null ? String(openTx.price) : '');
  const [openDate, setOpenDate] = useState(openTx?.event_date ?? '');
  const [weight, setWeight] = useState(openTx?.weight != null ? String(openTx.weight) : '');
  const [positionDetail, setPositionDetail] = useState(openTx?.position_detail ?? trade.positionDetail ?? '');
  const [closePrice, setClosePrice] = useState(closeTx?.price != null ? String(closeTx.price) : '');
  const [closeDate, setCloseDate] = useState(closeTx?.event_date ?? '');
  const [realizedPnl, setRealizedPnl] = useState(closeTx?.pnl_pct != null ? String(closeTx.pnl_pct) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setSaving(true);
    setError('');
    try {
      // Direction lives on the primary row (open if present, else close).
      const primaryId = openTx?.id ?? closeTx?.id;

      if (showOpen && openTx) {
        await updateHoldingTransaction(openTx.id, {
          price: numOrNull(openPrice),
          event_date: openDate || openTx.event_date,
          weight: numOrNull(weight),
          position_detail: positionDetail.trim() || null,
          ...(primaryId === openTx.id ? { direction } : {}),
        });
      }
      if (showClose && closeTx) {
        await updateHoldingTransaction(closeTx.id, {
          price: numOrNull(closePrice),
          event_date: closeDate || closeTx.event_date,
          pnl_pct: numOrNull(realizedPnl),
          ...(primaryId === closeTx.id ? { direction } : {}),
        });
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['all-transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['transactions', trade.ticker] }),
      ]);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--acc)', borderRadius: 6, padding: '12px 14px', marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--acc)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        ✎ Edit Trade — {trade.ticker}{trade.leg > 1 ? ` · Re-entry #${trade.leg}` : ''}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={labelStyle}>Direction</label>
          <select style={fieldStyle} value={direction} onChange={(e) => setDirection(e.target.value as Direction)}>
            <option value="long">Long</option>
            <option value="short">Short</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Weight %</label>
          <input style={fieldStyle} type="number" step="0.1" min="0" value={weight} placeholder="—" onChange={(e) => setWeight(e.target.value)} />
        </div>

        {showOpen && (
          <>
            <div>
              <label style={labelStyle}>Open Price $</label>
              <input style={fieldStyle} type="number" step="0.01" value={openPrice} placeholder="—" onChange={(e) => setOpenPrice(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Open Date</label>
              <input style={fieldStyle} type="date" value={openDate} onChange={(e) => setOpenDate(e.target.value)} />
            </div>
          </>
        )}

        {showClose && (
          <>
            <div>
              <label style={labelStyle}>Close Price $</label>
              <input style={fieldStyle} type="number" step="0.01" value={closePrice} placeholder="—" onChange={(e) => setClosePrice(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Close Date</label>
              <input style={fieldStyle} type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Realized P&amp;L %</label>
              <input style={fieldStyle} type="number" step="0.1" value={realizedPnl} placeholder="—" onChange={(e) => setRealizedPnl(e.target.value)} />
            </div>
          </>
        )}

        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Position Detail</label>
          <input style={fieldStyle} type="text" placeholder="e.g. Common @ $14.63" value={positionDetail} onChange={(e) => setPositionDetail(e.target.value)} />
        </div>
      </div>

      {!showClose && (
        <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 10 }}>
          This trade is open. To close it, set the position's Status to “Closed” — that logs the close automatically.
        </div>
      )}
      {error && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 10 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          onClick={save}
          disabled={saving}
          style={{ padding: '6px 14px', borderRadius: 5, border: 'none', cursor: 'pointer', background: 'var(--acc)', color: '#fff', fontSize: 12, fontWeight: 600, opacity: saving ? 0.6 : 1 }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={onDone}
          disabled={saving}
          style={{ padding: '6px 14px', borderRadius: 5, cursor: 'pointer', background: 'none', border: '1px solid var(--border)', color: 'var(--t2)', fontSize: 12 }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

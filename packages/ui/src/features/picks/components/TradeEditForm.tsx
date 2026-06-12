import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Direction } from '@stw/shared';
import { getSupabase } from '../../../lib/supabase';
import type { Holding } from '../api';

interface Props {
  holding: Holding;
  onDone: () => void;
}

const labelStyle: React.CSSProperties = {
  fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase',
  letterSpacing: '0.1em', marginBottom: 3, display: 'block',
};
const fieldStyle: React.CSSProperties = {
  width: '100%', background: 'var(--bg)', border: '1px solid var(--border)',
  borderRadius: 5, padding: '6px 8px', fontSize: 13, color: 'var(--text)', boxSizing: 'border-box',
};

const numOrNull = (v: string): number | null => (v.trim() === '' ? null : parseFloat(v));

// Trade editor — a centered modal so it always opens in view (regardless of which row was
// clicked). Edits the holding fields the Trades rows are derived from: the per-leg entry
// prices live in position_detail, so that's where "wrong information" is corrected.
export function TradeEditForm({ holding: h, onDone }: Props) {
  const queryClient = useQueryClient();
  const isClosed = h.last_action === 'Closed';

  const [direction, setDirection] = useState<Direction>(h.direction ?? 'long');
  const [positionDetail, setPositionDetail] = useState(h.position_detail ?? '');
  const [openDate, setOpenDate] = useState(h.action_date ?? '');
  const [weight, setWeight] = useState(h.current_weight != null ? String(h.current_weight) : '');
  const [lastPrice, setLastPrice] = useState(h.last_price != null ? String(h.last_price) : '');
  const [exitPnl, setExitPnl] = useState(h.exit_pnl_pct != null ? String(h.exit_pnl_pct) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setSaving(true);
    setError('');
    try {
      const updates: Record<string, unknown> = {
        direction,
        position_detail: positionDetail.trim() || null,
        action_date: openDate || null,
        current_weight: numOrNull(weight),
      };
      if (lastPrice !== '') updates.last_price = parseFloat(lastPrice);
      if (isClosed) updates.exit_pnl_pct = numOrNull(exitPnl);

      const { error: dbErr } = await getSupabase().from('holdings').update(updates).eq('ticker', h.ticker);
      if (dbErr) throw dbErr;

      await queryClient.invalidateQueries({ queryKey: ['holdings'] });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      onClick={onDone}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.55)', display: 'flex',
        alignItems: 'flex-start', justifyContent: 'center',
        padding: '8vh 16px 16px', overflowY: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 460, background: 'var(--surface)',
          border: '1px solid var(--acc)', borderRadius: 10, padding: '16px 18px',
          boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--acc)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          ✎ Edit Trade — {h.ticker}
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
          <div>
            <label style={labelStyle}>Open Date</label>
            <input style={fieldStyle} type="date" value={openDate} onChange={(e) => setOpenDate(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Underlying Price $</label>
            <input style={fieldStyle} type="number" step="0.01" value={lastPrice} placeholder="—" onChange={(e) => setLastPrice(e.target.value)} />
          </div>
          {isClosed && (
            <div>
              <label style={labelStyle}>Realized P&amp;L %</label>
              <input style={fieldStyle} type="number" step="0.1" value={exitPnl} placeholder="—" onChange={(e) => setExitPnl(e.target.value)} />
            </div>
          )}
        </div>

        <div style={{ marginTop: 10 }}>
          <label style={labelStyle}>Position Detail — entry prices &amp; legs (one trade per leg)</label>
          <textarea
            style={{ ...fieldStyle, minHeight: 64, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
            value={positionDetail}
            placeholder="e.g. $7.5C Jul 17 '26 @ $0.65 + $10C Oct '26 @ $2.24"
            onChange={(e) => setPositionDetail(e.target.value)}
          />
          <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 4 }}>
            Each leg ("$strikeC/P expiry @ $entry" or "Common @ $price") becomes its own trade row.
          </div>
        </div>

        {error && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 10 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button
            onClick={save}
            disabled={saving}
            style={{ padding: '7px 16px', borderRadius: 5, border: 'none', cursor: 'pointer', background: 'var(--acc)', color: '#fff', fontSize: 12, fontWeight: 600, opacity: saving ? 0.6 : 1 }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={onDone}
            disabled={saving}
            style={{ padding: '7px 16px', borderRadius: 5, cursor: 'pointer', background: 'none', border: '1px solid var(--border)', color: 'var(--t2)', fontSize: 12 }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

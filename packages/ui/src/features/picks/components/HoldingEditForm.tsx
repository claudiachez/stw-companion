import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { TIERS } from '@stw/shared';
import type { Holding } from '../api';
import { getSupabase } from '../../../lib/supabase';
import { useCapabilities } from '../../../context/AppCapabilities';

const CONVICTIONS = [5, 4, 3, 2, 1, 0];
const ACTIONS = ['New', 'Upsized', 'Trimmed', 'Hold', 'Closed'];

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
  borderRadius: 5, padding: '6px 8px', fontSize: 13, color: 'var(--text)',
};

export function HoldingEditForm({ holding: h, onDone }: Props) {
  const queryClient = useQueryClient();
  const { onEditHolding } = useCapabilities();
  const [conviction, setConviction] = useState(String(h.conviction ?? 3));
  const [lastAction, setLastAction] = useState(h.last_action ?? 'Hold');
  const [actionDate, setActionDate] = useState(h.action_date ?? '');
  const [initialWeight, setInitialWeight] = useState(h.initial_weight != null ? String(h.initial_weight) : '');
  const [currentWeight, setCurrentWeight] = useState(h.current_weight != null ? String(h.current_weight) : '');
  const [lastPrice, setLastPrice] = useState(h.last_price != null ? String(h.last_price) : '');
  const [positionDetail, setPositionDetail] = useState(h.position_detail ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setSaving(true);
    setError('');

    // For new positions (initial_weight never set), promote any entered current_weight
    // to initial_weight instead — current_weight is updated on weekly Friday runs.
    const parsedInitial = initialWeight ? parseFloat(initialWeight) : null;
    const parsedCurrent = currentWeight ? parseFloat(currentWeight) : null;
    const finalInitialWeight = parsedInitial ?? (h.initial_weight == null && parsedCurrent != null ? parsedCurrent : null);
    const finalCurrentWeight = (h.initial_weight == null && parsedInitial == null && parsedCurrent != null)
      ? null
      : parsedCurrent;

    const updates: Record<string, unknown> = {
      conviction: Number(conviction),
      last_action: lastAction,
      action_date: actionDate || null,
      initial_weight: finalInitialWeight,
      current_weight: finalCurrentWeight,
      position_detail: positionDetail.trim() || null,
    };
    if (lastPrice !== '') {
      updates.last_price = parseFloat(lastPrice);
      updates.last_price_at = new Date().toISOString();
    }

    try {
      const { error: dbErr } = await getSupabase().from('holdings').update(updates).eq('ticker', h.ticker);
      if (dbErr) throw dbErr;
      await queryClient.invalidateQueries({ queryKey: ['holdings'] });
      onEditHolding?.({ ...h, ...updates } as Holding);
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
        ✎ Edit Position Fields
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={labelStyle}>Conviction</label>
          <select style={fieldStyle} value={conviction} onChange={(e) => setConviction(e.target.value)}>
            {CONVICTIONS.map((v) => (
              <option key={v} value={v}>{v} — {TIERS[v].short}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Status</label>
          <select style={fieldStyle} value={lastAction} onChange={(e) => setLastAction(e.target.value)}>
            {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Action Date</label>
          <input style={fieldStyle} type="date" value={actionDate} onChange={(e) => setActionDate(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Last Price $</label>
          <input style={fieldStyle} type="number" step="0.01" min="0" value={lastPrice} placeholder="—" onChange={(e) => setLastPrice(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Initial Weight %</label>
          <input style={fieldStyle} type="number" step="0.1" min="0" value={initialWeight} placeholder="—" onChange={(e) => setInitialWeight(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Current Weight %</label>
          <input style={fieldStyle} type="number" step="0.1" min="0" value={currentWeight} onChange={(e) => setCurrentWeight(e.target.value)} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Position Detail</label>
          <input style={fieldStyle} type="text" placeholder="e.g. Common @ $14.63" value={positionDetail} onChange={(e) => setPositionDetail(e.target.value)} />
        </div>
      </div>

      {error && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 10 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          onClick={save}
          disabled={saving}
          style={{
            padding: '6px 14px', borderRadius: 5, border: 'none', cursor: 'pointer',
            background: 'var(--acc)', color: '#fff', fontSize: 12, fontWeight: 600,
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={onDone}
          disabled={saving}
          style={{
            padding: '6px 14px', borderRadius: 5, cursor: 'pointer',
            background: 'none', border: '1px solid var(--border)', color: 'var(--t2)', fontSize: 12,
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

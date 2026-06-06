import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { insertHoldingTransaction } from '../api';

const ACTIONS = ['New', 'Upsized', 'Trimmed', 'Hold', 'Closed'] as const;

const labelStyle: React.CSSProperties = {
  fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase',
  letterSpacing: '0.1em', marginBottom: 3, display: 'block',
};
const fieldStyle: React.CSSProperties = {
  width: '100%', background: 'var(--bg)', border: '1px solid var(--border)',
  borderRadius: 5, padding: '6px 8px', fontSize: 13, color: 'var(--text)',
};

interface Props {
  ticker: string;
  defaultLeg: number;
  onDone: () => void;
}

export function TransactionEventForm({ ticker, defaultLeg, onDone }: Props) {
  const queryClient = useQueryClient();
  const [action, setAction] = useState<typeof ACTIONS[number]>('New');
  const [eventDate, setEventDate] = useState(new Date().toISOString().slice(0, 10));
  const [leg, setLeg] = useState(String(defaultLeg));
  const [weight, setWeight] = useState('');
  const [positionDetail, setPositionDetail] = useState('');
  const [price, setPrice] = useState('');
  const [pnlPct, setPnlPct] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (!eventDate) { setError('Event date is required.'); return; }
    setSaving(true);
    setError('');
    try {
      await insertHoldingTransaction({
        ticker,
        leg: parseInt(leg) || 1,
        action,
        event_date: eventDate,
        weight: weight ? parseFloat(weight) : null,
        position_detail: positionDetail.trim() || null,
        price: price ? parseFloat(price) : null,
        pnl_pct: action === 'Closed' && pnlPct ? parseFloat(pnlPct) : null,
        notes: notes.trim() || null,
      });
      await queryClient.invalidateQueries({ queryKey: ['transactions', ticker] });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      background: 'var(--s2)', border: '1px solid var(--border)',
      borderRadius: 6, padding: '12px 14px', marginTop: 10,
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--acc)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        ＋ New Transaction Event
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={labelStyle}>Action</label>
          <select style={fieldStyle} value={action} onChange={(e) => setAction(e.target.value as typeof ACTIONS[number])}>
            {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Event Date</label>
          <input style={fieldStyle} type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Leg #</label>
          <input style={fieldStyle} type="number" min="1" step="1" value={leg} onChange={(e) => setLeg(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Weight %</label>
          <input style={fieldStyle} type="number" step="0.1" min="0" value={weight} placeholder="—" onChange={(e) => setWeight(e.target.value)} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Position Detail</label>
          <input style={fieldStyle} type="text" placeholder="e.g. Common @ $14.63" value={positionDetail} onChange={(e) => setPositionDetail(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Price $</label>
          <input style={fieldStyle} type="number" step="0.01" min="0" value={price} placeholder="—" onChange={(e) => setPrice(e.target.value)} />
        </div>
        {action === 'Closed' && (
          <div>
            <label style={labelStyle}>P&amp;L %</label>
            <input style={fieldStyle} type="number" step="0.01" value={pnlPct} placeholder="—" onChange={(e) => setPnlPct(e.target.value)} />
          </div>
        )}
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Notes</label>
          <input style={fieldStyle} type="text" value={notes} placeholder="Optional notes" onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      {error && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 10 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          onClick={save}
          disabled={saving}
          style={{
            padding: '6px 14px', borderRadius: 5, border: 'none', cursor: 'pointer',
            background: 'var(--acc)', color: '#000', fontSize: 12, fontWeight: 600,
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? 'Saving…' : 'Add Event'}
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

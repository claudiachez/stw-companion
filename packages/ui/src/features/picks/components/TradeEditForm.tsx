import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { fmtLegInstrument, humanizeLegEnum } from '@stw/shared';
import { updateLegWeight } from '../api';
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

// Per-leg weight editor — overrides the writer's 90/10 default split. Weight is the only
// sizing signal in the model, so this is the one position field an admin tunes by hand; entry
// prices and leg lifecycle (open / close / exercise) come from the routines / backfill.
export function TradeEditForm({ holding: h, onDone }: Props) {
  const queryClient = useQueryClient();
  // Local weight string per leg id (blank = clear the override → null).
  const [weights, setWeights] = useState<Record<string, string>>(
    Object.fromEntries(h.legs.map((l) => [l.id, l.weight != null ? String(l.weight) : ''])),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setSaving(true);
    setError('');
    try {
      // Only write legs whose weight actually changed.
      await Promise.all(
        h.legs
          .filter((l) => {
            const next = weights[l.id] ?? '';
            const prev = l.weight != null ? String(l.weight) : '';
            return next !== prev;
          })
          .map((l) => {
            const v = (weights[l.id] ?? '').trim();
            return updateLegWeight(l.id, v === '' ? null : parseFloat(v));
          }),
      );
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
          width: '100%', maxWidth: 420, background: 'var(--surface)',
          border: '1px solid var(--acc)', borderRadius: 10, padding: '16px 18px',
          boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--acc)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          ✎ Edit Leg Weights — {h.ticker}
        </div>
        <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 14 }}>
          Override the default split. Blank clears it back to the auto-weighting.
        </div>

        {h.legs.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--t3)' }}>No legs to weight yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {h.legs.map((l) => (
              <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{fmtLegInstrument(l)}</div>
                  <div style={{ fontSize: 10, color: 'var(--t3)' }}>
                    {humanizeLegEnum(l.instrument_type)} · {humanizeLegEnum(l.status)}
                  </div>
                </div>
                <div style={{ width: 92 }}>
                  <label style={labelStyle}>Weight %</label>
                  <input
                    style={fieldStyle}
                    type="number"
                    step="0.1"
                    min="0"
                    value={weights[l.id] ?? ''}
                    placeholder="auto"
                    onChange={(e) => setWeights((w) => ({ ...w, [l.id]: e.target.value }))}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {error && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 10 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button
            onClick={save}
            disabled={saving || h.legs.length === 0}
            style={{ padding: '7px 16px', borderRadius: 5, border: 'none', cursor: 'pointer', background: 'var(--acc)', color: '#fff', fontSize: 12, fontWeight: 600, opacity: saving || h.legs.length === 0 ? 0.6 : 1 }}
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

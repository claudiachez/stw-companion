import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { fmtLegInstrument, humanizeLegEnum, FONT_SIZE, FONT_WEIGHT } from '@stw/shared';
import { updateLegWeight } from '../api';
import type { Holding } from '../api';
import { Modal } from '../../../primitives/Modal';
import { Button } from '../../../primitives/Button';

interface Props {
  holding: Holding;
  onDone: () => void;
}

const labelStyle: React.CSSProperties = {
  fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', textTransform: 'uppercase',
  letterSpacing: '0.1em', marginBottom: 3, display: 'block',
};
const fieldStyle: React.CSSProperties = {
  width: '100%', background: 'var(--bg)', border: '1px solid var(--border)',
  borderRadius: 5, padding: '6px 8px', fontSize: FONT_SIZE.base, color: 'var(--text)', boxSizing: 'border-box',
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
    <Modal onClose={onDone} width="sm" title={`✎ Edit Leg Weights — ${h.ticker}`}>
        <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', marginBottom: 14 }}>
          Override the default split. Blank clears it back to the auto-weighting.
        </div>

        {h.legs.length === 0 ? (
          <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t3)' }}>No legs to weight yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {h.legs.map((l) => (
              <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold, color: 'var(--text)' }}>{fmtLegInstrument(l)}</div>
                  <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)' }}>
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

        {error && <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--status-negative-text)', marginTop: 10 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <Button variant="primary" onClick={save} disabled={saving || h.legs.length === 0}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
          <Button variant="ghost" onClick={onDone} disabled={saving}>
            Cancel
          </Button>
        </div>
    </Modal>
  );
}

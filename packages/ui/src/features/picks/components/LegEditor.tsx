import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  fmtLegInstrument, computeRealizedPct, legPnlPct,
  type Leg, type LegInstrument, type LegStatus, type OptionRight,
  type Direction, type LegCloseReason,
} from '@stw/shared';
import { insertLeg, updateLeg, deleteLeg, type LegEditableFields } from '../api';
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
const btnPrimary: React.CSSProperties = {
  padding: '7px 16px', borderRadius: 5, border: 'none', cursor: 'pointer',
  background: 'var(--acc)', color: '#fff', fontSize: 12, fontWeight: 600,
};
const btnGhost: React.CSSProperties = {
  padding: '7px 16px', borderRadius: 5, cursor: 'pointer', background: 'none',
  border: '1px solid var(--border)', color: 'var(--t2)', fontSize: 12,
};

const STATUSES: LegStatus[] = ['OPEN', 'CLOSED', 'EXPIRED_WORTHLESS', 'EXERCISED'];
const SELL_REASONS: LegCloseReason[] = ['PROFIT_TARGET', 'STOP_HIT', 'THESIS_BROKEN', 'TRAIL_STOP'];

// Working copy of a leg's editable fields as form strings.
interface Draft {
  instrument_type: LegInstrument;
  option_strike: string;
  option_right: OptionRight;
  option_expiry: string;
  direction: Direction;
  status: LegStatus;
  entry_price: string;
  weight: string;
  exit_price: string;
  close_reason: LegCloseReason | '';
  opened_at: string;
  closed_at: string;
}

function draftFromLeg(l?: Leg): Draft {
  return {
    instrument_type: l?.instrument_type ?? 'SHARES',
    option_strike: l?.option_strike != null ? String(l.option_strike) : '',
    option_right: l?.option_right ?? 'CALL',
    option_expiry: l?.option_expiry ?? '',
    direction: l?.direction ?? 'long',
    status: l?.status ?? 'OPEN',
    entry_price: l?.entry_price != null ? String(l.entry_price) : '',
    weight: l?.weight != null ? String(l.weight) : '',
    exit_price: l?.exit_price != null ? String(l.exit_price) : '',
    close_reason: l?.close_reason ?? '',
    opened_at: l?.opened_at ? l.opened_at.slice(0, 10) : '',
    closed_at: l?.closed_at ? l.closed_at.slice(0, 10) : '',
  };
}

// Build the DB payload from a draft, computing realized_pnl_pct the same way the 030 trigger does.
function toFields(d: Draft): LegEditableFields {
  const isOption = d.instrument_type === 'OPTION';
  const entry = d.entry_price.trim() === '' ? null : parseFloat(d.entry_price);
  const closed = d.status !== 'OPEN';
  const exit =
    d.status === 'EXPIRED_WORTHLESS' ? 0
    : d.status === 'CLOSED' && d.exit_price.trim() !== '' ? parseFloat(d.exit_price)
    : null;
  const realized =
    d.status === 'EXERCISED' ? null               // value transfers to the spawned shares leg
    : closed ? computeRealizedPct(entry, exit, d.direction)
    : null;
  const reason: LegCloseReason | null =
    d.status === 'EXPIRED_WORTHLESS' ? 'EXPIRED_WORTHLESS'
    : d.status === 'EXERCISED' ? 'EXERCISED'
    : d.status === 'CLOSED' ? (d.close_reason || (exit != null && entry != null && exit >= entry ? 'PROFIT_TARGET' : 'THESIS_BROKEN'))
    : null;
  return {
    instrument_type: d.instrument_type,
    option_strike: isOption && d.option_strike.trim() !== '' ? parseFloat(d.option_strike) : null,
    option_right: isOption ? d.option_right : null,
    option_expiry: isOption ? (d.option_expiry || null) : null,
    direction: d.direction,
    status: d.status,
    entry_price: entry,
    weight: d.weight.trim() === '' ? null : parseFloat(d.weight),
    exit_price: exit,
    realized_pnl_pct: realized,
    close_reason: reason,
    opened_at: d.opened_at || null,
    closed_at: closed ? (d.closed_at || null) : null,
  };
}

function validate(d: Draft): string | null {
  if (d.entry_price.trim() === '' || isNaN(parseFloat(d.entry_price))) return 'Entry price is required.';
  if (d.instrument_type === 'OPTION') {
    if (d.option_strike.trim() === '' || isNaN(parseFloat(d.option_strike))) return 'Strike is required for an option leg.';
    if (!d.option_expiry) return 'Expiry is required for an option leg.';
  }
  if (d.status === 'CLOSED' && (d.exit_price.trim() === '' || isNaN(parseFloat(d.exit_price)))) return 'Exit price is required to close a leg.';
  return null;
}

// One leg's add/edit form. `legId` undefined → add mode.
function LegForm({ ticker, leg, onSaved, onCancel }: { ticker: string; leg?: Leg; onSaved: () => void; onCancel: () => void }) {
  const [d, setD] = useState<Draft>(draftFromLeg(leg));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));

  const isOption = d.instrument_type === 'OPTION';
  const realizedPreview = d.status === 'CLOSED' || d.status === 'EXPIRED_WORTHLESS'
    ? computeRealizedPct(parseFloat(d.entry_price), d.status === 'EXPIRED_WORTHLESS' ? 0 : parseFloat(d.exit_price), d.direction)
    : null;

  async function save() {
    const err = validate(d);
    if (err) { setError(err); return; }
    setSaving(true); setError('');
    try {
      const fields = toFields(d);
      if (leg) await updateLeg(leg.id, fields);
      else await insertLeg(ticker, fields);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 6, padding: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--acc)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {leg ? `Edit leg — ${fmtLegInstrument(leg)}` : 'Add leg'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={labelStyle}>Instrument</label>
          <select style={fieldStyle} value={d.instrument_type} onChange={(e) => set('instrument_type', e.target.value as LegInstrument)}>
            <option value="SHARES">Common (shares)</option>
            <option value="OPTION">Option</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Direction</label>
          <select style={fieldStyle} value={d.direction} onChange={(e) => set('direction', e.target.value as Direction)}>
            <option value="long">Long</option>
            <option value="short">Short</option>
          </select>
        </div>

        {isOption && (
          <>
            <div>
              <label style={labelStyle}>Strike</label>
              <input style={fieldStyle} type="number" step="0.5" value={d.option_strike} onChange={(e) => set('option_strike', e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Right</label>
              <select style={fieldStyle} value={d.option_right} onChange={(e) => set('option_right', e.target.value as OptionRight)}>
                <option value="CALL">Call</option>
                <option value="PUT">Put</option>
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Expiry</label>
              <input style={fieldStyle} type="date" value={d.option_expiry} onChange={(e) => set('option_expiry', e.target.value)} />
            </div>
          </>
        )}

        <div>
          <label style={labelStyle}>Entry price</label>
          <input style={fieldStyle} type="number" step="0.01" value={d.entry_price} onChange={(e) => set('entry_price', e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Weight % {d.status !== 'OPEN' && <span style={{ textTransform: 'none', color: 'var(--t3)' }}>(0 when closed)</span>}</label>
          <input style={fieldStyle} type="number" step="0.1" min="0" placeholder="auto" value={d.weight} onChange={(e) => set('weight', e.target.value)} />
        </div>

        <div>
          <label style={labelStyle}>Status</label>
          <select style={fieldStyle} value={d.status} onChange={(e) => set('status', e.target.value as LegStatus)}>
            {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
        </div>
        {d.status === 'CLOSED' && (
          <div>
            <label style={labelStyle}>Exit price</label>
            <input style={fieldStyle} type="number" step="0.01" value={d.exit_price} onChange={(e) => set('exit_price', e.target.value)} />
          </div>
        )}
        {d.status === 'CLOSED' && (
          <div>
            <label style={labelStyle}>Close reason</label>
            <select style={fieldStyle} value={d.close_reason} onChange={(e) => set('close_reason', e.target.value as LegCloseReason)}>
              <option value="">auto (gain/loss)</option>
              {SELL_REASONS.map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
            </select>
          </div>
        )}

        <div>
          <label style={labelStyle}>Opened</label>
          <input style={fieldStyle} type="date" value={d.opened_at} onChange={(e) => set('opened_at', e.target.value)} />
        </div>
        {d.status !== 'OPEN' && (
          <div>
            <label style={labelStyle}>Closed</label>
            <input style={fieldStyle} type="date" value={d.closed_at} onChange={(e) => set('closed_at', e.target.value)} />
          </div>
        )}
      </div>

      {realizedPreview != null && (
        <div style={{ fontSize: 11, color: 'var(--t2)', marginTop: 8 }}>
          Realized P&L: <strong style={{ color: realizedPreview >= 0 ? 'var(--acc)' : '#ef4444' }}>{realizedPreview >= 0 ? '+' : ''}{realizedPreview.toFixed(1)}%</strong>
        </div>
      )}
      {error && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 8 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button onClick={save} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
        <button onClick={onCancel} disabled={saving} style={btnGhost}>Cancel</button>
      </div>
    </div>
  );
}

// Admin leg/transaction editor — add / edit / remove the structured legs that drive the Trades
// tab + per-leg P&L. Writes `legs` directly (see api.ts notes). Opened from HoldingDetail.
export function LegEditor({ holding: h, onDone }: Props) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'list' | 'add' | { editId: string }>('list');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['holdings'] });
  }

  async function remove(leg: Leg) {
    if (!window.confirm(`Remove ${fmtLegInstrument(leg)} from ${h.ticker}? This deletes the leg and its transaction log.`)) return;
    setBusyId(leg.id); setError('');
    try {
      await deleteLeg(leg.id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  const legs = [...h.legs].sort((a, b) =>
    (a.status === 'OPEN' ? 0 : 1) - (b.status === 'OPEN' ? 0 : 1) ||
    a.instrument_type.localeCompare(b.instrument_type));
  const editLeg = typeof mode === 'object' ? h.legs.find((l) => l.id === mode.editId) : undefined;

  return (
    <div
      onClick={onDone}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
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
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--acc)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          ⚙ Manage Legs — {h.ticker}
        </div>
        <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 14 }}>
          Add, edit, or remove the per-leg positions behind the Trades tab and P&amp;L.
        </div>

        {mode === 'add' || editLeg ? (
          <LegForm
            ticker={h.ticker}
            leg={editLeg}
            onCancel={() => setMode('list')}
            onSaved={async () => { await refresh(); setMode('list'); }}
          />
        ) : (
          <>
            {legs.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--t3)' }}>No legs yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {legs.map((l) => {
                  const pnl = legPnlPct(l, null);
                  return (
                    <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--s2)', border: '1px solid var(--bsub)', borderRadius: 6 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{fmtLegInstrument(l)}</div>
                        <div style={{ fontSize: 10, color: 'var(--t3)' }}>
                          {l.status.toLowerCase().replace('_', ' ')} · entry {l.entry_price ?? '–'}
                          {l.weight != null && ` · ${l.weight}%`}
                          {l.status !== 'OPEN' && pnl != null && ` · ${pnl >= 0 ? '+' : ''}${pnl.toFixed(1)}%`}
                        </div>
                      </div>
                      <button onClick={() => setMode({ editId: l.id })} disabled={busyId === l.id} style={{ ...btnGhost, padding: '4px 10px' }}>Edit</button>
                      <button
                        onClick={() => remove(l)}
                        disabled={busyId === l.id}
                        style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 5, cursor: 'pointer', color: '#ef4444', fontSize: 12, padding: '4px 9px' }}
                      >
                        {busyId === l.id ? '…' : '✕'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {error && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 10 }}>{error}</div>}

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={() => setMode('add')} style={btnPrimary}>＋ Add leg</button>
              <button onClick={onDone} style={btnGhost}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

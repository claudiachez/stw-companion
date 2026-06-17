import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  TIERS, deriveLegWeights, computeRealizedPct, humanizeLegEnum,
  type Leg, type LegInstrument, type LegStatus, type OptionRight, type Direction, type LegCloseReason,
} from '@stw/shared';
import type { Holding } from '../api';
import { getSupabase } from '../../../lib/supabase';
import { insertLegReturningId, updateLeg, deleteLeg, insertLegTransaction, type LegEditableFields } from '../api';
import { useCategories } from '../useCategories';
import { errMsg } from '../../../lib/errMsg';

const CONVICTIONS = [5, 4, 3, 2, 1, 0];
const ACTIONS = ['New', 'Upsized', 'Trimmed', 'Hold', 'Closed'];
const STATUSES: LegStatus[] = ['OPEN', 'CLOSED', 'EXPIRED_WORTHLESS', 'EXERCISED'];

const label: React.CSSProperties = { fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3, display: 'block' };
const field: React.CSSProperties = { width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 5, padding: '6px 8px', fontSize: 13, color: 'var(--text)', boxSizing: 'border-box' };

// A leg being edited in the form. `_id` empty = a new leg; `_remove` = delete on save.
interface LegDraft {
  _id: string;
  _orig?: Leg;
  _remove?: boolean;
  instrument_type: LegInstrument;
  option_strike: string;
  option_right: OptionRight;
  option_expiry: string;
  direction: Direction;
  status: LegStatus;
  entry_price: string;
  exit_price: string;
  weight: string;           // current weight (derived unless overridden)
  weight_overridden: boolean;
  opened_at: string;
}

function toDraft(l: Leg): LegDraft {
  return {
    _id: l.id, _orig: l,
    instrument_type: l.instrument_type,
    option_strike: l.option_strike != null ? String(l.option_strike) : '',
    option_right: l.option_right ?? 'CALL',
    option_expiry: l.option_expiry ?? '',
    direction: l.direction,
    status: l.status,
    entry_price: l.entry_price != null ? String(l.entry_price) : '',
    exit_price: l.exit_price != null ? String(l.exit_price) : '',
    weight: l.weight != null ? String(l.weight) : '',
    weight_overridden: l.weight_overridden,
    opened_at: l.opened_at ? l.opened_at.slice(0, 10) : '',
  };
}
function blankDraft(): LegDraft {
  return { _id: '', instrument_type: 'SHARES', option_strike: '', option_right: 'CALL', option_expiry: '', direction: 'long', status: 'OPEN', entry_price: '', exit_price: '', weight: '', weight_overridden: false, opened_at: '' };
}

interface Props { holding: Holding; onDone: () => void; }

export function PositionEditor({ holding: h, onDone }: Props) {
  const queryClient = useQueryClient();
  const { data: categories = [] } = useCategories();
  const [conviction, setConviction] = useState(String(h.conviction ?? 3));
  const [lastAction, setLastAction] = useState(h.last_action ?? 'Hold');
  const [actionDate, setActionDate] = useState(h.action_date ?? '');
  const [categoryId, setCategoryId] = useState(h.category_id ?? '');
  const [initialWeight, setInitialWeight] = useState(h.initial_weight != null ? String(h.initial_weight) : '');
  const [currentWeight, setCurrentWeight] = useState(h.current_weight != null ? String(h.current_weight) : '');
  const [legs, setLegs] = useState<LegDraft[]>(h.legs.map(toDraft));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const setLeg = (i: number, patch: Partial<LegDraft>) => setLegs((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  // Live preview of the 90/10-derived per-leg weights from the entered position weight.
  const liveLegs = legs.filter((l) => !l._remove && l.status === 'OPEN').map((l) => ({ id: l._id || `new${legs.indexOf(l)}`, instrument_type: l.instrument_type, weight: l.weight === '' ? null : parseFloat(l.weight), weight_overridden: l.weight_overridden }));
  const derived = deriveLegWeights(currentWeight === '' ? null : parseFloat(currentWeight), liveLegs);
  const derivedFor = (i: number) => derived[legs[i]._id || `new${i}`];

  async function save() {
    setSaving(true); setError('');
    try {
      const sb = getSupabase();
      const aDate = actionDate || new Date().toISOString().slice(0, 10);

      // 1) holdings — identity + position weight (the input; legs split from current_weight)
      const initNum = initialWeight === '' ? null : parseFloat(initialWeight);
      const curNum = currentWeight === '' ? null : parseFloat(currentWeight);
      const { error: hErr } = await sb.from('holdings').update({
        conviction: Number(conviction), last_action: lastAction, action_date: actionDate || null,
        category_id: categoryId || null, initial_weight: initNum, current_weight: curNum,
      }).eq('ticker', h.ticker);
      if (hErr) throw hErr;

      // 2) deletes
      for (const l of legs.filter((x) => x._remove && x._id)) await deleteLeg(l._id);

      // 3) creates + updates (structural + status); collect the final open set for weight derivation
      const live = legs.filter((l) => !l._remove);
      const idByIndex: Record<number, string> = {};
      for (let i = 0; i < live.length; i++) {
        const l = live[i];
        const fields = legFields(l);
        if (!l._id) {
          const id = await insertLegReturningId(h.ticker, fields);
          idByIndex[i] = id;
          // opening event
          await insertLegTransaction(id, { action_type: 'BUY', price: num(l.entry_price), weight: num(l.weight), close_reason: null, executed_at: `${l.opened_at || aDate}T13:00:00-04:00` });
        } else {
          idByIndex[i] = l._id;
          await updateLeg(l._id, fields);
          // log a close event when a leg transitions OPEN → closed in this save
          if (l._orig && l._orig.status === 'OPEN' && l.status !== 'OPEN') {
            const action = l.status === 'EXPIRED_WORTHLESS' ? 'EXPIRED' : l.status === 'EXERCISED' ? 'EXERCISED' : 'SELL';
            await insertLegTransaction(l._id, { action_type: action, price: l.status === 'EXPIRED_WORTHLESS' ? 0 : num(l.exit_price), weight: 0, close_reason: fields.close_reason, executed_at: `${aDate}T13:00:00-04:00` });
          }
        }
      }

      // 4) derive + write per-leg weights from the position's current weight (skip overridden + closed)
      const openLive = live.map((l, i) => ({ l, id: idByIndex[i] })).filter(({ l }) => l.status === 'OPEN');
      const dmap = deriveLegWeights(curNum, openLive.map(({ l, id }) => ({ id, instrument_type: l.instrument_type, weight: num(l.weight), weight_overridden: l.weight_overridden })));
      for (const { l, id } of openLive) {
        const w = l.weight_overridden ? num(l.weight) : (dmap[id] ?? null);
        await updateLeg(id, { weight: w } as LegEditableFields);
      }

      await queryClient.invalidateQueries({ queryKey: ['holdings'] });
      await queryClient.invalidateQueries({ queryKey: ['leg-transactions', h.ticker] });
      onDone();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div onClick={onDone} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '6vh 16px 16px', overflowY: 'auto' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 560, background: 'var(--surface)', border: '1px solid var(--acc)', borderRadius: 10, padding: '16px 18px', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--acc)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>✎ Edit {h.ticker}</div>

        {/* Position fields */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><label style={label}>Conviction</label>
            <select style={field} value={conviction} onChange={(e) => setConviction(e.target.value)}>{CONVICTIONS.map((v) => <option key={v} value={v}>{v} — {TIERS[v].short}</option>)}</select></div>
          <div><label style={label}>Status</label>
            <select style={field} value={lastAction} onChange={(e) => setLastAction(e.target.value)}>{ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}</select></div>
          <div><label style={label}>Category</label>
            <select style={field} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}><option value="">— Uncategorized —</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div><label style={label}>Action Date</label>
            <input style={field} type="date" value={actionDate} onChange={(e) => setActionDate(e.target.value)} /></div>
          <div><label style={label}>Initial Position Weight %</label>
            <input style={field} type="number" step="0.1" min="0" value={initialWeight} placeholder="—" onChange={(e) => setInitialWeight(e.target.value)} /></div>
          <div><label style={label}>Current Position Weight %</label>
            <input style={field} type="number" step="0.1" min="0" value={currentWeight} placeholder="—" onChange={(e) => setCurrentWeight(e.target.value)} /></div>
        </div>
        <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 6 }}>
          Per-leg weights split from the position weight (90% shares / 10% options); type a leg weight to override + pin it.
        </div>

        {/* Legs */}
        <div style={{ marginTop: 14, borderTop: '1px dashed var(--border)', paddingTop: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Legs</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {legs.map((l, i) => l._remove ? null : (
              <div key={l._id || `n${i}`} style={{ background: 'var(--s2)', border: '1px solid var(--bsub)', borderRadius: 6, padding: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 0.8fr 0.8fr', gap: 8, alignItems: 'end' }}>
                  <div><label style={label}>Instrument</label>
                    <select style={field} value={l.instrument_type} onChange={(e) => setLeg(i, { instrument_type: e.target.value as LegInstrument })}>
                      <option value="SHARES">Common</option><option value="OPTION">Option</option></select></div>
                  {l.instrument_type === 'OPTION' ? (<>
                    <div><label style={label}>Strike</label><input style={field} type="number" step="0.5" value={l.option_strike} onChange={(e) => setLeg(i, { option_strike: e.target.value })} /></div>
                    <div><label style={label}>Right</label><select style={field} value={l.option_right} onChange={(e) => setLeg(i, { option_right: e.target.value as OptionRight })}><option value="CALL">Call</option><option value="PUT">Put</option></select></div>
                    <div style={{ gridColumn: '1 / -1' }}><label style={label}>Expiry</label><input style={field} type="date" value={l.option_expiry} onChange={(e) => setLeg(i, { option_expiry: e.target.value })} /></div>
                  </>) : <><div /><div /></>}
                  <div><label style={label}>Entry</label><input style={field} type="number" step="0.01" value={l.entry_price} onChange={(e) => setLeg(i, { entry_price: e.target.value })} /></div>
                  <div><label style={label}>Status</label><select style={field} value={l.status} onChange={(e) => setLeg(i, { status: e.target.value as LegStatus })}>{STATUSES.map((s) => <option key={s} value={s}>{humanizeLegEnum(s)}</option>)}</select></div>
                  <div>
                    <label style={label}>Weight %{l.weight_overridden ? ' (pinned)' : ''}</label>
                    <input style={{ ...field, ...(l.weight_overridden ? { borderColor: 'var(--acc)' } : {}) }} type="number" step="0.1"
                      value={l.weight_overridden ? l.weight : (derivedFor(i) != null ? String(derivedFor(i)) : '')}
                      placeholder="auto"
                      onChange={(e) => setLeg(i, { weight: e.target.value, weight_overridden: e.target.value !== '' })} />
                  </div>
                  {l.status === 'CLOSED' && <div><label style={label}>Exit</label><input style={field} type="number" step="0.01" value={l.exit_price} onChange={(e) => setLeg(i, { exit_price: e.target.value })} /></div>}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {l.weight_overridden && <button onClick={() => setLeg(i, { weight_overridden: false, weight: '' })} style={{ fontSize: 10, color: 'var(--t2)', background: 'none', border: '1px solid var(--border)', borderRadius: 5, cursor: 'pointer', padding: '4px 8px' }}>Unpin</button>}
                    <button onClick={() => setLeg(i, { _remove: true })} title="Remove leg" style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 5, cursor: 'pointer', color: '#ef4444', fontSize: 12, padding: '4px 9px' }}>✕</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => setLegs((ls) => [...ls, blankDraft()])} style={{ marginTop: 10, padding: '6px 12px', borderRadius: 5, border: '1px dashed var(--border)', cursor: 'pointer', background: 'none', color: 'var(--acc)', fontSize: 12, fontWeight: 600 }}>＋ Add leg</button>
        </div>

        {error && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 10 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button onClick={save} disabled={saving} style={{ padding: '7px 16px', borderRadius: 5, border: 'none', cursor: 'pointer', background: 'var(--acc)', color: '#fff', fontSize: 12, fontWeight: 600, opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
          <button onClick={onDone} disabled={saving} style={{ padding: '7px 16px', borderRadius: 5, cursor: 'pointer', background: 'none', border: '1px solid var(--border)', color: 'var(--t2)', fontSize: 12 }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function num(s: string): number | null { return s.trim() === '' ? null : parseFloat(s); }

// Map a draft to the legs-table fields (weight is written separately after derivation).
function legFields(l: LegDraft): LegEditableFields {
  const isOpt = l.instrument_type === 'OPTION';
  const entry = num(l.entry_price);
  const exit = l.status === 'EXPIRED_WORTHLESS' ? 0 : l.status === 'CLOSED' ? num(l.exit_price) : null;
  const realized = l.status === 'EXERCISED' ? null : l.status !== 'OPEN' ? computeRealizedPct(entry, exit, l.direction) : null;
  const reason: LegCloseReason | null = l.status === 'EXPIRED_WORTHLESS' ? 'EXPIRED_WORTHLESS' : l.status === 'EXERCISED' ? 'EXERCISED'
    : l.status === 'CLOSED' ? (exit != null && entry != null && exit >= entry ? 'PROFIT_TARGET' : 'THESIS_BROKEN') : null;
  return {
    instrument_type: l.instrument_type,
    option_strike: isOpt && l.option_strike.trim() !== '' ? parseFloat(l.option_strike) : null,
    option_right: isOpt ? l.option_right : null,
    option_expiry: isOpt ? (l.option_expiry || null) : null,
    direction: l.direction,
    status: l.status,
    entry_price: entry,
    initial_weight: l._orig?.initial_weight ?? num(l.weight),
    weight: num(l.weight),
    weight_overridden: l.weight_overridden,
    exit_price: exit,
    realized_pnl_pct: realized,
    close_reason: reason,
    opened_at: l.opened_at || null,
    closed_at: l.status !== 'OPEN' ? (l._orig?.closed_at ?? null) : null,
  } as LegEditableFields;
}

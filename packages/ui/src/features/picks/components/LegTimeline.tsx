import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  fmtOptionExpiry, type Leg, type LegInstrument, type OptionRight, type Direction,
} from '@stw/shared';
import { useLegTransactions } from '../useHoldingHistory';
import { useCapabilities } from '../../../context/AppCapabilities';
import { useIsMobile } from '../../../hooks/useIsMobile';
import { errMsg } from '../../../lib/errMsg';
import {
  insertLegReturningId, insertLegTransaction, updateLegTransaction, updateLeg, deleteLegTransaction,
  type LegEvent, type LegEventInput,
} from '../api';

// The Transaction History ledger — the editable diary (leg_transactions). Every row is one host
// action on one leg; the 040 trigger derives the legs from these, so the ledger is the source of
// truth. Admins add / edit / delete rows here; the scoreboard re-derives automatically.

const ACTIONS = ['New', 'Upsized', 'Trimmed', 'Closed', 'Exercised', 'Expired'] as const;
type ActionLabel = (typeof ACTIONS)[number];

function actionToType(a: ActionLabel): LegEvent['action_type'] {
  if (a === 'Trimmed' || a === 'Closed') return 'SELL';
  if (a === 'Exercised') return 'EXERCISED';
  if (a === 'Expired') return 'EXPIRED';
  return 'BUY'; // New, Upsized
}

// Verb to show: the stored action_label, else derived from the mechanical type (legacy rows).
function displayAction(ev: LegEvent): ActionLabel | string {
  if (ev.action_label) return ev.action_label;
  if (ev.action_type === 'EXPIRED') return 'Expired';
  if (ev.action_type === 'EXERCISED') return 'Exercised';
  if (ev.action_type === 'SELL') return (ev.weight ?? 0) === 0 ? 'Closed' : 'Trimmed';
  return 'New';
}

// One "Details" cell: "Shares" for a share lot, "$30C Sep '26" for an option leg.
function detailLabel(ev: LegEvent): string {
  const l = ev.leg;
  if (!l) return '—';
  if (l.instrument_type === 'SHARES') return 'Shares';
  const right = l.option_right === 'PUT' ? 'P' : 'C';
  return `$${l.option_strike}${right} ${fmtOptionExpiry(l.option_expiry)}`.trim();
}
function fmtDay(s: string): string {
  const [y, m, d] = s.slice(0, 10).split('-');
  const mon = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][parseInt(m, 10)] ?? '';
  return `${mon} ${parseInt(d, 10)}, '${y.slice(2)}`;
}
const pct = (n: number | null) => (n == null ? '—' : `${n}%`);
const usd = (n: number | null) => (n == null ? '—' : `$${n}`);

const th: React.CSSProperties = { fontSize: 9, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', padding: '4px 8px', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { fontSize: 11, color: 'var(--t2)', padding: '6px 8px', verticalAlign: 'top' };
const iconBtn: React.CSSProperties = { background: 'none', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', fontSize: 11, padding: '2px 6px', color: 'var(--t2)' };

export function LegTimeline({ ticker, legs = [] }: { ticker: string; legs?: Leg[] }) {
  const { canEdit } = useCapabilities();
  const isMobile = useIsMobile();
  const { data: events = [], isLoading } = useLegTransactions(ticker);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'open' | 'closed'>('all');

  // which legs are still open → used to dim/filter their rows
  const openLegIds = useMemo(() => new Set(legs.filter((l) => l.status === 'OPEN').map((l) => l.id)), [legs]);
  const isRowOpen = (e: LegEvent) => openLegIds.has(e.leg_id);

  // newest first; count events per leg (to guard deleting a leg's only event)
  const sorted = useMemo(() => [...events].sort((a, b) => b.executed_at.localeCompare(a.executed_at) || b.id.localeCompare(a.id)), [events]);
  const rows = sorted.filter((e) => filter === 'all' || (filter === 'open' ? isRowOpen(e) : !isRowOpen(e)));
  const eventCountByLeg = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of events) m.set(e.leg_id, (m.get(e.leg_id) ?? 0) + 1);
    return m;
  }, [events]);

  if (isLoading) return <div style={{ fontSize: 12, color: 'var(--t3)', padding: '8px 0' }}>Loading…</div>;

  const addForm = adding && (
    <EventForm ticker={ticker} legs={legs} onDone={() => setAdding(false)} />
  );

  if (events.length === 0 && !adding) {
    return (
      <div>
        <div style={{ fontSize: 12, color: 'var(--t3)', padding: '4px 0' }}>No activity yet.</div>
        {canEdit && <AddButton onClick={() => setAdding(true)} />}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        {canEdit && !adding && <AddButton onClick={() => setAdding(true)} inline />}
        <div style={{ display: 'flex', gap: 0, border: '1px solid var(--border)', borderRadius: 5, overflow: 'hidden' }}>
          {(['all', 'open', 'closed'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ fontSize: 11, padding: '3px 10px', border: 'none', cursor: 'pointer', textTransform: 'capitalize',
                background: filter === f ? 'var(--acc)' : 'transparent', color: filter === f ? '#fff' : 'var(--t2)' }}>
              {f}
            </button>
          ))}
        </div>
      </div>
      {addForm}

      {isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((e) => editingId === e.id
            ? <EventForm key={e.id} ticker={ticker} legs={legs} event={e} onDone={() => setEditingId(null)} />
            : <MobileCard key={e.id} ev={e} canEdit={canEdit} dim={!isRowOpen(e)} onlyEvent={eventCountByLeg.get(e.leg_id) === 1}
                onEdit={() => setEditingId(e.id)} ticker={ticker} />)}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={th}>Date</th><th style={th}>Action</th>
                <th style={th}>Details</th><th style={th}>Price</th><th style={th}>Weight</th>
                <th style={th}>Notes</th>{canEdit && <th style={th} />}
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => editingId === e.id ? (
                <tr key={e.id}><td colSpan={canEdit ? 7 : 6} style={{ padding: '6px 0' }}>
                  <EventForm ticker={ticker} legs={legs} event={e} onDone={() => setEditingId(null)} />
                </td></tr>
              ) : (
                <DesktopRow key={e.id} ev={e} canEdit={canEdit} dim={!isRowOpen(e)} onlyEvent={eventCountByLeg.get(e.leg_id) === 1}
                  onEdit={() => setEditingId(e.id)} ticker={ticker} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AddButton({ onClick, inline = false }: { onClick: () => void; inline?: boolean }) {
  return (
    <button onClick={onClick} style={{ marginBottom: inline ? 0 : 10, padding: '5px 12px', borderRadius: 5, border: '1px dashed var(--border)', cursor: 'pointer', background: 'none', color: 'var(--acc)', fontSize: 12, fontWeight: 600 }}>
      ＋ Add event
    </button>
  );
}

function useDeleteEvent(ticker: string) {
  const qc = useQueryClient();
  return async (id: string) => {
    await deleteLegTransaction(id);
    await qc.invalidateQueries({ queryKey: ['leg-transactions', ticker] });
    await qc.invalidateQueries({ queryKey: ['holdings'] });
  };
}

function DesktopRow({ ev, canEdit, dim, onlyEvent, onEdit, ticker }: { ev: LegEvent; canEdit: boolean; dim: boolean; onlyEvent: boolean; onEdit: () => void; ticker: string }) {
  const del = useDeleteEvent(ticker);
  const label = displayAction(ev);
  const rowOpacity = dim ? 0.5 : 1;  // closed-leg rows are de-emphasized
  return (
    <tr style={{ borderBottom: '1px solid var(--bsub)', opacity: rowOpacity }}>
      <td style={td}>{fmtDay(ev.executed_at)}</td>
      {/* Open-leg events read bold + green; closed-leg rows go plain gray like the rest of the row. */}
      <td style={{ ...td, ...(dim ? {} : { fontWeight: 700, color: 'var(--acc)' }) }}>{label}</td>
      <td style={{ ...td, color: dim ? 'var(--t2)' : 'var(--text)' }}>{detailLabel(ev)}</td>
      <td style={td}>{usd(ev.price)}</td>
      <td style={td}>{pct(ev.weight)}</td>
      <td style={{ ...td, maxWidth: 280, whiteSpace: 'normal' }}>{ev.notes}</td>
      {canEdit && (
        <td style={{ ...td, whiteSpace: 'nowrap' }}>
          <button style={iconBtn} title="Edit" onClick={onEdit}>✎</button>{' '}
          <button style={{ ...iconBtn, color: '#ef4444' }} title="Delete" onClick={() => confirmDelete(del, ev.id, onlyEvent)}>✕</button>
        </td>
      )}
    </tr>
  );
}

function MobileCard({ ev, canEdit, dim, onlyEvent, onEdit, ticker }: { ev: LegEvent; canEdit: boolean; dim: boolean; onlyEvent: boolean; onEdit: () => void; ticker: string }) {
  const del = useDeleteEvent(ticker);
  const label = displayAction(ev);
  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--bsub)', borderRadius: 6, padding: 10, opacity: dim ? 0.5 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 12, ...(dim ? { color: 'var(--t2)' } : { fontWeight: 700, color: 'var(--acc)' }) }}>{label}</span>
        <span style={{ fontSize: 11, color: 'var(--t3)' }}>{fmtDay(ev.executed_at)}</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text)', marginTop: 2 }}>
        {detailLabel(ev)}
        <span style={{ color: 'var(--t3)' }}> · {usd(ev.price)} · {pct(ev.weight)}</span>
      </div>
      {ev.notes && <div style={{ fontSize: 11, color: 'var(--t2)', marginTop: 4 }}>{ev.notes}</div>}
      {canEdit && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button style={iconBtn} onClick={onEdit}>✎ Edit</button>
          <button style={{ ...iconBtn, color: '#ef4444' }} onClick={() => confirmDelete(del, ev.id, onlyEvent)}>✕ Delete</button>
        </div>
      )}
    </div>
  );
}

function confirmDelete(del: (id: string) => Promise<void>, id: string, onlyEvent: boolean) {
  const msg = onlyEvent
    ? 'This is the leg’s only event — deleting it leaves an empty leg. Delete the whole leg from the editor instead. Delete anyway?'
    : 'Delete this event? The leg will re-derive from the remaining events.';
  if (window.confirm(msg)) void del(id);
}

// ── Add / edit form ───────────────────────────────────────────────────────────────────────────
const fld: React.CSSProperties = { width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 5, padding: '6px 8px', fontSize: 12, color: 'var(--text)', boxSizing: 'border-box' };
const lbl: React.CSSProperties = { fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2, display: 'block' };

const NEW_LEG = '__new__';

function EventForm({ ticker, legs, event, onDone }: { ticker: string; legs: Leg[]; event?: LegEvent; onDone: () => void }) {
  const qc = useQueryClient();
  const editing = !!event;
  const [legId, setLegId] = useState(event?.leg_id ?? (legs[0]?.id ?? NEW_LEG));
  // new-leg structural fields (also used when editing an existing option leg's contract details)
  const editingLeg = editing ? event.leg : null;
  const editingIsOption = editingLeg?.instrument_type === 'OPTION';
  const [instrument, setInstrument] = useState<'SHARES' | 'CALL' | 'PUT'>(
    editingIsOption ? (editingLeg?.option_right === 'PUT' ? 'PUT' : 'CALL') : 'SHARES',
  );
  const [strike, setStrike] = useState(editingIsOption && editingLeg?.option_strike != null ? String(editingLeg.option_strike) : '');
  const [expiry, setExpiry] = useState(editingIsOption && editingLeg?.option_expiry ? editingLeg.option_expiry : '');
  const [direction, setDirection] = useState<Direction>('long');
  // event fields
  const [action, setAction] = useState<ActionLabel>((event?.action_label as ActionLabel) || (event ? deriveLabel(event) : 'New'));
  const [date, setDate] = useState(event ? event.executed_at.slice(0, 10) : new Date().toISOString().slice(0, 10));
  const [price, setPrice] = useState(event?.price != null ? String(event.price) : '');
  const [weight, setWeight] = useState(event?.weight != null ? String(event.weight) : '');
  const [notes, setNotes] = useState(event?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const type = actionToType(action);
  const weightLocked = action === 'Closed' || action === 'Expired' || action === 'Exercised';
  const weightLabel = type === 'BUY' ? 'Lot weight %' : action === 'Trimmed' ? 'Remaining %' : 'Weight %';

  async function save() {
    setSaving(true); setError('');
    try {
      let id = legId;
      if (!editing && legId === NEW_LEG) {
        const isOpt = instrument !== 'SHARES';
        id = await insertLegReturningId(ticker, {
          instrument_type: (isOpt ? 'OPTION' : 'SHARES') as LegInstrument,
          option_strike: isOpt && strike ? parseFloat(strike) : null,
          option_right: (isOpt ? instrument : null) as OptionRight | null,
          option_expiry: isOpt ? (expiry || null) : null,
          direction,
        });
      } else if (editing && editingIsOption) {
        // Update the leg's contract details if they changed (strike, expiry, right)
        const fullLeg = legs.find((l) => l.id === event!.leg_id);
        await updateLeg(event!.leg_id, {
          instrument_type: 'OPTION' as LegInstrument,
          option_strike: strike ? parseFloat(strike) : null,
          option_right: (instrument !== 'SHARES' ? instrument : 'CALL') as OptionRight,
          option_expiry: expiry || null,
          direction: (fullLeg?.direction ?? 'long') as Direction,
        });
      }
      const input: LegEventInput = {
        action_type: type,
        action_label: action,
        price: weightLocked && action === 'Expired' ? 0 : num(price),
        weight: weightLocked ? 0 : num(weight),
        close_reason: null,
        executed_at: `${date}T12:00:00+00:00`,
        notes: notes.trim() || null,
      };
      if (editing) await updateLegTransaction(event!.id, input);
      else await insertLegTransaction(id, input);
      await qc.invalidateQueries({ queryKey: ['leg-transactions', ticker] });
      await qc.invalidateQueries({ queryKey: ['holdings'] });
      onDone();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--acc)', borderRadius: 6, padding: 12, marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--acc)', marginBottom: 8 }}>{editing ? 'Edit event' : 'Add event'}</div>

      {!editing && (
        <div style={{ marginBottom: 8 }}>
          <label style={lbl}>Leg</label>
          <select style={fld} value={legId} onChange={(e) => setLegId(e.target.value)}>
            {legs.map((l) => <option key={l.id} value={l.id}>{l.instrument_type === 'SHARES' ? 'Shares' : `$${l.option_strike}${l.option_right === 'PUT' ? 'P' : 'C'} ${fmtOptionExpiry(l.option_expiry)}`}</option>)}
            <option value={NEW_LEG}>＋ New leg…</option>
          </select>
        </div>
      )}

      {!editing && legId === NEW_LEG && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div><label style={lbl}>Instrument</label>
            <select style={fld} value={instrument} onChange={(e) => setInstrument(e.target.value as 'SHARES' | 'CALL' | 'PUT')}>
              <option value="SHARES">Shares</option><option value="CALL">Call</option><option value="PUT">Put</option>
            </select></div>
          <div><label style={lbl}>Direction</label>
            <select style={fld} value={direction} onChange={(e) => setDirection(e.target.value as Direction)}>
              <option value="long">Long</option><option value="short">Short</option>
            </select></div>
          {instrument !== 'SHARES' && <>
            <div><label style={lbl}>Strike</label><input style={fld} type="number" step="0.5" value={strike} onChange={(e) => setStrike(e.target.value)} /></div>
            <div><label style={lbl}>Expiry</label><input style={fld} type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} /></div>
          </>}
        </div>
      )}

      {editing && editingIsOption && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div><label style={lbl}>Right</label>
            <select style={fld} value={instrument} onChange={(e) => setInstrument(e.target.value as 'CALL' | 'PUT')}>
              <option value="CALL">Call</option><option value="PUT">Put</option>
            </select></div>
          <div><label style={lbl}>Strike</label>
            <input style={fld} type="number" step="0.5" value={strike} onChange={(e) => setStrike(e.target.value)} /></div>
          <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Expiry</label>
            <input style={fld} type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} /></div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div><label style={lbl}>Action</label>
          <select style={fld} value={action} onChange={(e) => setAction(e.target.value as ActionLabel)}>
            {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select></div>
        <div><label style={lbl}>Date</label><input style={fld} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div><label style={lbl}>{type === 'BUY' ? 'Entry price' : 'Exit price'}</label>
          <input style={fld} type="number" step="0.01" value={price} disabled={action === 'Expired'} placeholder={action === 'Expired' ? '0' : ''} onChange={(e) => setPrice(e.target.value)} /></div>
        <div><label style={lbl}>{weightLabel}</label>
          <input style={fld} type="number" step="0.1" value={weightLocked ? '0' : weight} disabled={weightLocked} onChange={(e) => setWeight(e.target.value)} /></div>
      </div>
      <div style={{ marginTop: 8 }}><label style={lbl}>Notes</label>
        <textarea style={{ ...fld, minHeight: 48, resize: 'vertical' }} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>

      {error && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 8 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={save} disabled={saving} style={{ padding: '6px 14px', borderRadius: 5, border: 'none', cursor: 'pointer', background: 'var(--acc)', color: '#fff', fontSize: 12, fontWeight: 600, opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
        <button onClick={onDone} disabled={saving} style={{ padding: '6px 14px', borderRadius: 5, cursor: 'pointer', background: 'none', border: '1px solid var(--border)', color: 'var(--t2)', fontSize: 12 }}>Cancel</button>
      </div>
    </div>
  );
}

function deriveLabel(ev: LegEvent): ActionLabel {
  const d = displayAction(ev);
  return (ACTIONS as readonly string[]).includes(d) ? (d as ActionLabel) : 'New';
}
function num(s: string): number | null { return s.trim() === '' ? null : parseFloat(s); }

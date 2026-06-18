import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { TIERS, fmtLegInstrument, legIsOpen, positionWeight, type Leg } from '@stw/shared';
import type { Holding } from '../api';
import { getSupabase } from '../../../lib/supabase';
import { useCategories } from '../useCategories';
import { errMsg } from '../../../lib/errMsg';

const CONVICTIONS = [5, 4, 3, 2, 1, 0];
const ACTIONS = ['New', 'Upsized', 'Trimmed', 'Hold', 'Closed'];

const label: React.CSSProperties = { fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3, display: 'block' };
const field: React.CSSProperties = { width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 5, padding: '6px 8px', fontSize: 13, color: 'var(--text)', boxSizing: 'border-box' };

interface Props { holding: Holding; onDone: () => void; }

// Position-level editor: holding fields + the equity:options split. Legs are event-sourced — they're
// added / edited / closed in the Transaction History ledger (one source of truth), so this modal
// shows the OPEN legs read-only for reference and never writes `legs` directly.
export function PositionEditor({ holding: h, onDone }: Props) {
  const queryClient = useQueryClient();
  const { data: categories = [] } = useCategories();
  const [conviction, setConviction] = useState(String(h.conviction ?? 3));
  const [lastAction, setLastAction] = useState(h.last_action ?? 'Hold');
  const [actionDate, setActionDate] = useState(h.action_date ?? '');
  const [categoryId, setCategoryId] = useState(h.category_id ?? '');
  const [equityPct, setEquityPct] = useState(h.equity_pct != null ? String(Math.round(h.equity_pct * 100)) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const openLegs = h.legs.filter(legIsOpen);
  // Position weight is DERIVED from the open legs (the legs are the source of truth; the position
  // is their sum). Shown read-only; persisted to current_weight on save so the rest of the app
  // (sorting, filters) stays consistent.
  const pw = positionWeight(h.legs);
  const fmtW = (n: number | null) => (n != null ? `${n}%` : '—');

  async function save() {
    setSaving(true); setError('');
    try {
      const sb = getSupabase();
      const eq = equityPct.trim() === '' ? null : Math.max(0, Math.min(100, parseFloat(equityPct))) / 100;
      const { error: hErr } = await sb.from('holdings').update({
        conviction: Number(conviction), last_action: lastAction, action_date: actionDate || null,
        category_id: categoryId || null,
        // position weight derives from the open legs; reconcile the stored fields to that sum.
        current_weight: pw.current,
        initial_weight: h.initial_weight ?? pw.initial,
        equity_pct: eq,
      }).eq('ticker', h.ticker);
      if (hErr) throw hErr;
      await queryClient.invalidateQueries({ queryKey: ['holdings'] });
      onDone();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div onClick={onDone} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '6vh 16px 16px', overflowY: 'auto' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 520, background: 'var(--surface)', border: '1px solid var(--acc)', borderRadius: 10, padding: '16px 18px', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
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
            <div style={{ ...field, background: 'var(--s2)', color: 'var(--t2)' }}>{fmtW(pw.initial)}</div></div>
          <div><label style={label}>Current Position Weight %</label>
            <div style={{ ...field, background: 'var(--s2)', color: 'var(--text)', fontWeight: 600 }}>{fmtW(pw.current)}</div></div>
          <div><label style={label}>Equity % of split</label>
            <input style={field} type="number" step="1" min="0" max="100" value={equityPct} placeholder="default" onChange={(e) => setEquityPct(e.target.value)} /></div>
        </div>
        <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 6 }}>
          Position weight is the sum of the open legs (initial = Σ entry weights, current = Σ current weights).
          Equity % sets this position’s equity:options split (e.g. 30 → 30:70); blank uses the Config default (90:10).
        </div>

        {/* Open legs — read-only reference; edit via Transaction History */}
        <div style={{ marginTop: 14, borderTop: '1px dashed var(--border)', paddingTop: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Open legs</div>
          {openLegs.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--t3)' }}>No open legs.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {openLegs.map((l) => <OpenLegRow key={l.id} leg={l} />)}
            </div>
          )}
          <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 8 }}>
            Add, edit, trim or close legs in <strong>Transaction History</strong> below — legs derive from those events.
          </div>
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

function OpenLegRow({ leg }: { leg: Leg }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, background: 'var(--s2)', border: '1px solid var(--bsub)', borderRadius: 6, padding: '6px 10px', fontSize: 12 }}>
      <span style={{ color: 'var(--text)', fontWeight: 600 }}>
        {leg.instrument_type === 'SHARES' ? 'Shares' : fmtLegInstrument(leg)}
      </span>
      <span style={{ color: 'var(--t3)', fontVariantNumeric: 'tabular-nums' }}>
        {leg.entry_price != null ? `entry $${leg.entry_price}` : ''}
        {leg.weight != null ? `  ·  ${leg.weight}%` : ''}
      </span>
    </div>
  );
}

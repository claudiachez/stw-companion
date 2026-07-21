import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { TIERS, displayInitialWeight, fmtLegInstrument, legIsOpen, GICS_SECTORS, NON_EQUITY_BUCKETS, FONT_SIZE, FONT_WEIGHT, type Leg } from '@stw/shared';
import type { Holding } from '../api';
import { getSupabase } from '../../../lib/supabase';
import { useCategories } from '../useCategories';
import { useSectorMap } from '../../limits/useRiskConfig';
import { errMsg } from '../../../lib/errMsg';
import { Modal } from '../../../primitives/Modal';
import { Button } from '../../../primitives/Button';

const CONVICTIONS = [5, 4, 3, 2, 1, 0];
const ACTIONS = ['New', 'Upsized', 'Trimmed', 'Hold', 'Closed'];
// Market sector options: canonical GICS-11 + the non-equity buckets (ETF / Cash).
const SECTOR_OPTIONS = [...GICS_SECTORS, ...NON_EQUITY_BUCKETS];

const label: React.CSSProperties = { fontSize: FONT_SIZE['3xs'], fontWeight: FONT_WEIGHT.bold, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3, display: 'block' };
// 9px/700/0.1em uppercase section header — the redesign's grouped-form label.
const sectionLbl: React.CSSProperties = { fontSize: FONT_SIZE['3xs'], fontWeight: FONT_WEIGHT.bold, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6, display: 'block' };
const field: React.CSSProperties = { width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 5, padding: '6px 8px', fontSize: FONT_SIZE.sm, color: 'var(--text)', boxSizing: 'border-box', height: 30 };
const fieldSelect: React.CSSProperties = { ...field, padding: '0 6px' };

interface Props { holding: Holding; onDone: () => void; }

// Position-level editor: holding fields + the equity:options split. Legs are event-sourced — they're
// added / edited / closed in the Transaction History ledger (one source of truth), so this modal
// shows the OPEN legs read-only for reference and never writes `legs` directly.
export function PositionEditor({ holding: h, onDone }: Props) {
  const queryClient = useQueryClient();
  const { data: categories = [] } = useCategories();
  const { data: sectorMap = {} } = useSectorMap();
  const [conviction, setConviction] = useState(String(h.conviction ?? 3));
  const [lastAction, setLastAction] = useState(h.last_action ?? 'Hold');
  const [actionDate, setActionDate] = useState(h.action_date ?? '');
  const [categoryId, setCategoryId] = useState(h.category_id ?? '');
  const [equityPct, setEquityPct] = useState(h.equity_pct != null ? String(Math.round(h.equity_pct * 100)) : '');
  // Sector lives in ticker_sector_map (not on holdings), loaded async — a null draft
  // means "unchanged", so the select reflects the map value until the admin overrides it.
  const originalSector = sectorMap[h.ticker] ?? '';
  const [sectorDraft, setSectorDraft] = useState<string | null>(null);
  const sector = sectorDraft ?? originalSector;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const openLegs = h.legs.filter(legIsOpen);
  // Initial = Σ open legs' lots (derived from the diary). Current = holdings.current_weight, the live
  // weight the routines restate weekly — owned by them, so the editor only displays it (never writes it).
  // For a fully-closed position (no open legs) Initial falls back to the closed legs' entry lots.
  const initWeight = displayInitialWeight(h.legs);
  const curWeight  = h.current_weight;

  async function save() {
    setSaving(true); setError('');
    try {
      const sb = getSupabase();
      const eq = equityPct.trim() === '' ? null : Math.max(0, Math.min(100, parseFloat(equityPct))) / 100;
      const isClosing = lastAction === 'Closed' || lastAction === 'Expired';
      const { error: hErr } = await sb.from('holdings').update({
        conviction: Number(conviction), last_action: lastAction, action_date: actionDate || null,
        category_id: categoryId || null,
        equity_pct: eq,
        // initial_weight / current_weight are NOT written here: Initial derives from the diary lots,
        // Current is owned by the routines. Editing legs (the ledger) is the only way to move weight.
        // Exception: closing/expiring a position via this Status dropdown must zero current_weight
        // here — a DB trigger (054_integrity_guardrails.sql) hard-fails any Closed/Expired row with
        // a nonzero weight, and nothing else writes it at the moment this action fires.
        ...(isClosing ? { current_weight: 0 } : {}),
      }).eq('ticker', h.ticker);
      if (hErr) throw hErr;

      // Sector → ticker_sector_map (separate table, admin-write RLS). Only touch it when
      // it actually changed: set → upsert; cleared → delete the row (back to unmapped).
      if (sector !== originalSector) {
        if (sector) {
          const { error: sErr } = await sb.from('ticker_sector_map')
            .upsert({ ticker: h.ticker, sector, updated_at: new Date().toISOString() }, { onConflict: 'ticker' });
          if (sErr) throw sErr;
        } else {
          const { error: sErr } = await sb.from('ticker_sector_map').delete().eq('ticker', h.ticker);
          if (sErr) throw sErr;
        }
        await queryClient.invalidateQueries({ queryKey: ['ticker-sector-map'] });
      }

      await queryClient.invalidateQueries({ queryKey: ['holdings'] });
      onDone();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  const isClosing = lastAction === 'Closed' || lastAction === 'Expired';
  const derivedCell: React.CSSProperties = { background: 'var(--s2)', padding: '9px 12px' };
  const derivedVal: React.CSSProperties = { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' };

  return (
    <Modal onClose={onDone} width="lg" title={`Edit position — ${h.ticker}`}>
        {/* Read-only derived block — Initial / Current / Rank all come from the ledger + routines */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0, border: '1px solid var(--bsub)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={derivedCell}>
              <div style={label}>Initial weight</div>
              <div style={derivedVal}>{initWeight != null ? `${initWeight}%` : '—'}</div>
            </div>
            <div style={{ ...derivedCell, borderLeft: '1px solid var(--bsub)' }}>
              <div style={label}>Current weight</div>
              <div style={derivedVal}>{curWeight != null ? `${curWeight}%` : '—'}</div>
            </div>
            <div style={{ ...derivedCell, borderLeft: '1px solid var(--bsub)' }}>
              <div style={label}>Rank</div>
              <div style={derivedVal}>#{h.rank}</div>
            </div>
          </div>
          <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', marginTop: 8 }}>
            These derive from the transaction ledger — to move weight, log a transaction instead of editing here.
          </div>
        </div>

        {/* Rating & status */}
        <section style={{ marginBottom: 14 }}>
          <label style={sectionLbl}>Rating &amp; status</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <div><label style={label}>Conviction</label>
              <select style={fieldSelect} value={conviction} onChange={(e) => setConviction(e.target.value)}>{CONVICTIONS.map((v) => <option key={v} value={v}>{v} — {TIERS[v].short}</option>)}</select></div>
            <div><label style={label}>Status</label>
              <select style={fieldSelect} value={lastAction} onChange={(e) => setLastAction(e.target.value)}>{ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}</select></div>
            <div><label style={label}>Last action date</label>
              <input style={field} type="date" value={actionDate} onChange={(e) => setActionDate(e.target.value)} /></div>
          </div>
          <div style={{ fontSize: FONT_SIZE.xs, color: isClosing ? 'var(--status-warning-text)' : 'var(--t3)', marginTop: 6 }}>
            ⚠ Setting Status to Closed or Expired zeroes the current weight — subscribers see the position leave the list.
          </div>
        </section>

        {/* Classification */}
        <section>
          <label style={sectionLbl}>Classification</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <div><label style={label}>Basket</label>
              <select style={fieldSelect} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}><option value="">— Uncategorized —</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div><label style={label}>Sector (GICS)</label>
              <select style={fieldSelect} value={sector} onChange={(e) => setSectorDraft(e.target.value)}><option value="">— Unmapped —</option>{SECTOR_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
            <div><label style={label}>Equity % of split</label>
              <input style={field} type="number" step="1" min="0" max="100" value={equityPct} placeholder="default 90" onChange={(e) => setEquityPct(e.target.value)} /></div>
          </div>
          <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', marginTop: 6 }}>
            Equity % sets this position’s shares:options split (e.g. 30 → 30:70); blank uses the Config default (90:10).
          </div>
        </section>

        {/* Open legs — read-only reference; edit via Transaction History */}
        <div style={{ marginTop: 14 }}>
          <div style={sectionLbl}>Open legs</div>
          {openLegs.length === 0 ? (
            <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t3)' }}>No open legs.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {openLegs.map((l) => <OpenLegRow key={l.id} leg={l} />)}
            </div>
          )}
          <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', marginTop: 5 }}>
            Add, trim or close legs by logging a transaction in <strong>Transaction History</strong> below — legs derive from those events.
          </div>
        </div>

        {error && <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--status-negative-text)', marginTop: 10 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <Button variant="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          <Button variant="ghost" onClick={onDone} disabled={saving}>Cancel</Button>
        </div>
    </Modal>
  );
}

function fmtOpenDate(s: string | null): string {
  if (!s) return '';
  const [y, m, d] = s.slice(0, 10).split('-');
  const mon = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][parseInt(m, 10)] ?? '';
  return `${mon} ${parseInt(d, 10)}, '${y.slice(2)}`;
}

function OpenLegRow({ leg }: { leg: Leg }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, background: 'var(--s2)', border: '1px solid var(--bsub)', borderRadius: 6, padding: '6px 10px', fontSize: FONT_SIZE.sm }}>
      <span style={{ color: 'var(--text)', fontWeight: FONT_WEIGHT.bold }}>
        {leg.instrument_type === 'SHARES' ? 'Shares' : fmtLegInstrument(leg)}
        {leg.opened_at && <span style={{ color: 'var(--t3)', fontWeight: 400, marginLeft: 6 }}>· opened {fmtOpenDate(leg.opened_at)}</span>}
      </span>
      <span style={{ color: 'var(--t3)', fontVariantNumeric: 'tabular-nums' }}>
        {leg.entry_price != null ? `entry $${leg.entry_price}` : ''}
        {leg.weight != null ? `  ·  ${leg.weight}%` : ''}
      </span>
    </div>
  );
}

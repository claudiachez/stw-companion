import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  fmtOptionExpiry, suggestOrderQuantity, type Leg, type LegInstrument, type OptionRight, type Direction,
} from '@stw/shared';
import { useLegTransactions } from '../useHoldingHistory';
import { useCapabilities } from '../../../context/AppCapabilities';
import { useIsMobile } from '../../../hooks/useIsMobile';
import { useAppConfig } from '../../../hooks/useAppConfig';
import { useQuote } from '../../../hooks/useLivePrice';
import { errMsg } from '../../../lib/errMsg';
import type { IbkrOrderSpec, IbkrOrderResult } from '../ibkrOrder';
import {
  insertLegReturningId, insertLegTransaction, updateLegTransaction, updateLeg, deleteLegTransaction,
  updateLegBrokerFields, type LegEvent, type LegEventInput,
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
// Solid dark-green accent for the real-order flow (Open/Close via IBKR + its modal) —
// deliberately a different shade from --acc (the bright green used for ordinary Save
// buttons), so a real broker order never reads as just another save.
const ibkrGreen = '#15803d';
const ibkrBtn: React.CSSProperties = { background: ibkrGreen, border: `1px solid ${ibkrGreen}`, borderRadius: 4, cursor: 'pointer', fontSize: 11, padding: '3px 8px', color: '#fff', fontWeight: 600 };

export function LegTimeline({ ticker, legs = [] }: { ticker: string; legs?: Leg[] }) {
  const { canEdit, onExecuteIbkrOrder } = useCapabilities();
  const { ibkrLiveTradingEnabled } = useAppConfig();
  // Admin-only real-order affordances: gated by canEdit (never true in apps/web),
  // the app_config kill switch, and onExecuteIbkrOrder actually being wired
  // (apps/admin only — see AppCapabilities.onExecuteIbkrOrder).
  const ibkrReady = canEdit && ibkrLiveTradingEnabled && !!onExecuteIbkrOrder;
  const isMobile = useIsMobile();
  const { data: events = [], isLoading } = useLegTransactions(ticker);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'open' | 'closed'>('all');

  // which legs are still open → used to dim/filter their rows
  const openLegIds = useMemo(() => new Set(legs.filter((l) => l.status === 'OPEN').map((l) => l.id)), [legs]);
  const isRowOpen = (e: LegEvent) => openLegIds.has(e.leg_id);
  const legById = useMemo(() => new Map(legs.map((l) => [l.id, l])), [legs]);

  // newest first; count events per leg (to guard deleting a leg's only event)
  const sorted = useMemo(() => [...events].sort((a, b) => b.executed_at.localeCompare(a.executed_at) || b.id.localeCompare(a.id)), [events]);
  const rows = sorted.filter((e) => filter === 'all' || (filter === 'open' ? isRowOpen(e) : !isRowOpen(e)));
  const eventCountByLeg = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of events) m.set(e.leg_id, (m.get(e.leg_id) ?? 0) + 1);
    return m;
  }, [events]);
  // "Close via IBKR" only makes sense once, on a leg's most-recent row — otherwise
  // every historical New/Upsized row for a still-open leg would each show its own
  // Close button.
  const latestRowIdByLeg = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of sorted) if (!m.has(e.leg_id)) m.set(e.leg_id, e.id); // sorted newest-first
    return m;
  }, [sorted]);

  if (isLoading) return <div style={{ fontSize: 12, color: 'var(--t3)', padding: '8px 0' }}>Loading…</div>;

  const addForm = adding && (
    <EventForm ticker={ticker} legs={legs} onDone={() => setAdding(false)} />
  );
  // Editing is modal now (consistent with the IBKR order flow) — rendered once here,
  // rather than swapped in per-row, since only one row can be mid-edit at a time anyway.
  const editingEvent = editingId ? sorted.find((e) => e.id === editingId) : undefined;
  const editForm = editingEvent && (
    <EventForm ticker={ticker} legs={legs} event={editingEvent} onDone={() => setEditingId(null)} />
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
      {editForm}

      {isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((e) => (
            <MobileCard key={e.id} ev={e} canEdit={canEdit} dim={!isRowOpen(e)} onlyEvent={eventCountByLeg.get(e.leg_id) === 1}
                onEdit={() => setEditingId(e.id)} ticker={ticker}
                ibkrReady={ibkrReady} onExecuteIbkrOrder={onExecuteIbkrOrder} leg={legById.get(e.leg_id)}
                canClose={isRowOpen(e) && latestRowIdByLeg.get(e.leg_id) === e.id} />))}
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
              {rows.map((e) => (
                <DesktopRow key={e.id} ev={e} canEdit={canEdit} dim={!isRowOpen(e)} onlyEvent={eventCountByLeg.get(e.leg_id) === 1}
                  onEdit={() => setEditingId(e.id)} ticker={ticker}
                  ibkrReady={ibkrReady} onExecuteIbkrOrder={onExecuteIbkrOrder} leg={legById.get(e.leg_id)}
                  canClose={isRowOpen(e) && latestRowIdByLeg.get(e.leg_id) === e.id} />
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

// Shared fill handlers for both row renderers. "Open" patches the row that was just
// executed (never overwriting its weight — that stays whatever the admin entered);
// "Close" appends a new Closed diary row at the confirmed exit price, weight 0 —
// the same shape EventForm builds for a hand-logged close.
function useIbkrFillHandlers(ticker: string) {
  const qc = useQueryClient();
  async function refresh() {
    await qc.invalidateQueries({ queryKey: ['leg-transactions', ticker] });
    await qc.invalidateQueries({ queryKey: ['holdings'] });
  }
  return {
    async handleOpenFilled(ev: LegEvent, result: IbkrOrderResult) {
      await updateLegBrokerFields(ev.id, {
        price: result.avg_fill_price ?? ev.price,
        broker_order_id: String(result.order_id ?? ''),
        broker_status: result.status,
        broker_fill_price: result.avg_fill_price ?? null,
      });
      await refresh();
    },
    async handleCloseFilled(ev: LegEvent, result: IbkrOrderResult) {
      const fillPrice = result.avg_fill_price ?? null;
      await insertLegTransaction(
        ev.leg_id,
        {
          action_type: 'SELL',
          action_label: 'Closed',
          price: fillPrice,
          weight: 0,
          close_reason: null,
          executed_at: new Date().toISOString(),
          notes: 'Closed via IBKR (real order)',
        },
        {
          broker_order_id: String(result.order_id ?? ''),
          broker_status: result.status,
          broker_fill_price: fillPrice,
        },
      );
      await refresh();
    },
  };
}

interface IbkrRowProps {
  ibkrReady: boolean;
  onExecuteIbkrOrder?: (spec: IbkrOrderSpec) => Promise<IbkrOrderResult>;
  leg: Leg | undefined;
  /** True only on a still-open leg's most-recent row — see latestRowIdByLeg. */
  canClose: boolean;
}

function DesktopRow({ ev, canEdit, dim, onlyEvent, onEdit, ticker, ibkrReady, onExecuteIbkrOrder, leg, canClose }: { ev: LegEvent; canEdit: boolean; dim: boolean; onlyEvent: boolean; onEdit: () => void; ticker: string } & IbkrRowProps) {
  const del = useDeleteEvent(ticker);
  const { handleOpenFilled, handleCloseFilled } = useIbkrFillHandlers(ticker);
  const [popover, setPopover] = useState<'open' | 'close' | null>(null);
  const label = displayAction(ev);
  const rowOpacity = dim ? 0.5 : 1;  // closed-leg rows are de-emphasized
  const canExecuteOpen = ibkrReady && ev.action_type === 'BUY' && !ev.broker_order_id;
  const canExecuteClose = ibkrReady && canClose;
  return (
    <>
      <tr style={{ borderBottom: '1px solid var(--bsub)', opacity: rowOpacity }}>
        <td style={td}>{fmtDay(ev.executed_at)}</td>
        {/* Open-leg events read bold + green; closed-leg rows go plain gray like the rest of the row. */}
        <td style={{ ...td, ...(dim ? {} : { fontWeight: 700, color: 'var(--acc)' }) }}>{label}</td>
        <td style={{ ...td, color: dim ? 'var(--t2)' : 'var(--text)' }}>{detailLabel(ev)}</td>
        <td style={td}>{usd(ev.price)}{ev.broker_order_id && <span title={`Real IBKR fill (order ${ev.broker_order_id})`} style={{ marginLeft: 4 }}>🔗</span>}</td>
        <td style={td}>{pct(ev.weight)}</td>
        <td style={{ ...td, maxWidth: 280, whiteSpace: 'normal' }}>{ev.notes}</td>
        {canEdit && (
          <td style={{ ...td, whiteSpace: 'nowrap' }}>
            <button style={iconBtn} title="Edit" onClick={onEdit}>✎</button>{' '}
            <button style={{ ...iconBtn, color: '#ef4444' }} title="Delete" onClick={() => confirmDelete(del, ev.id, onlyEvent)}>✕</button>{' '}
            {canExecuteOpen && <button style={ibkrBtn} title="Place the real IBKR order for this event" onClick={() => setPopover('open')}>Open via IBKR</button>}{' '}
            {canExecuteClose && <button style={ibkrBtn} title="Close this leg with a real IBKR order" onClick={() => setPopover('close')}>Close via IBKR</button>}
          </td>
        )}
      </tr>
      {popover && onExecuteIbkrOrder && (
        <IbkrOrderModal
          ticker={ticker} leg={leg} evPrice={ev.price} mode={popover} onExecuteIbkrOrder={onExecuteIbkrOrder}
          onCancel={() => setPopover(null)}
          onFilled={async (result) => {
            if (popover === 'open') await handleOpenFilled(ev, result);
            else await handleCloseFilled(ev, result);
            setPopover(null);
          }}
        />
      )}
    </>
  );
}

function MobileCard({ ev, canEdit, dim, onlyEvent, onEdit, ticker, ibkrReady, onExecuteIbkrOrder, leg, canClose }: { ev: LegEvent; canEdit: boolean; dim: boolean; onlyEvent: boolean; onEdit: () => void; ticker: string } & IbkrRowProps) {
  const del = useDeleteEvent(ticker);
  const { handleOpenFilled, handleCloseFilled } = useIbkrFillHandlers(ticker);
  const [popover, setPopover] = useState<'open' | 'close' | null>(null);
  const label = displayAction(ev);
  const canExecuteOpen = ibkrReady && ev.action_type === 'BUY' && !ev.broker_order_id;
  const canExecuteClose = ibkrReady && canClose;
  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--bsub)', borderRadius: 6, padding: 10, opacity: dim ? 0.5 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 12, ...(dim ? { color: 'var(--t2)' } : { fontWeight: 700, color: 'var(--acc)' }) }}>{label}</span>
        <span style={{ fontSize: 11, color: 'var(--t3)' }}>{fmtDay(ev.executed_at)}</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text)', marginTop: 2 }}>
        {detailLabel(ev)}
        <span style={{ color: 'var(--t3)' }}> · {usd(ev.price)} · {pct(ev.weight)}</span>
        {ev.broker_order_id && <span title={`Real IBKR fill (order ${ev.broker_order_id})`} style={{ marginLeft: 4 }}>🔗</span>}
      </div>
      {ev.notes && <div style={{ fontSize: 11, color: 'var(--t2)', marginTop: 4 }}>{ev.notes}</div>}
      {canEdit && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <button style={iconBtn} onClick={onEdit}>✎ Edit</button>
          <button style={{ ...iconBtn, color: '#ef4444' }} onClick={() => confirmDelete(del, ev.id, onlyEvent)}>✕ Delete</button>
          {canExecuteOpen && <button style={ibkrBtn} onClick={() => setPopover('open')}>Open via IBKR</button>}
          {canExecuteClose && <button style={ibkrBtn} onClick={() => setPopover('close')}>Close via IBKR</button>}
        </div>
      )}
      {popover && onExecuteIbkrOrder && (
        <IbkrOrderModal
          ticker={ticker} leg={leg} evPrice={ev.price} mode={popover} onExecuteIbkrOrder={onExecuteIbkrOrder}
          onCancel={() => setPopover(null)}
          onFilled={async (result) => {
            if (popover === 'open') await handleOpenFilled(ev, result);
            else await handleCloseFilled(ev, result);
            setPopover(null);
          }}
        />
      )}
    </div>
  );
}

// Real-order entry: quantity + order type only — legs are weight-only (see legs.ts),
// so the actual share/contract count for the broker order is never derivable from the
// ledger. Quantity is pre-filled from the admin's own capital-allocation defaults
// (Config page: total capital + default deploy %) via `suggestOrderQuantity`, but stays
// fully editable — it's a starting point, not a constraint. Rendered as a fixed-position
// modal (same overlay pattern as PositionEditor.tsx) since a real-money action deserves
// its own focused surface, not an inline expansion under a table row.
function IbkrOrderModal({
  ticker, leg, evPrice, mode, onExecuteIbkrOrder, onFilled, onCancel,
}: {
  ticker: string;
  leg: Leg | undefined;
  /** The triggering diary row's own price — the freshest reference for a brand-new leg
   * whose `entry_price`/`mark_price` may not have propagated from the 040 trigger yet. */
  evPrice: number | null;
  mode: 'open' | 'close';
  onExecuteIbkrOrder: (spec: IbkrOrderSpec) => Promise<IbkrOrderResult>;
  onFilled: (result: IbkrOrderResult) => Promise<void>;
  onCancel: () => void;
}) {
  const { totalCapital, defaultSharesDeployPct, defaultOptionsDeployPct } = useAppConfig();
  const quote = useQuote(ticker);
  // `null` = "not yet touched by the admin" — displays the live-computed suggestion
  // instead, so it keeps updating as the quote/config resolve (see the same pattern
  // in ConfigPage.tsx's RatioEditor/NumberEditor).
  const [quantityOverride, setQuantityOverride] = useState<string | null>(null);
  const [orderType, setOrderType] = useState<'MKT' | 'LMT'>('MKT');
  const [limitPriceOverride, setLimitPriceOverride] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!leg) {
    return (
      <div onClick={onCancel} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: 'var(--surface)', border: '1px solid #ef4444', borderRadius: 10, padding: 16, color: '#ef4444', fontSize: 12 }}>No leg found for this event.</div>
      </div>
    );
  }
  const safeLeg = leg; // narrowed capture — `leg` itself doesn't narrow across the submit() closure

  const isOption = safeLeg.instrument_type === 'OPTION';
  const side: 'BUY' | 'SELL' = mode === 'open'
    ? (safeLeg.direction === 'short' ? 'SELL' : 'BUY')
    : (safeLeg.direction === 'short' ? 'BUY' : 'SELL');
  const contractLabel = isOption
    ? `$${safeLeg.option_strike}${safeLeg.option_right === 'PUT' ? 'P' : 'C'} ${fmtOptionExpiry(safeLeg.option_expiry)}`
    : 'Shares';

  // Shares ride the live Finnhub quote. Options have no live quote here, so fall back to
  // the leg's own stored mark/entry price — and if this is a brand-new leg those haven't
  // propagated from the 040 trigger yet, fall back further to the triggering diary row's
  // own price (what the admin just typed into "+ Add event").
  const referencePrice = isOption
    ? (safeLeg.mark_price ?? safeLeg.entry_price ?? evPrice ?? null)
    : (quote?.c ?? null);
  const deployPct = isOption ? defaultOptionsDeployPct : defaultSharesDeployPct;
  const suggestion = suggestOrderQuantity(totalCapital, deployPct, referencePrice, safeLeg.instrument_type);
  // A real calculation ran (as opposed to missing inputs) whenever capital/pct/price are
  // all present — even if the budget can't cover a single unit (quantity floors to 0).
  // Showing a blank field in that case looks like nothing computed at all; showing "0"
  // plus the shortfall note makes the actual constraint visible instead.
  const calcRan = totalCapital > 0 && deployPct > 0 && referencePrice != null && referencePrice > 0;
  const unitCostForCalc = referencePrice != null ? (isOption ? referencePrice * 100 : referencePrice) : null;
  const budgetShortfall = calcRan && suggestion.quantity === 0;

  const quantity = quantityOverride ?? (calcRan ? String(suggestion.quantity) : '');
  const isSuggested = quantityOverride === null && calcRan;
  const limitPrice = limitPriceOverride ?? (referencePrice != null ? String(referencePrice) : '');

  const parsedQty = parseFloat(quantity) || 0;
  const unitCost = referencePrice != null ? (isOption ? referencePrice * 100 : referencePrice) : null;
  const liveTotalCost = unitCost != null ? Math.round(parsedQty * unitCost * 100) / 100 : null;

  async function submit() {
    const qty = parseFloat(quantity);
    if (!quantity || qty <= 0) { setError('Enter a quantity'); return; }
    if (orderType === 'LMT' && !limitPrice) { setError('Enter a limit price'); return; }
    setSubmitting(true); setError('');
    try {
      const spec: IbkrOrderSpec = {
        symbol: ticker,
        instrument: isOption ? 'OPTION' : 'SHARES',
        side,
        quantity: qty,
        order_type: orderType,
        ...(orderType === 'LMT' ? { limit_price: parseFloat(limitPrice) } : {}),
        ...(isOption ? {
          strike: safeLeg.option_strike ?? undefined,
          right: (safeLeg.option_right === 'PUT' ? 'P' : 'C') as 'C' | 'P',
          expiry: (safeLeg.option_expiry ?? '').replace(/-/g, ''),
        } : {}),
      };
      const result = await onExecuteIbkrOrder(spec);
      if (result.error) { setError(result.error); setSubmitting(false); return; }
      if (result.status !== 'Filled') {
        setError(`Order ${result.status.toLowerCase()}, not yet filled — check IBKR directly; this doesn't poll for you.`);
        setSubmitting(false);
        return;
      }
      await onFilled(result);
    } catch (e) {
      setError(errMsg(e));
      setSubmitting(false);
    }
  }

  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, background: 'var(--surface)', border: `1px solid ${ibkrGreen}`, borderRadius: 10, padding: '16px 18px', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: ibkrGreen, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {mode === 'open' ? 'Open' : 'Close'} via IBKR — {side} {ticker} {contractLabel}
        </div>
        <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 10 }}>
          Legs track weight (% of portfolio) only — quantity is suggested from your Config capital
          defaults, adjust freely before placing.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label style={lbl}>Quantity {isSuggested && <span style={{ color: ibkrGreen, textTransform: 'none' }}>(suggested)</span>}</label>
            <input style={fld} type="number" step="1" value={quantity} onChange={(e) => setQuantityOverride(e.target.value)} />
          </div>
          <div><label style={lbl}>Order Type</label>
            <select style={fld} value={orderType} onChange={(e) => setOrderType(e.target.value as 'MKT' | 'LMT')}>
              <option value="MKT">Market</option><option value="LMT">Limit</option>
            </select></div>
          {orderType === 'LMT' && (
            <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Limit Price</label>
              <input style={fld} type="number" step="0.01" value={limitPrice} onChange={(e) => setLimitPriceOverride(e.target.value)} /></div>
          )}
        </div>
        {budgetShortfall && unitCostForCalc != null && (
          <div style={{ fontSize: 10, color: '#f59e0b', marginTop: 6 }}>
            Your budget (${(totalCapital * deployPct).toLocaleString()}) doesn't cover 1 {isOption ? 'contract' : 'share'}
            {' '}(~${unitCostForCalc.toLocaleString()}) — raise the deploy % in Config or enter a quantity manually.
          </div>
        )}
        {liveTotalCost != null && parsedQty > 0 && (
          <div style={{ fontSize: 11, color: 'var(--t2)', marginTop: 8 }}>
            Total capital: <span style={{ color: 'var(--text)', fontWeight: 600 }}>${liveTotalCost.toLocaleString()}</span>
            {totalCapital > 0 && ` (${((liveTotalCost / totalCapital) * 100).toFixed(1)}% of $${totalCapital.toLocaleString()})`}
          </div>
        )}
        {error && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 8 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button onClick={submit} disabled={submitting} style={{ padding: '6px 14px', borderRadius: 5, border: 'none', cursor: 'pointer', background: ibkrGreen, color: '#fff', fontSize: 12, fontWeight: 600, opacity: submitting ? 0.6 : 1 }}>
            {submitting ? 'Placing…' : `Place ${side} order`}
          </button>
          <button onClick={onCancel} disabled={submitting} style={{ padding: '6px 14px', borderRadius: 5, cursor: 'pointer', background: 'none', border: '1px solid var(--border)', color: 'var(--t2)', fontSize: 12 }}>Cancel</button>
        </div>
      </div>
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
  const isMobile = useIsMobile();
  // Desktop has the width for a wider form (less scrolling); mobile keeps 2 columns.
  const gridCols = (desktopCount: number) => (isMobile ? '1fr 1fr' : `repeat(${desktopCount}, 1fr)`);
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
    <div onClick={onDone} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overflowY: 'auto' }}>
    <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, background: 'var(--surface)', border: '1px solid var(--acc)', borderRadius: 10, padding: '16px 18px', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--acc)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{editing ? 'Edit event' : 'Add event'}</div>

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
        <div style={{ display: 'grid', gridTemplateColumns: gridCols(4), gap: 8, marginBottom: 8 }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: gridCols(3), gap: 8, marginBottom: 8 }}>
          <div><label style={lbl}>Right</label>
            <select style={fld} value={instrument} onChange={(e) => setInstrument(e.target.value as 'CALL' | 'PUT')}>
              <option value="CALL">Call</option><option value="PUT">Put</option>
            </select></div>
          <div><label style={lbl}>Strike</label>
            <input style={fld} type="number" step="0.5" value={strike} onChange={(e) => setStrike(e.target.value)} /></div>
          <div><label style={lbl}>Expiry</label>
            <input style={fld} type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} /></div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: gridCols(4), gap: 8 }}>
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
    </div>
  );
}

function deriveLabel(ev: LegEvent): ActionLabel {
  const d = displayAction(ev);
  return (ACTIONS as readonly string[]).includes(d) ? (d as ActionLabel) : 'New';
}
function num(s: string): number | null { return s.trim() === '' ? null : parseFloat(s); }

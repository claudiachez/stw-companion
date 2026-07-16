import type { Holding } from '../api';
import { useFiltersStore, type SortMode } from '../useFilters';
import { FONT_SIZE, TREND_BUCKET_META, TREND_BUCKET_ORDER } from '@stw/shared';
import type { TrendBucket, SectorStanding } from '@stw/shared';

// Sector-regime (rotation standing) options — labels mirror RegimeBadge's chips.
const STANDING_OPTIONS: { value: SectorStanding; label: string }[] = [
  { value: 'leader',     label: 'Sector Leader' },
  { value: 'setting_up', label: 'Sector Setting Up' },
  { value: 'laggard',    label: 'Sector Laggard' },
];

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'conviction',  label: 'Sort: Conviction' },
  { value: 'az',          label: 'Sort: A → Z' },
  { value: 'za',          label: 'Sort: Z → A' },
  { value: 'recent',      label: 'Sort: Newest' },
  { value: 'oldest',      label: 'Sort: Oldest' },
  { value: 'weight_desc', label: 'Sort: Weight ↓' },
  { value: 'weight_asc',  label: 'Sort: Weight ↑' },
  { value: 'pnl_desc',    label: 'Sort: P&L ↓' },
  { value: 'pnl_asc',     label: 'Sort: P&L ↑' },
];

// Border color lives in ctrlBorderClass, never inline — an inline style.border always
// wins over a stylesheet class regardless of specificity, which would make
// `focus:border-acc` silently never take effect (found + fixed in TextInput.tsx and
// PortfolioFilterBar.tsx earlier this same session — see TextInput.tsx's header
// comment for the full story).
const ctrlStyle: React.CSSProperties = {
  height: 34,
  padding: '0 8px',
  fontSize: FONT_SIZE.sm,
  borderRadius: 5,
  background: 'var(--bg)',
  color: 'var(--text)',
  cursor: 'pointer',
  flexShrink: 0,
};
const ctrlBorderClass = 'border border-[var(--border)] focus:outline-none focus:border-acc';

interface Props {
  holdings: Holding[];
  sectors: string[];
  filtered: number;
}

export function FilterBar({ holdings, sectors, filtered }: Props) {
  const { search, basket, tier, status, type, structure, standing, sector, hideClosed, sort,
    setSearch, setBasket, setTier, setStatus, setType, setStructure, setStanding, setSector, setHideClosed, setSort, reset } =
    useFiltersStore();

  const baskets = [...new Set(holdings.map((h) => h.basket).filter(Boolean))].sort();
  const hasFilter = search || basket || tier || status || type || structure || standing || sector || !hideClosed;
  // Denominator = the universe under the current closed-context (not all-time). CASH is a
  // balance, never counted. When "Show closed" is off, closed positions are excluded from the
  // total too — so it reads "34 positions" instead of the confusing "34 of 45". Mirrors the
  // hideClosed rule in applyFilters so the numerator and denominator stay in the same universe.
  const total = holdings.filter((h) => {
    if (h.ticker === 'CASH') return false;
    if (hideClosed && status !== 'Closed' && h.last_action === 'Closed') return false;
    return true;
  }).length;

  return (
    <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--bsub)', overflowX: 'auto', WebkitOverflowScrolling: 'touch' as never, flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', minWidth: 'max-content' }}>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search ticker…"
          className={ctrlBorderClass}
          style={{ ...ctrlStyle, width: 120, cursor: 'text' }}
        />

        <select value={basket} onChange={(e) => setBasket(e.target.value)} className={ctrlBorderClass} style={ctrlStyle}>
          <option value="">All Baskets</option>
          {baskets.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>

        <select value={tier} onChange={(e) => setTier(e.target.value)} className={ctrlBorderClass} style={ctrlStyle}>
          <option value="">All Tiers</option>
          <option value="5">Tier 1 — Highest</option>
          <option value="4">Tier 2 — High</option>
          <option value="3">Tier 3 — Moderate</option>
          <option value="2">Tier 4 — Waning</option>
          <option value="1">Tier 5 — Concern</option>
          <option value="0">Tier 6 — Legacy</option>
        </select>

        <select value={status} onChange={(e) => setStatus(e.target.value)} className={ctrlBorderClass} style={ctrlStyle}>
          <option value="">All Status</option>
          <option value="New">New</option>
          <option value="Upsized">Upsized</option>
          <option value="Trimmed">Trimmed</option>
          <option value="Closed">Closed</option>
        </select>

        <select value={type} onChange={(e) => setType(e.target.value)} className={ctrlBorderClass} style={ctrlStyle}>
          <option value="">All Types</option>
          <option value="shares">Shares</option>
          <option value="options">Options</option>
          <option value="mixed">Mixed</option>
        </select>

        <select value={structure} onChange={(e) => setStructure(e.target.value as TrendBucket | '')} className={ctrlBorderClass} style={ctrlStyle} title="Filter by the ticker's own 9/21/200 trend structure">
          <option value="">All Structure</option>
          {TREND_BUCKET_ORDER.map((b) => <option key={b} value={b}>{TREND_BUCKET_META[b].label}</option>)}
        </select>

        <select value={standing} onChange={(e) => setStanding(e.target.value as SectorStanding | '')} className={ctrlBorderClass} style={ctrlStyle} title="Filter by the ticker's sector rotation standing (sector regime)">
          <option value="">All Sector Regime</option>
          {STANDING_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        {sectors.length > 0 && (
          <select value={sector} onChange={(e) => setSector(e.target.value)} className={ctrlBorderClass} style={ctrlStyle} title="Filter by GICS market sector">
            <option value="">All Sectors</option>
            {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}

        <select value={sort} onChange={(e) => setSort(e.target.value as SortMode)} className={ctrlBorderClass} style={ctrlStyle}>
          {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <label
          className="border border-[var(--border)]"
          style={{ ...ctrlStyle, display: 'flex', alignItems: 'center', gap: 6, color: hideClosed ? 'var(--t2)' : 'var(--text)' }}
          title="Show closed positions"
        >
          <input
            type="checkbox"
            checked={!hideClosed}
            onChange={(e) => setHideClosed(!e.target.checked)}
            style={{ accentColor: 'var(--acc)', cursor: 'pointer' }}
          />
          Show closed
        </label>

        {hasFilter && (
          <button
            onClick={reset}
            style={{ ...ctrlStyle, border: 'none', background: 'none', color: 'var(--t3)', padding: '0 4px', cursor: 'pointer' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--t2)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--t3)'; }}
          >
            Clear
          </button>
        )}

        <span style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', marginLeft: 4, whiteSpace: 'nowrap' }}>
          {filtered < total ? `${filtered} of ${total}` : `${total} positions`}
        </span>
      </div>
    </div>
  );
}

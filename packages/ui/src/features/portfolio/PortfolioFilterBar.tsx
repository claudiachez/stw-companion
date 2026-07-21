// Filter + sort controls for the My Portfolio Positions tab. Reshaped to the unified Listing
// Pages redesign (plans/20260720_webapp_redesign): a two-row bar shared with the Stock Picks
// FilterBar — row 1 = search + dropdown filters + count; row 2 = segmented filter-chip groups
// (Type / Stops / Trend / Sector regime) + the Tailed-only / Group-by-ticker toggles. Owns its
// OWN surface wrapper now (the page just drops it in a flexShrink:0 slot). State is owned by
// PortfolioPage; the synced stamp + Sync live in the page's global control cluster, not here.

import { FONT_SIZE, TREND_BUCKET_META, TREND_BUCKET_ORDER, CONVICTION_BAND_OPTIONS } from '@stw/shared';
import type { TrendBucket, SectorStanding, ConvictionBand } from '@stw/shared';
import { SegmentedControl, type SegmentOption } from '../../primitives/SegmentedControl';

export type PortfolioSort =
  | 'pnl_desc' | 'pnl_asc'
  | 'ret_desc' | 'ret_asc'
  | 'value_desc' | 'value_asc'
  | 'dd_desc' | 'dd_asc'
  | 'az' | 'za';

export type PortfolioType = '' | 'stocks' | 'options';

/** Per-stock stop-ladder filter: '' = all · 'attention' = near or past a rung · 'breach' = past a rung, not trimmed. */
export type PortfolioStopFilter = '' | 'attention' | 'breach';

export interface PortfolioFilters {
  search: string;
  basket: string;
  conviction: ConvictionBand;    // tailed pick's STW conviction band (shared with Trades)
  structure: TrendBucket | '';   // the ticker's own 9/21/200 trend structure
  standing: SectorStanding | ''; // its sector's rotation standing (sector regime)
  sector: string;                // GICS market sector (from useSectorMap); '' = all
  stop: PortfolioStopFilter;     // per-stock drawdown stop-ladder status
  type: PortfolioType;
  sort: PortfolioSort;
  tailedOnly: boolean;
  groupByTicker: boolean;
}

export const DEFAULT_PORTFOLIO_FILTERS: PortfolioFilters = {
  search: '',
  basket: '',
  conviction: '',
  structure: '',
  standing: '',
  sector: '',
  stop: '',
  type: '',
  sort: 'pnl_desc',
  tailedOnly: false,
  groupByTicker: true, // §6.3 — legs of the same underlying (shares + options) stay together by default
};

// Sector-regime (rotation standing) options — labels mirror RegimeBadge's chips.
const STANDING_OPTIONS: { value: SectorStanding; label: string }[] = [
  { value: 'leader',     label: 'Sector Leader' },
  { value: 'setting_up', label: 'Sector Setting Up' },
  { value: 'laggard',    label: 'Sector Laggard' },
];

const SORT_OPTIONS: { value: PortfolioSort; label: string }[] = [
  { value: 'pnl_desc',   label: 'Sort: P&L ↓' },
  { value: 'pnl_asc',    label: 'Sort: P&L ↑' },
  { value: 'ret_desc',   label: 'Sort: Return ↓' },
  { value: 'ret_asc',    label: 'Sort: Return ↑' },
  { value: 'value_desc', label: 'Sort: Value ↓' },
  { value: 'value_asc',  label: 'Sort: Value ↑' },
  { value: 'dd_asc',     label: 'Sort: Stop drawdown ↓' }, // most negative (worst) first
  { value: 'dd_desc',    label: 'Sort: Stop drawdown ↑' },
  { value: 'az',         label: 'Sort: A → Z' },
  { value: 'za',         label: 'Sort: Z → A' },
];

// Row-2 segmented groups (Listing Pages redesign) — the axes shown as one-tap segments rather
// than a dropdown. Wired to the same filter fields the old <select>s used, so every filter
// option is preserved.
const TYPE_SEGMENTS: SegmentOption<PortfolioType>[] = [
  { value: '',       label: 'All' },
  { value: 'stocks', label: 'Stocks' },
  { value: 'options', label: 'Options' },
];
const STOP_SEGMENTS: SegmentOption<PortfolioStopFilter>[] = [
  { value: '',          label: 'All' },
  { value: 'attention', label: '⚠ Near' },
  { value: 'breach',    label: '● Past' },
];
// Full 9/21/200 trend-bucket set (keeps every existing structure filter working).
const TREND_SEGMENTS: SegmentOption<TrendBucket | ''>[] = [
  { value: '', label: 'All' },
  ...TREND_BUCKET_ORDER.map((b) => ({ value: b, label: TREND_BUCKET_META[b].label })),
];
const STANDING_SEGMENTS: SegmentOption<SectorStanding | ''>[] = [
  { value: '', label: 'All' },
  ...STANDING_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
];

// Border color lives in the class below, never in this inline style object — an inline
// `style.border` always wins over a stylesheet class regardless of specificity, which
// would make `ctrlBorderClass`'s `focus:border-acc` silently never take effect (found +
// fixed in TextInput.tsx the same session — see its header comment for the full story).
const ctrlStyle: React.CSSProperties = {
  height: 34, padding: '0 8px', fontSize: FONT_SIZE.sm, borderRadius: 5,
  background: 'var(--bg)', color: 'var(--text)',
  cursor: 'pointer', flexShrink: 0,
};

// For real keyboard-focus targets (text input, selects) — pairs the removed native
// outline with a visible border-color change on focus instead of just deleting it.
const ctrlBorderClass = 'border border-[var(--border)] focus:outline-none focus:border-acc';
// For the toggle `<label>` chips — same visible border, but the label itself never
// receives focus (the checkbox inside it does, and keeps its own native focus ring).
const ctrlBorderClassStatic = 'border border-[var(--border)]';

const toggleStyle = (on: boolean): React.CSSProperties => ({
  ...ctrlStyle, display: 'flex', alignItems: 'center', gap: 6, color: on ? 'var(--text)' : 'var(--t2)',
});

interface Props {
  filters: PortfolioFilters;
  onChange: (next: PortfolioFilters) => void;
  baskets: string[];
  sectors: string[];
  filtered: number;
  total: number;
}

export function PortfolioFilterBar({ filters, onChange, baskets, sectors, filtered, total }: Props) {
  const { search, basket, conviction, structure, standing, sector, stop, type, sort, tailedOnly, groupByTicker } = filters;
  const hasFilter = !!search || !!basket || !!conviction || !!structure || !!standing || !!sector || !!stop || type !== '' || tailedOnly;

  return (
    <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--bsub)', flexShrink: 0 }}>
      {/* Row 1 — search + dropdown filters + count */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderBottom: '1px solid var(--bsub)', overflowX: 'auto', WebkitOverflowScrolling: 'touch' as never }}>
        <input
          type="text"
          value={search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          placeholder="Search ticker…"
          className={ctrlBorderClass}
          style={{ ...ctrlStyle, width: 120, cursor: 'text' }}
        />

        {baskets.length > 0 && (
          <select value={basket} onChange={(e) => onChange({ ...filters, basket: e.target.value })} className={ctrlBorderClass} style={ctrlStyle}>
            <option value="">All Baskets</option>
            {baskets.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        )}

        <select value={conviction} onChange={(e) => onChange({ ...filters, conviction: e.target.value as ConvictionBand })} className={ctrlBorderClass} style={ctrlStyle} title="Filter by the tailed pick's STW conviction tier">
          <option value="">All Conviction</option>
          {CONVICTION_BAND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        {sectors.length > 0 && (
          <select value={sector} onChange={(e) => onChange({ ...filters, sector: e.target.value })} className={ctrlBorderClass} style={ctrlStyle} title="Filter by GICS market sector">
            <option value="">All Sectors</option>
            {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}

        <select value={sort} onChange={(e) => onChange({ ...filters, sort: e.target.value as PortfolioSort })} className={ctrlBorderClass} style={ctrlStyle}>
          {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        {hasFilter && (
          <button
            onClick={() => onChange({ ...filters, search: '', basket: '', conviction: '', structure: '', standing: '', sector: '', stop: '', type: '', tailedOnly: false })}
            style={{ ...ctrlStyle, border: 'none', background: 'none', color: 'var(--t3)', padding: '0 4px' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--t2)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--t3)'; }}
          >
            Clear
          </button>
        )}

        <span style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', marginLeft: 'auto', paddingLeft: 8, whiteSpace: 'nowrap' }}>
          {filtered < total ? `${filtered} of ${total}` : `${total} position${total === 1 ? '' : 's'}`}
        </span>
      </div>

      {/* Row 2 — segmented filter groups + toggles */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '6px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--bsub)', overflowX: 'auto', WebkitOverflowScrolling: 'touch' as never }}>
        <SegmentedControl
          label="Type"
          options={TYPE_SEGMENTS}
          value={type}
          onChange={(v) => onChange({ ...filters, type: v })}
        />
        <SegmentedControl
          label="Stops"
          title="Filter by each stock's per-stock drawdown stop-ladder status"
          options={STOP_SEGMENTS}
          value={stop}
          onChange={(v) => onChange({ ...filters, stop: v })}
        />
        <SegmentedControl
          label="Trend"
          title="Filter by the ticker's own 9/21/200 trend structure"
          options={TREND_SEGMENTS}
          value={structure}
          onChange={(v) => onChange({ ...filters, structure: v })}
        />
        <SegmentedControl
          label="Sector regime"
          title="Filter by the ticker's sector rotation standing (sector regime)"
          options={STANDING_SEGMENTS}
          value={standing}
          onChange={(v) => onChange({ ...filters, standing: v })}
        />

        <label className={ctrlBorderClassStatic} style={toggleStyle(tailedOnly)} title="Show only positions that match a followed trader's pick">
          <input type="checkbox" checked={tailedOnly} onChange={(e) => onChange({ ...filters, tailedOnly: e.target.checked })} style={{ accentColor: 'var(--acc)', cursor: 'pointer' }} />
          Tailed only
        </label>

        <label className={ctrlBorderClassStatic} style={toggleStyle(groupByTicker)} title="Group legs by underlying ticker (off = flat per-leg table)">
          <input type="checkbox" checked={groupByTicker} onChange={(e) => onChange({ ...filters, groupByTicker: e.target.checked })} style={{ accentColor: 'var(--acc)', cursor: 'pointer' }} />
          Group by ticker
        </label>
      </div>
    </div>
  );
}

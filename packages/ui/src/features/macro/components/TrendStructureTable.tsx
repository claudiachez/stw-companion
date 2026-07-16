import type { MacroIndicator, TrendBucket } from '@stw/shared';
import { TREND_BUCKET_META, TREND_BUCKET_ORDER, trendDirectionArrow, trendDirectionPhrase, FONT_SIZE, FONT_WEIGHT, LETTER_SPACING } from '@stw/shared';
import { ALL_INDICATORS, EXPERT_TREND_SYMBOLS } from '../useMacroIndicators';
import { resolveDelta, type TrendHistoryEntry } from '../useMacroTrendHistory';
import { SourceNote } from './macroVisuals';

// Not DataTable: this table's rows are interleaved with full-width bucket-group header
// rows (colSpan across every column, e.g. "ABOVE 9 · 21 · 200 — MOMENTUM") — a shape
// DataTable's flat row-per-item model doesn't support. Tokenized in place instead.

interface Props {
  indicators: MacroIndicator[];
  visibleSymbols: string[];
  onToggle: (symbol: string) => void;
  asOf: string | null;
  updatedAt?: Date | string | null;
  /** Per-symbol 5D/20D deltas from the P2 trend engine; null entries until ~5 days of history accrue. */
  indicatorDeltas?: Record<string, TrendHistoryEntry>;
}

const EXPERT_SET = new Set(EXPERT_TREND_SYMBOLS);

// Bucket → CSS color token (kept in the UI; the shared layer stays framework-agnostic).
const BUCKET_COLOR: Record<TrendBucket, string> = {
  momentum:         'var(--c5)',
  healthy_pullback: 'var(--c5)',
  mid_caution:      'var(--c3)',
  bear_rally:       'var(--c3)',
  risk_off:         'var(--c1)',
};

function fmt(v: number | null, decimals = 2): string {
  return v === null ? '—' : v.toFixed(decimals);
}

function fmtChg(v: number | null): string {
  if (v === null) return '—';
  return (v >= 0 ? '+' : '') + v.toFixed(2);
}

function fmtPct(v: number | null): string {
  if (v === null) return '—';
  return (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
}

function chgColor(v: number | null): string {
  if (v === null) return 'var(--t2)';
  return v > 0 ? 'var(--c5)' : v < 0 ? 'var(--c1)' : 'var(--t2)';
}

function MaCell({ close, ma }: { close: number | null; ma: number | null }) {
  if (ma === null) return <td style={{ padding: '6px 8px', color: 'var(--t3)', fontSize: FONT_SIZE.sm }}>—</td>;
  const above = close !== null && close > ma;
  return (
    <td style={{ padding: '6px 8px', fontSize: FONT_SIZE.sm, color: above ? 'var(--c5)' : 'var(--c1)' }}>
      {fmt(ma)} {above ? '▲' : '▼'}
    </td>
  );
}

function TrendBadge({ entry }: { entry: TrendHistoryEntry | undefined }) {
  // Prefer the 5D read (with its direction phrase); fall back to the 3D delta
  // while history is still short so the column isn't a blank em-dash for days.
  const resolved = entry ? resolveDelta(entry) : { value: null, label: '5D' as const };
  if (!entry || resolved.value === null) {
    return <td style={{ padding: '6px 8px', fontSize: FONT_SIZE.sm, color: 'var(--t3)', whiteSpace: 'nowrap' }}>—</td>;
  }
  if (entry.fiveDayDelta !== null) {
    const arrow = trendDirectionArrow(entry.direction);
    const color = arrow === '↑' ? 'var(--c5)' : arrow === '↓' ? 'var(--c1)' : 'var(--t2)';
    return (
      <td style={{ padding: '6px 8px', fontSize: FONT_SIZE.sm, color, whiteSpace: 'nowrap' }}>
        {arrow} {trendDirectionPhrase(entry.direction)} ({entry.fiveDayDelta >= 0 ? '+' : ''}{Math.round(entry.fiveDayDelta)})
      </td>
    );
  }
  // 3D fallback — no classified direction, so read the arrow off the sign.
  const n = Math.round(resolved.value);
  const arrow = n > 0 ? '↑' : n < 0 ? '↓' : '→';
  const color = n > 0 ? 'var(--c5)' : n < 0 ? 'var(--c1)' : 'var(--t2)';
  return (
    <td style={{ padding: '6px 8px', fontSize: FONT_SIZE.sm, color, whiteSpace: 'nowrap' }}>
      {arrow} 3D {n >= 0 ? '+' : ''}{n}
    </td>
  );
}

function IndicatorRow({ ind, trendEntry }: { ind: MacroIndicator; trendEntry?: TrendHistoryEntry }) {
  const bucketColor = ind.bucket ? BUCKET_COLOR[ind.bucket] : 'var(--t3)';
  const bucketLabel = ind.bucket ? TREND_BUCKET_META[ind.bucket].label : 'N/A';
  return (
    <tr style={{ borderBottom: '1px solid var(--bsub)' }}>
      <td style={{ padding: '6px 8px', fontWeight: FONT_WEIGHT.semibold, fontSize: FONT_SIZE.sm, whiteSpace: 'nowrap', color: 'var(--text)' }}>{ind.symbol}</td>
      <td style={{ padding: '6px 8px', fontSize: FONT_SIZE.sm, color: 'var(--t2)', whiteSpace: 'nowrap' }}>{ind.name}</td>
      <td style={{ padding: '6px 8px', fontSize: FONT_SIZE.sm, color: 'var(--text)', whiteSpace: 'nowrap' }}>{fmt(ind.close)}</td>
      <td style={{ padding: '6px 8px', fontSize: FONT_SIZE.sm, color: chgColor(ind.chg), whiteSpace: 'nowrap' }}>{fmtChg(ind.chg)}</td>
      <td style={{ padding: '6px 8px', fontSize: FONT_SIZE.sm, color: chgColor(ind.chgPct), whiteSpace: 'nowrap' }}>{fmtPct(ind.chgPct)}</td>
      <MaCell close={ind.close} ma={ind.ma9} />
      <MaCell close={ind.close} ma={ind.ma21} />
      <MaCell close={ind.close} ma={ind.ma200} />
      <td style={{ padding: '6px 8px', fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: bucketColor, whiteSpace: 'nowrap' }}>{bucketLabel}</td>
      <TrendBadge entry={trendEntry} />
    </tr>
  );
}

export function TrendStructureTable({ indicators, visibleSymbols, onToggle, asOf, updatedAt, indicatorDeltas }: Props) {
  const visSet = new Set(visibleSymbols);
  const visible = indicators.filter((i) => visSet.has(i.symbol));

  const grouped: Partial<Record<TrendBucket, MacroIndicator[]>> = {};
  const naList: MacroIndicator[] = [];
  visible.forEach((ind) => {
    if (ind.bucket) (grouped[ind.bucket] ??= []).push(ind);
    else naList.push(ind);
  });

  return (
    <div>
      {/* Optional indicators — click a ticker to add/remove it directly */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)' }}>Small-cap, breadth &amp; intl indicators:</span>
        {ALL_INDICATORS.filter((i) => EXPERT_SET.has(i.symbol)).map((i) => (
          <button
            key={i.symbol}
            onClick={() => onToggle(i.symbol)}
            style={{
              fontSize: FONT_SIZE.xs, padding: '2px 8px', borderRadius: 4, border: '1px solid var(--border)',
              background: visSet.has(i.symbol) ? 'var(--acc)' : 'transparent',
              color: visSet.has(i.symbol) ? 'var(--text-inverse)' : 'var(--t2)', cursor: 'pointer',
            }}
          >
            {i.symbol}
          </button>
        ))}
      </div>

      {/* Table — scrolls inside the card on mobile, full table on desktop.
          Not DataTable: grouped bucket-header rows (colSpan across every column) — see the
          header-comment note above. */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: FONT_SIZE.sm }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Symbol', 'Name', 'Close', 'Chg', 'Chg%', 'vs 9d MA', 'vs 21d MA', 'vs 200d MA', 'Structure', 'Trend'].map((h) => (
                <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.semibold, letterSpacing: LETTER_SPACING.label, textTransform: 'uppercase', color: 'var(--t3)', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TREND_BUCKET_ORDER.map((bucket) => {
              const rows = grouped[bucket];
              if (!rows?.length) return null;
              return [
                <tr key={`b-${bucket}`} style={{ background: 'var(--s2)' }}>
                  <td colSpan={10} style={{ padding: '5px 8px', fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.bold, letterSpacing: '0.1em', textTransform: 'uppercase', color: BUCKET_COLOR[bucket] }}>
                    {TREND_BUCKET_META[bucket].groupLabel}
                  </td>
                </tr>,
                ...rows.map((ind) => <IndicatorRow key={ind.symbol} ind={ind} trendEntry={indicatorDeltas?.[ind.symbol]} />),
              ];
            })}
            {naList.map((ind) => <IndicatorRow key={ind.symbol} ind={ind} trendEntry={indicatorDeltas?.[ind.symbol]} />)}
          </tbody>
        </table>
      </div>
      <SourceNote source="Quotes: Finnhub (live, ≤15m) · MAs: TwelveData daily" href="https://twelvedata.com" asOf={asOf} updatedAt={updatedAt} />
    </div>
  );
}

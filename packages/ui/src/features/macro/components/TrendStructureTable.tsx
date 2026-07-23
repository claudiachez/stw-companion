import type { MacroIndicator, TrendBucket } from '@stw/shared';
import { TREND_BUCKET_META, TREND_BUCKET_ORDER, trendDirectionArrow, trendDirectionPhrase, FONT_SIZE, FONT_WEIGHT } from '@stw/shared';
import { ALL_INDICATORS, EXPERT_TREND_SYMBOLS } from '../useMacroIndicators';
import { resolveDelta, type TrendHistoryEntry } from '../useMacroTrendHistory';
import { Card, CardHeader, HelpPanel, SourceNote } from './macroVisuals';

// Grouped structure table: colored group headers spell the 9/21/200-MA combination
// (TREND_BUCKET_META.groupLabel); rows are the visible indices (SPY/QQQ + the toggled
// small-cap/breadth/intl set). Every symbol is plain styled text — Macro is the
// documented TickerLink exception (index/ETF symbols have no detail page). Nothing is
// re-derived: buckets come from useMacroIndicators, trend notes from the P2 delta engine.

interface Props {
  indicators: MacroIndicator[];
  visibleSymbols: string[];
  onToggle: (symbol: string) => void;
  asOf: string | null;
  updatedAt?: Date | string | null;
  /** Per-symbol 5D/20D deltas from the P2 trend engine; null entries until history accrues. */
  indicatorDeltas?: Record<string, TrendHistoryEntry>;
  helpOpen: boolean;
  onToggleHelp: () => void;
  help: React.ReactNode;
}

const EXPERT_SET = new Set(EXPERT_TREND_SYMBOLS);

const BUCKET_COLOR: Record<TrendBucket, string> = {
  momentum:         'var(--status-positive-text)',
  healthy_pullback: 'var(--status-positive-text)',
  mid_caution:      'var(--status-warning-text)',
  bear_rally:       'var(--status-warning-text)',
  risk_off:         'var(--status-negative-text)',
};

const BUCKET_BG: Record<TrendBucket, string> = {
  momentum:         'var(--status-positive-bg)',
  healthy_pullback: 'var(--status-positive-bg)',
  mid_caution:      'var(--status-warning-bg)',
  bear_rally:       'var(--status-warning-bg)',
  risk_off:         'var(--status-negative-bg)',
};

/** Best-available day-over-day-ish trend note (5D with its direction phrase, else 3D). */
function trendNote(entry: TrendHistoryEntry | undefined): { text: string; color: string } {
  const resolved = entry ? resolveDelta(entry) : { value: null, label: '5D' as const };
  if (!entry || resolved.value === null) return { text: '—', color: 'var(--t3)' };
  if (entry.fiveDayDelta !== null) {
    const arrow = trendDirectionArrow(entry.direction);
    const color = arrow === '↑' ? 'var(--status-positive-text)' : arrow === '↓' ? 'var(--status-negative-text)' : 'var(--t2)';
    return { text: `${arrow} ${trendDirectionPhrase(entry.direction)} (${entry.fiveDayDelta >= 0 ? '+' : ''}${Math.round(entry.fiveDayDelta)})`, color };
  }
  const n = Math.round(resolved.value);
  const arrow = n > 0 ? '↑' : n < 0 ? '↓' : '→';
  const color = n > 0 ? 'var(--status-positive-text)' : n < 0 ? 'var(--status-negative-text)' : 'var(--t2)';
  return { text: `${arrow} 3D ${n >= 0 ? '+' : ''}${n}`, color };
}

function Th({ children, width, flex }: { children: React.ReactNode; width?: number; flex?: boolean }) {
  return (
    <span style={{
      width, flex: flex ? 1 : undefined, minWidth: flex ? 120 : undefined, flexShrink: width ? 0 : undefined,
      fontSize: FONT_SIZE['3xs'], fontWeight: FONT_WEIGHT.bold, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--t3)',
    }}>{children}</span>
  );
}

function IndicatorRow({ ind, entry }: { ind: MacroIndicator; entry?: TrendHistoryEntry }) {
  const bucketColor = ind.bucket ? BUCKET_COLOR[ind.bucket] : 'var(--t3)';
  const bucketLabel = ind.bucket ? TREND_BUCKET_META[ind.bucket].label : 'N/A';
  const note = trendNote(entry);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--bsub)', flexWrap: 'wrap' }}>
      <span style={{ width: 44, flexShrink: 0, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, color: 'var(--text)' }}>{ind.symbol}</span>
      <span style={{ flex: 1, minWidth: 120, fontSize: FONT_SIZE.xs, color: 'var(--t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ind.name}</span>
      <span style={{ width: 150, flexShrink: 0, fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold, color: bucketColor, whiteSpace: 'nowrap' }}>{bucketLabel}</span>
      <span style={{ width: 190, flexShrink: 0, fontSize: FONT_SIZE.xs, color: note.color, whiteSpace: 'nowrap' }}>{note.text}</span>
    </div>
  );
}

export function TrendStructureTable({ indicators, visibleSymbols, onToggle, asOf, updatedAt, indicatorDeltas, helpOpen, onToggleHelp, help }: Props) {
  const visSet = new Set(visibleSymbols);
  const visible = indicators.filter((i) => visSet.has(i.symbol));

  const grouped: Partial<Record<TrendBucket, MacroIndicator[]>> = {};
  const naList: MacroIndicator[] = [];
  visible.forEach((ind) => {
    if (ind.bucket) (grouped[ind.bucket] ??= []).push(ind);
    else naList.push(ind);
  });

  return (
    <Card>
      <CardHeader title="Trend / market structure" helpOpen={helpOpen} onToggleHelp={onToggleHelp} />

      {/* Optional small-cap / breadth / intl indicators — click a ticker to add/remove it. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', margin: '8px 0 10px' }}>
        <span style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)' }}>Small-cap, breadth &amp; intl indicators:</span>
        {ALL_INDICATORS.filter((i) => EXPERT_SET.has(i.symbol)).map((i) => {
          const on = visSet.has(i.symbol);
          return (
            <button
              key={i.symbol}
              onClick={() => onToggle(i.symbol)}
              style={{
                display: 'inline-flex', padding: '2px 9px', borderRadius: 5, cursor: 'pointer',
                border: on ? 'none' : '1px solid var(--border)',
                background: on ? 'var(--acc)' : 'transparent',
                color: on ? 'var(--text-inverse)' : 'var(--t2)',
                fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.bold,
              }}
            >
              {i.symbol}
            </button>
          );
        })}
      </div>

      {helpOpen && <HelpPanel>{help}</HelpPanel>}

      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 480 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 0 6px' }}>
            <Th width={44}>Symbol</Th>
            <Th flex>Name</Th>
            <Th width={150}>Structure</Th>
            <Th width={190}>Trend</Th>
          </div>

          {TREND_BUCKET_ORDER.map((bucket) => {
            const rows = grouped[bucket];
            if (!rows?.length) return null;
            return (
              <div key={bucket}>
                <div style={{
                  background: BUCKET_BG[bucket], color: BUCKET_COLOR[bucket], fontSize: FONT_SIZE['3xs'], fontWeight: FONT_WEIGHT.bold,
                  letterSpacing: '0.06em', textTransform: 'uppercase', padding: '4px 8px', borderRadius: 4, margin: '2px 0',
                }}>
                  {TREND_BUCKET_META[bucket].groupLabel}
                </div>
                {rows.map((ind) => <IndicatorRow key={ind.symbol} ind={ind} entry={indicatorDeltas?.[ind.symbol]} />)}
              </div>
            );
          })}
          {naList.map((ind) => <IndicatorRow key={ind.symbol} ind={ind} entry={indicatorDeltas?.[ind.symbol]} />)}
        </div>
      </div>

      <SourceNote source="Structure classified on the live price vs the daily MAs — regroups intraday · Finnhub quotes (≤15m) · TwelveData MAs" href="https://twelvedata.com" asOf={asOf} updatedAt={updatedAt} marginTop={8} />
    </Card>
  );
}

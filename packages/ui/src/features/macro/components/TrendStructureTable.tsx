import type { MacroIndicator, TrendBucket } from '@stw/shared';
import { TREND_BUCKET_META, TREND_BUCKET_ORDER } from '@stw/shared';
import { ALL_INDICATORS, EXPERT_TREND_SYMBOLS } from '../useMacroIndicators';

interface Props {
  indicators: MacroIndicator[];
  visibleSymbols: string[];
  onToggle: (symbol: string) => void;
  showExpert: boolean;
  onToggleExpert: () => void;
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
  if (ma === null) return <td style={{ padding: '6px 8px', color: 'var(--t3)', fontSize: 12 }}>—</td>;
  const above = close !== null && close > ma;
  return (
    <td style={{ padding: '6px 8px', fontSize: 12, color: above ? 'var(--c5)' : 'var(--c1)' }}>
      {fmt(ma)} {above ? '▲' : '▼'}
    </td>
  );
}

function IndicatorRow({ ind }: { ind: MacroIndicator }) {
  const bucketColor = ind.bucket ? BUCKET_COLOR[ind.bucket] : 'var(--t3)';
  const bucketLabel = ind.bucket ? TREND_BUCKET_META[ind.bucket].label : 'N/A';
  return (
    <tr style={{ borderBottom: '1px solid var(--bsub)' }}>
      <td style={{ padding: '6px 8px', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap', color: 'var(--text)' }}>{ind.symbol}</td>
      <td style={{ padding: '6px 8px', fontSize: 12, color: 'var(--t2)', whiteSpace: 'nowrap' }}>{ind.name}</td>
      <td style={{ padding: '6px 8px', fontSize: 12, color: 'var(--text)', whiteSpace: 'nowrap' }}>{fmt(ind.close)}</td>
      <td style={{ padding: '6px 8px', fontSize: 12, color: chgColor(ind.chg), whiteSpace: 'nowrap' }}>{fmtChg(ind.chg)}</td>
      <td style={{ padding: '6px 8px', fontSize: 12, color: chgColor(ind.chgPct), whiteSpace: 'nowrap' }}>{fmtPct(ind.chgPct)}</td>
      <MaCell close={ind.close} ma={ind.ma9} />
      <MaCell close={ind.close} ma={ind.ma21} />
      <MaCell close={ind.close} ma={ind.ma200} />
      <td style={{ padding: '6px 8px', fontSize: 12, fontWeight: 600, color: bucketColor, whiteSpace: 'nowrap' }}>{bucketLabel}</td>
    </tr>
  );
}

export function TrendStructureTable({ indicators, visibleSymbols, onToggle, showExpert, onToggleExpert }: Props) {
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
      {/* Expert toggle + per-symbol visibility */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <button
          onClick={onToggleExpert}
          style={{
            fontSize: 11, padding: '3px 10px', borderRadius: 4, border: '1px solid var(--border)',
            background: showExpert ? 'var(--acc)' : 'transparent',
            color: showExpert ? '#fff' : 'var(--t2)', cursor: 'pointer',
          }}
        >
          {showExpert ? 'Expert: On' : 'Expert: Off'}
        </button>
        <span style={{ fontSize: 11, color: 'var(--t3)' }}>Small-cap, breadth & intl confirmation</span>
        {showExpert && ALL_INDICATORS.filter((i) => EXPERT_SET.has(i.symbol)).map((i) => (
          <button
            key={i.symbol}
            onClick={() => onToggle(i.symbol)}
            style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 4, border: '1px solid var(--border)',
              background: visSet.has(i.symbol) ? 'var(--s2)' : 'transparent',
              color: visSet.has(i.symbol) ? 'var(--text)' : 'var(--t3)', cursor: 'pointer',
            }}
          >
            {i.symbol}
          </button>
        ))}
      </div>

      {/* Table — scrolls inside the card on mobile, full table on desktop */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Symbol', 'Name', 'Close', 'Chg', 'Chg%', 'vs 9d MA', 'vs 21d MA', 'vs 200d MA', 'Structure'].map((h) => (
                <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t3)', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TREND_BUCKET_ORDER.map((bucket) => {
              const rows = grouped[bucket];
              if (!rows?.length) return null;
              return [
                <tr key={`b-${bucket}`} style={{ background: 'var(--s2)' }}>
                  <td colSpan={9} style={{ padding: '5px 8px', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: BUCKET_COLOR[bucket] }}>
                    {TREND_BUCKET_META[bucket].groupLabel}
                  </td>
                </tr>,
                ...rows.map((ind) => <IndicatorRow key={ind.symbol} ind={ind} />),
              ];
            })}
            {naList.map((ind) => <IndicatorRow key={ind.symbol} ind={ind} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

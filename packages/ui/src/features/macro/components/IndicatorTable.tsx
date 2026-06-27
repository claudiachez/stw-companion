import type { MacroIndicator, MacroSignal, MacroTier } from '@stw/shared';
import { ALL_INDICATORS } from '../useMacroIndicators';

interface Props {
  indicators: MacroIndicator[];
  visibleSymbols: string[];
  onToggle: (symbol: string) => void;
  showExpert: boolean;
  onToggleExpert: () => void;
}

const EXPERT_SYMBOLS = new Set(['IWM', 'RSP', 'TLT', 'HYG', 'VEA']);

const SIGNAL_DOT: Record<MacroSignal, string> = {
  bullish: '🟢',
  caution: '🟡',
  bearish: '🔴',
  na: '⬛',
};

const SIGNAL_LABEL: Record<MacroSignal, string> = {
  bullish: 'Bullish',
  caution: 'Caution',
  bearish: 'Bearish',
  na: 'N/A',
};

const TIER_LABEL: Record<MacroTier, string> = {
  'momentum':    'ABOVE 9 · 21 · 200 — MOMENTUM',
  'mid-caution': 'BELOW 9+21 · ABOVE 200 — MID-TERM CAUTION',
  'risk-off':    'BELOW ALL THREE — RISK-OFF',
};

const TIER_COLOR: Record<MacroTier, string> = {
  'momentum':    'var(--c5)',
  'mid-caution': 'var(--c3)',
  'risk-off':    'var(--c1)',
};

const TIER_ORDER: MacroTier[] = ['momentum', 'mid-caution', 'risk-off'];

function fmt(v: number | null, decimals = 2): string {
  if (v === null) return '—';
  return v.toFixed(decimals);
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
  return (
    <tr style={{ borderBottom: '1px solid var(--bsub)' }}>
      <td style={{ padding: '6px 8px', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap', color: 'var(--text)' }}>{ind.symbol}</td>
      <td style={{ padding: '6px 8px', fontSize: 12, color: 'var(--t2)', whiteSpace: 'nowrap' }}>{ind.name}</td>
      <td style={{ padding: '6px 8px', fontSize: 12, color: 'var(--text)', whiteSpace: 'nowrap' }}>
        {ind.isYield ? fmt(ind.close) + '%' : fmt(ind.close)}
      </td>
      <td style={{ padding: '6px 8px', fontSize: 12, color: chgColor(ind.chg), whiteSpace: 'nowrap' }}>{fmtChg(ind.chg)}</td>
      <td style={{ padding: '6px 8px', fontSize: 12, color: chgColor(ind.chgPct), whiteSpace: 'nowrap' }}>{fmtPct(ind.chgPct)}</td>
      <MaCell close={ind.close} ma={ind.ma9} />
      <MaCell close={ind.close} ma={ind.ma21} />
      <MaCell close={ind.close} ma={ind.ma200} />
      <td style={{ padding: '6px 8px', fontSize: 12, whiteSpace: 'nowrap' }}>
        {SIGNAL_DOT[ind.signal]} {SIGNAL_LABEL[ind.signal]}
      </td>
    </tr>
  );
}

export function IndicatorTable({ indicators, visibleSymbols, onToggle, showExpert, onToggleExpert }: Props) {
  const visSet = new Set(visibleSymbols);
  const visible = indicators.filter((i) => visSet.has(i.symbol));

  const grouped: Partial<Record<MacroTier, MacroIndicator[]>> = {};
  const naList: MacroIndicator[] = [];
  visible.forEach((ind) => {
    if (ind.tier) {
      (grouped[ind.tier] ??= []).push(ind);
    } else {
      naList.push(ind);
    }
  });

  return (
    <div>
      {/* Expert toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <button
          onClick={onToggleExpert}
          style={{
            fontSize: 11,
            padding: '3px 10px',
            borderRadius: 4,
            border: '1px solid var(--border)',
            background: showExpert ? 'var(--acc)' : 'transparent',
            color: showExpert ? '#fff' : 'var(--t2)',
            cursor: 'pointer',
          }}
        >
          {showExpert ? 'Expert: On' : 'Expert: Off'}
        </button>
        <span style={{ fontSize: 11, color: 'var(--t3)' }}>Toggle expert indicators</span>
        {/* Per-indicator visibility toggles when expert on */}
        {showExpert && ALL_INDICATORS.filter((i) => EXPERT_SYMBOLS.has(i.symbol)).map((i) => (
          <button
            key={i.symbol}
            onClick={() => onToggle(i.symbol)}
            style={{
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: 4,
              border: '1px solid var(--border)',
              background: visSet.has(i.symbol) ? 'var(--s2)' : 'transparent',
              color: visSet.has(i.symbol) ? 'var(--text)' : 'var(--t3)',
              cursor: 'pointer',
            }}
          >
            {i.symbol}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Symbol', 'Name', 'Close', 'Chg', 'Chg%', 'vs 9d MA', 'vs 21d MA', 'vs 200d MA', 'Signal'].map((h) => (
                <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t3)', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TIER_ORDER.map((tier) => {
              const rows = grouped[tier];
              if (!rows?.length) return null;
              return [
                <tr key={`tier-${tier}`} style={{ background: 'var(--s2)' }}>
                  <td colSpan={9} style={{ padding: '5px 8px', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: TIER_COLOR[tier] }}>
                    {TIER_LABEL[tier]}
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

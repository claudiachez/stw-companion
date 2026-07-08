import { stressLabel, creditLabel, ratesDollarLabel, FONT_SIZE, FONT_WEIGHT } from '@stw/shared';
import type { VolatilityStress } from '../useVolatilityStress';
import type { CreditLiquidity } from '../useCreditLiquidity';
import type { RatesDollar } from '../useRatesDollar';
import { scoreColor, SourceNote } from './macroVisuals';

// Modules 5–7 consolidated into one "Market Internals" table (host, 2026-07-08).
// Volatility/Stress, Credit/Liquidity and Rates+Dollar were three near-identical
// full-width cards that stacked into ~3 screens of scroll and duplicated the
// Module Scores strip. Rather than an accordion (rejected — nobody wants to
// expand), each sleeve is one static row: score chip + name + status + its key
// values inline, plus a single source/updated footer. The per-sleeve tile
// components (VolatilityStressCard/CreditLiquidityCard/RatesDollarCard) are kept
// but currently unused — ready if we switch to an all-cards-shown layout instead.

interface Props {
  volatility: VolatilityStress | null;
  credit: CreditLiquidity | null;
  rates: RatesDollar | null;
}

interface Row {
  key: string;
  name: string;
  score: number | null;
  label: string;
  reading: string;
}

const n1 = (v: number | null | undefined) => (v != null ? v.toFixed(1) : '—');
const n2 = (v: number | null | undefined) => (v != null ? v.toFixed(2) : '—');

function volReading(v: VolatilityStress | null): string {
  if (!v) return 'unavailable';
  const pct = v.vixPercentile != null ? ` · ${v.vixPercentile}th pct` : '';
  return `VIX ${n1(v.vix)}${pct} · IV ${n2(v.ivPremium)}`;
}
function creditReading(c: CreditLiquidity | null): string {
  if (!c) return 'unavailable';
  const band = c.belowMa50 == null ? '' : ` · ${c.belowMa50 ? 'tight' : 'wide'} vs 50D`;
  const d5 = c.delta5 == null ? '' : ` · 5D ${c.delta5 >= 0 ? '+' : ''}${c.delta5.toFixed(2)}pp`;
  return `HY OAS ${n2(c.oas)}%${band}${d5}`;
}
function ratesReading(r: RatesDollar | null): string {
  if (!r) return 'unavailable';
  const bp = r.us10yDelta5 == null ? '' : ` (${Math.round(r.us10yDelta5 * 100) >= 0 ? '+' : ''}${Math.round(r.us10yDelta5 * 100)}bp 5D)`;
  const dollar = r.dollarAbove9 == null ? '—'
    : r.dollarAbove9 && r.dollarAbove21 ? 'strengthening'
    : !r.dollarAbove9 && !r.dollarAbove21 ? 'softening' : 'mixed';
  return `US10Y ${n2(r.us10y)}%${bp} · $ ${dollar}`;
}

export function MarketInternalsCard({ volatility, credit, rates }: Props) {
  const rows: Row[] = [
    { key: 'vol', name: 'Volatility / Stress', score: volatility?.sleeveScore ?? null, label: stressLabel(volatility?.sleeveScore ?? null), reading: volReading(volatility) },
    { key: 'credit', name: 'Credit / Liquidity', score: credit?.sleeveScore ?? null, label: creditLabel(credit?.sleeveScore ?? null), reading: creditReading(credit) },
    { key: 'rates', name: 'Rates + Dollar', score: rates?.sleeveScore ?? null, label: ratesDollarLabel(rates?.sleeveScore ?? null), reading: ratesReading(rates) },
  ];

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 16px 12px' }}>
      {rows.map((r, i) => (
        <div
          key={r.key}
          style={{
            display: 'flex', alignItems: 'baseline', gap: 12, padding: '12px 0',
            borderBottom: i < rows.length - 1 ? '1px solid var(--bsub)' : 'none',
          }}
        >
          <span style={{ fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, color: scoreColor(r.score), width: 34, flexShrink: 0, textAlign: 'right' }}>
            {r.score ?? '—'}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold, color: 'var(--text)' }}>{r.name}</span>
              <span style={{ fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: scoreColor(r.score) }}>{r.label}</span>
            </div>
            <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t2)', marginTop: 2 }}>{r.reading}</div>
          </div>
        </div>
      ))}
      <SourceNote
        source="FRED daily (VIX, HY OAS, DGS10, broad $) · IV: TwelveData SPY"
        asOf={volatility?.asOf}
        updatedAt={volatility?.updatedAt}
      />
    </div>
  );
}

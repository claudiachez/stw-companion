import { stressLabel, creditLabel, ratesDollarLabel, FONT_SIZE } from '@stw/shared';
import type { VolatilityStress } from '../useVolatilityStress';
import type { CreditLiquidity } from '../useCreditLiquidity';
import type { RatesDollar } from '../useRatesDollar';
import { Card, CardHeader, HelpPanel, SourceNote, bandColor } from './macroVisuals';

// "Under the hood" — the three stress sleeves (Volatility, Credit, Rates+Dollar) as
// status-dot rows. Pure re-layout: scores + labels come from the same sleeve hooks
// the regime engine reads. Source line is pinned to the card bottom so the card
// stays equal-height alongside the GEX and Fear/Greed cards in the 3-col grid.

interface Props {
  volatility: VolatilityStress | null;
  credit: CreditLiquidity | null;
  rates: RatesDollar | null;
  helpOpen: boolean;
  onToggleHelp: () => void;
  help: React.ReactNode;
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
  return `HY OAS ${n2(c.oas)}%${band}`;
}
function ratesReading(r: RatesDollar | null): string {
  if (!r) return 'unavailable';
  const bp = r.us10yDelta5 == null ? '' : ` (${Math.round(r.us10yDelta5 * 100) >= 0 ? '+' : ''}${Math.round(r.us10yDelta5 * 100)}bp 5D)`;
  const dollar = r.dollarAbove9 == null ? '—'
    : r.dollarAbove9 && r.dollarAbove21 ? 'strengthening'
    : !r.dollarAbove9 && !r.dollarAbove21 ? 'softening' : 'mixed';
  return `US10Y ${n2(r.us10y)}%${bp} · $ ${dollar}`;
}

interface Signal { key: string; name: string; score: number | null; verdict: string; short: string }

export function MarketInternalsCard({ volatility, credit, rates, helpOpen, onToggleHelp, help }: Props) {
  const signals: Signal[] = [
    { key: 'vol', name: 'Volatility', score: volatility?.sleeveScore ?? null, verdict: stressLabel(volatility?.sleeveScore ?? null), short: volReading(volatility) },
    { key: 'credit', name: 'Credit', score: credit?.sleeveScore ?? null, verdict: creditLabel(credit?.sleeveScore ?? null), short: creditReading(credit) },
    { key: 'rates', name: 'Rates + $', score: rates?.sleeveScore ?? null, verdict: ratesDollarLabel(rates?.sleeveScore ?? null), short: ratesReading(rates) },
  ];

  return (
    <Card style={{ display: 'flex', flexDirection: 'column' }}>
      <CardHeader title="Under the hood" helpOpen={helpOpen} onToggleHelp={onToggleHelp} />
      {helpOpen && <HelpPanel>{help}</HelpPanel>}
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 2 }}>
        {signals.map((s) => {
          const color = bandColor(s.score);
          return (
            <div key={s.key} style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '8px 0', borderTop: '1px solid var(--bsub)' }}>
              <span style={{ flexShrink: 0, width: 8, height: 8, borderRadius: '50%', background: color, alignSelf: 'center' }} />
              <span style={{ flex: 1, fontSize: FONT_SIZE.xs, color: 'var(--t3)', lineHeight: 1.5 }}>
                <b style={{ color: 'var(--text)', fontSize: FONT_SIZE.sm }}>{s.name}</b>{' '}
                <span style={{ color }}>{s.verdict}</span> · {s.short}
              </span>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 'auto' }}>
        <SourceNote source="FRED + CBOE" href="https://fred.stlouisfed.org" asOf={volatility?.asOf} updatedAt={volatility?.updatedAt} marginTop={8} />
      </div>
    </Card>
  );
}

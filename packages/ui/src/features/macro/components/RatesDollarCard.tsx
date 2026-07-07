import { ratesDollarLabel, FONT_SIZE } from '@stw/shared';
import type { RatesDollar } from '../useRatesDollar';
import { StatTile, SleeveSummary, TileGrid, SourceNote } from './macroVisuals';

interface Props {
  data: RatesDollar | null;
  loading: boolean;
  /** True when vol/credit stress is rising — colors the flight-to-safety note. */
  stressRising: boolean;
}

function bp(delta: number | null): string {
  if (delta === null) return '';
  const bps = Math.round(delta * 100);
  return `5D ${bps >= 0 ? '+' : ''}${bps}bp`;
}

export function RatesDollarCard({ data, loading, stressRising }: Props) {
  if (loading && !data) return <div style={{ color: 'var(--t3)', fontSize: FONT_SIZE.sm }}>Loading rates…</div>;
  if (!data) return <div style={{ color: 'var(--t3)', fontSize: FONT_SIZE.sm }}>Rates data unavailable (needs TwelveData key).</div>;

  const { us10y, us10yDelta5, uup, uupAbove9, uupAbove21, subScores, sleeveScore } = data;
  const fallingFast = us10yDelta5 !== null && us10yDelta5 <= -0.10;
  const uupTrend = uupAbove9 === null ? '' : (!uupAbove9 && !uupAbove21) ? 'below 9 & 21D' : (uupAbove9 && uupAbove21) ? 'above 9 & 21D' : 'mixed';

  return (
    <div>
      <SleeveSummary score={sleeveScore} label={ratesDollarLabel(sleeveScore)} hint="for growth/speculation" />
      <TileGrid>
        <StatTile
          label="US 10Y Yield"
          value={us10y !== null ? `${us10y.toFixed(2)}%` : '—'}
          sub={bp(us10yDelta5)}
          score={subScores.us10y}
        />
        <StatTile
          label="Dollar (UUP)"
          value={uup !== null ? uup.toFixed(2) : '—'}
          sub={uupTrend}
          score={subScores.uup}
        />
      </TileGrid>
      {fallingFast && stressRising && (
        <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--c3)', marginTop: 10 }}>
          ⚠ Yields falling fast while stress rises — flight to safety, not a growth tailwind.
        </div>
      )}
      <SourceNote source="TwelveData daily (CBOE TNX, UUP)" asOf={data.asOf} />
    </div>
  );
}

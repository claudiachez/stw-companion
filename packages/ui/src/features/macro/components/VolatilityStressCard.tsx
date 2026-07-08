import { FONT_SIZE } from '@stw/shared';
import type { VolatilityStress } from '../useVolatilityStress';
import { StatTile, TileGrid, SourceNote } from './macroVisuals';

interface Props {
  data: VolatilityStress | null;
  loading: boolean;
}

function fmtDelta(v: number | null): string {
  if (v === null) return '';
  return `5D ${v >= 0 ? '+' : ''}${v.toFixed(1)}`;
}

export function VolatilityStressCard({ data, loading }: Props) {
  if (loading && !data) return <div style={{ color: 'var(--t3)', fontSize: FONT_SIZE.sm }}>Loading volatility…</div>;
  if (!data) return <div style={{ color: 'var(--t3)', fontSize: FONT_SIZE.sm }}>Volatility data unavailable.</div>;

  const { vix, vixPercentile, vixDelta5, ivPremium, spyHv30, subScores } = data;

  return (
    <div>
      <TileGrid>
        <StatTile
          label="VIX"
          value={vix !== null ? vix.toFixed(1) : '—'}
          sub={[vixPercentile !== null ? `${vixPercentile}th pct` : '', fmtDelta(vixDelta5)].filter(Boolean).join(' · ')}
          score={subScores.vix}
        />
        <StatTile
          label="IV Premium"
          value={ivPremium !== null ? ivPremium.toFixed(2) : '—'}
          sub={spyHv30 !== null ? `VIX ÷ HV30 (${spyHv30.toFixed(1)}%)` : 'VIX ÷ 30D realized'}
          score={subScores.ivPremium}
        />
      </TileGrid>
      <SourceNote source="VIX: FRED (VIXCLS) daily · IV: TwelveData SPY" asOf={data.asOf} />
    </div>
  );
}

import { FONT_SIZE } from '@stw/shared';
import type { CreditLiquidity } from '../useCreditLiquidity';
import { StatTile, TileGrid, SourceNote } from './macroVisuals';

interface Props {
  data: CreditLiquidity | null;
  loading: boolean;
}

export function CreditLiquidityCard({ data, loading }: Props) {
  if (loading && !data) return <div style={{ color: 'var(--t3)', fontSize: FONT_SIZE.sm }}>Loading credit…</div>;
  if (!data) return <div style={{ color: 'var(--t3)', fontSize: FONT_SIZE.sm }}>Credit data unavailable.</div>;

  const { oas, oas50, belowMa50, tightening, delta5, sleeveScore } = data;
  const trendWord = belowMa50 === null ? '—' : `${belowMa50 ? 'tight vs 50D' : 'wide vs 50D'}${tightening === null ? '' : tightening ? ' · tightening' : ' · widening'}`;

  return (
    <div>
      <TileGrid>
        <StatTile
          label="HY OAS"
          value={oas !== null ? `${oas.toFixed(2)}%` : '—'}
          sub={trendWord}
          score={sleeveScore}
        />
        <StatTile
          label="vs 50D MA"
          value={oas50 !== null ? `${oas50.toFixed(2)}%` : '—'}
          sub={belowMa50 === null ? '' : belowMa50 ? 'credit confirming' : 'credit warning'}
          score={sleeveScore}
        />
        <StatTile
          label="5D Change"
          value={delta5 !== null ? `${delta5 >= 0 ? '+' : ''}${delta5.toFixed(2)}pp` : '—'}
          sub={delta5 === null ? 'spread, + = widening' : delta5 <= 0 ? 'tightening (risk-on)' : 'widening (stress)'}
          score={delta5 === null ? null : delta5 <= 0 ? 70 : 30}
        />
      </TileGrid>
      <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', marginTop: 10 }}>
        ICE BofA US High Yield option-adjusted spread — a spread widens as credit stress rises.
      </div>
      <SourceNote source="FRED daily (BAMLH0A0HYM2)" asOf={data.asOf} updatedAt={data.updatedAt} />
    </div>
  );
}

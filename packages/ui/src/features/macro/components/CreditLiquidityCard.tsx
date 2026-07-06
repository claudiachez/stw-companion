import { creditLabel } from '@stw/shared';
import type { CreditLiquidity } from '../useCreditLiquidity';
import { StatTile, SleeveSummary, TileGrid, SourceNote } from './macroVisuals';

interface Props {
  data: CreditLiquidity | null;
  loading: boolean;
}

export function CreditLiquidityCard({ data, loading }: Props) {
  if (loading && !data) return <div style={{ color: 'var(--t3)', fontSize: 12 }}>Loading credit…</div>;
  if (!data) return <div style={{ color: 'var(--t3)', fontSize: 12 }}>Credit data unavailable (needs TwelveData key).</div>;

  const { hyg, hyg50, aboveMa50, rising, delta5Pct, sleeveScore } = data;
  const trendWord = aboveMa50 === null ? '—' : `${aboveMa50 ? 'above' : 'below'} 50D${rising ? ' · rising' : ' · falling'}`;

  return (
    <div>
      <SleeveSummary score={sleeveScore} label={creditLabel(sleeveScore)} hint="HYG credit proxy" />
      <TileGrid>
        <StatTile
          label="HYG"
          value={hyg !== null ? hyg.toFixed(2) : '—'}
          sub={trendWord}
          score={sleeveScore}
        />
        <StatTile
          label="vs 50D MA"
          value={hyg50 !== null ? hyg50.toFixed(2) : '—'}
          sub={aboveMa50 === null ? '' : aboveMa50 ? 'credit confirming' : 'credit warning'}
          score={sleeveScore}
        />
        <StatTile
          label="5D Change"
          value={delta5Pct !== null ? `${delta5Pct >= 0 ? '+' : ''}${delta5Pct.toFixed(2)}%` : '—'}
          sub="short-term direction"
          score={delta5Pct === null ? null : delta5Pct >= 0 ? 70 : 30}
        />
      </TileGrid>
      <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 10 }}>
        Credit proxy via HYG — true HY OAS spread coming later.
      </div>
      <SourceNote source="TwelveData daily (HYG)" asOf={data.asOf} />
    </div>
  );
}

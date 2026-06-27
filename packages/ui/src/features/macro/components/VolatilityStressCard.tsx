import { stressLabel } from '@stw/shared';
import type { VolatilityStress } from '../useVolatilityStress';

interface Props {
  data: VolatilityStress | null;
  loading: boolean;
}

// 0–100 sub-score (higher = calmer) → color.
function scoreColor(score: number | null): string {
  if (score === null) return 'var(--t3)';
  if (score >= 60) return 'var(--c5)';
  if (score >= 40) return 'var(--c3)';
  return 'var(--c1)';
}

function StatTile({ label, value, sub, score }: { label: string; value: string; sub?: string; score: number | null }) {
  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t3)' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: scoreColor(score), marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t2)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function fmtDelta(v: number | null): string {
  if (v === null) return '';
  return `5D ${v >= 0 ? '+' : ''}${v.toFixed(1)}`;
}

export function VolatilityStressCard({ data, loading }: Props) {
  if (loading && !data) {
    return <div style={{ color: 'var(--t3)', fontSize: 12 }}>Loading volatility…</div>;
  }
  if (!data) {
    return <div style={{ color: 'var(--t3)', fontSize: 12 }}>Volatility data unavailable.</div>;
  }

  const { vix, vixPercentile, vixDelta5, vvix, ivPremium, spyHv30, subScores, sleeveScore } = data;

  return (
    <div>
      {/* Sleeve score summary */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 26, fontWeight: 700, color: scoreColor(sleeveScore) }}>{sleeveScore ?? '—'}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: scoreColor(sleeveScore) }}>{stressLabel(sleeveScore)}</span>
        <span style={{ fontSize: 11, color: 'var(--t3)' }}>higher = calmer</span>
      </div>

      {/* Responsive tile grid: multi-column on desktop, stacks on mobile */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <StatTile
          label="VIX"
          value={vix !== null ? vix.toFixed(1) : '—'}
          sub={[vixPercentile !== null ? `${vixPercentile}th pct` : '', fmtDelta(vixDelta5)].filter(Boolean).join(' · ')}
          score={subScores.vix}
        />
        <StatTile
          label="VVIX · Tail Risk"
          value={vvix !== null ? vvix.toFixed(0) : '—'}
          sub={vvix !== null ? 'vol-of-vol' : 'unavailable'}
          score={subScores.vvix}
        />
        <StatTile
          label="IV Premium"
          value={ivPremium !== null ? ivPremium.toFixed(2) : '—'}
          sub={spyHv30 !== null ? `VIX ÷ HV30 (${spyHv30.toFixed(1)}%)` : 'VIX ÷ 30D realized'}
          score={subScores.ivPremium}
        />
      </div>
    </div>
  );
}

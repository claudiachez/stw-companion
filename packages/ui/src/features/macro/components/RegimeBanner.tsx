import { fmtDateTime } from '@stw/shared';
import type { RegimeRead, RegimeLabel } from '@stw/shared';

interface Props {
  regime: RegimeRead | null;
  updatedAt: Date | null;
  /** 5D acceleration/reversal phrase (P2 trend engine) — e.g. "reversing down after failed reclaim". */
  direction?: string | null;
}

// Regime band → color. Five distinct bands; the orange (Defensive) matches the
// fear/greed palette already used by the Risk Appetite gauge in this feature.
const REGIME_COLOR: Record<RegimeLabel, string> = {
  'Risk-On':                  'var(--c5)',
  'Constructive / Selective': 'var(--c4)',
  'Cautious / Neutral':       'var(--c3)',
  'Defensive':                '#f97316',
  'Risk-Off':                 'var(--c1)',
};

export function RegimeBanner({ regime, updatedAt, direction }: Props) {
  if (!regime) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 0', marginBottom: 8 }}>
        <span style={{ fontSize: 13, color: 'var(--t3)' }}>Computing market regime…</span>
      </div>
    );
  }

  const color = REGIME_COLOR[regime.label];

  return (
    <div style={{ padding: '8px 0', marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, color }}>●</span>
          <span style={{ fontSize: 15, fontWeight: 700, color, letterSpacing: '0.03em' }}>
            {regime.label.toUpperCase()}
          </span>
          <span style={{ fontSize: 12, color: 'var(--t3)', fontWeight: 600 }}>{regime.score}</span>
          {direction && <span style={{ fontSize: 13, color: 'var(--t2)' }}>— {direction}</span>}
        </div>
        {updatedAt && (
          <div style={{ fontSize: 11, color: 'var(--t3)', whiteSpace: 'nowrap' }}>
            Updated: <span style={{ color: 'var(--t2)' }}>{fmtDateTime(updatedAt)}</span>
          </div>
        )}
      </div>
      <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 4 }}>{regime.tradingMode}</div>
    </div>
  );
}

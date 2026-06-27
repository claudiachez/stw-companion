import { fmtDateTime } from '@stw/shared';
import type { MacroRegime, MacroIndicator } from '@stw/shared';

interface Props {
  regime: MacroRegime;
  phrase: string;
  updatedAt: Date | null;
  indicators: MacroIndicator[];
}

const REGIME_COLOR: Record<MacroRegime, string> = {
  'RISK-ON':          'var(--c5)',
  'CAUTIOUS / NEUTRAL': 'var(--c3)',
  'RISK-OFF':         'var(--c1)',
  'LOADING':          'var(--t3)',
};

export function EnvironmentBanner({ regime, phrase, updatedAt, indicators }: Props) {
  if (indicators.length === 0 && regime === 'LOADING') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: 'var(--t3)' }}>Loading environment data…</div>
      </div>
    );
  }

  const color = REGIME_COLOR[regime];

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      padding: '10px 0',
      marginBottom: 12,
      flexWrap: 'wrap',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 10, color }}>●</span>
        <span style={{ fontSize: 14, fontWeight: 700, color, letterSpacing: '0.04em' }}>{regime}</span>
        {phrase && (
          <span style={{ fontSize: 13, color: 'var(--t2)' }}>— {phrase}</span>
        )}
      </div>
      {updatedAt && (
        <div style={{ fontSize: 11, color: 'var(--t3)', whiteSpace: 'nowrap' }}>
          Updated: <span style={{ color: 'var(--t2)' }}>{fmtDateTime(updatedAt)}</span>
        </div>
      )}
    </div>
  );
}

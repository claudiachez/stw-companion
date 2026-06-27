import { gexScore, gexBiasLabel, gexImplication, fmtDateTime } from '@stw/shared';
import type { GraddoxData } from '@stw/shared';
import { SleeveSummary } from './macroVisuals';

interface Props {
  graddox: GraddoxData | null | undefined;
  loading: boolean;
}

// SPX levels render on the SPY scale (÷10), matching the Signals view convention.
function spy(v: number | null | undefined): number | null {
  return v === null || v === undefined ? null : v / 10;
}

function LevelTile({ label, value }: { label: string; value: number | null }) {
  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px' }}>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t3)' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginTop: 2 }}>
        {value !== null ? value.toFixed(0) : '—'}
      </div>
    </div>
  );
}

export function GexPositioningCard({ graddox, loading }: Props) {
  if (loading && !graddox) return <div style={{ color: 'var(--t3)', fontSize: 12 }}>Loading positioning…</div>;
  if (!graddox) return <div style={{ color: 'var(--t3)', fontSize: 12 }}>No GEX signal available.</div>;

  const score = gexScore(graddox.bias);
  const label = gexBiasLabel(graddox.bias);
  const gex1 = spy(graddox.spx?.gex1);
  const resistance = spy(graddox.spx?.resistance);
  const putSupport = spy(graddox.spx?.put_support);

  const trigger = label === 'Bearish' && gex1 !== null
    ? `Reclaim above GEX1 (SPY ${gex1.toFixed(0)}) flips the read neutral.`
    : label === 'Bullish' && putSupport !== null
      ? `Hold above put support (SPY ${putSupport.toFixed(0)}) keeps the bid intact.`
      : 'Watch the GEX pivot for a regime flip.';

  return (
    <div>
      <SleeveSummary score={score} label={label} hint="tactical overlay" />

      {/* SPY-scale key levels */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
        <LevelTile label="SPY Resistance" value={resistance} />
        <LevelTile label="SPY GEX1 (pivot)" value={gex1} />
        <LevelTile label="SPY Put Support" value={putSupport} />
      </div>

      {/* Trigger + implication */}
      <div style={{ marginTop: 12, fontSize: 12, color: 'var(--t2)', lineHeight: 1.5 }}>
        <div><span style={{ color: 'var(--t3)', fontWeight: 600 }}>Trigger:</span> {trigger}</div>
        <div><span style={{ color: 'var(--t3)', fontWeight: 600 }}>Implication:</span> {gexImplication(graddox.bias)}</div>
        {graddox.bias_note && (
          <div style={{ marginTop: 4, color: 'var(--t3)' }}>{graddox.bias_note}</div>
        )}
      </div>

      <div style={{ marginTop: 10, fontSize: 10, color: 'var(--t3)', lineHeight: 1.4 }}>
        STW Graddox GEX signal{graddox.last_updated ? ` · updated ${fmtDateTime(graddox.last_updated)}` : ''}
      </div>
    </div>
  );
}

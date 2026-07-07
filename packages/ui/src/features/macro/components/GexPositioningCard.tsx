import { gexScore, gexBiasLabel, gexImplication, fmtDateTime, FONT_SIZE, FONT_WEIGHT } from '@stw/shared';
import type { GraddoxData } from '@stw/shared';
import { SleeveSummary } from './macroVisuals';

interface Props {
  graddox: GraddoxData | null | undefined;
  loading: boolean;
  /** 3D bias-score delta from the P2 trend engine (GEX moves fast, so it uses 3D not 5D); null until ~3 days of history accrue. */
  threeDayDelta?: number | null;
}

// SPX levels render on the SPY scale (÷10), matching the Signals view convention.
function spy(v: number | null | undefined): number | null {
  return v === null || v === undefined ? null : v / 10;
}

// Not KpiCard: a small dense reference tile (18px value, 8px/12px padding) inside a
// multi-tile grid, not a page-level hero stat — KpiCard's fixed 26px primaryValue would
// look oversized here relative to its own compact card chrome.
function LevelTile({ label, value }: { label: string; value: number | null }) {
  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px' }}>
      <div style={{ fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.semibold, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t3)' }}>{label}</div>
      <div style={{ fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, color: 'var(--text)', marginTop: 2 }}>
        {value !== null ? value.toFixed(0) : '—'}
      </div>
    </div>
  );
}

function LevelGroup({ name, resistance, gex1, putSupport }: { name: string; resistance: number | null; gex1: number | null; putSupport: number | null }) {
  return (
    <div>
      <div style={{ fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold, color: 'var(--t2)', margin: '0 0 6px 2px' }}>{name}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
        <LevelTile label="Resistance" value={resistance} />
        <LevelTile label="GEX1 (pivot)" value={gex1} />
        <LevelTile label="Put Support" value={putSupport} />
      </div>
    </div>
  );
}

export function GexPositioningCard({ graddox, loading, threeDayDelta }: Props) {
  if (loading && !graddox) return <div style={{ color: 'var(--t3)', fontSize: FONT_SIZE.sm }}>Loading positioning…</div>;
  if (!graddox) return <div style={{ color: 'var(--t3)', fontSize: FONT_SIZE.sm }}>No GEX signal available.</div>;

  const score = gexScore(graddox.bias);
  const label = gexBiasLabel(graddox.bias);
  const delta = threeDayDelta === null || threeDayDelta === undefined
    ? null
    : `3D ${threeDayDelta >= 0 ? '+' : ''}${Math.round(threeDayDelta)}`;
  // SPY = SPX ÷ 10; QQQ levels are already in QQQ price terms (no scaling).
  const spyGex1 = spy(graddox.spx?.gex1);
  const spyPut = spy(graddox.spx?.put_support);

  const trigger = label === 'Bearish' && spyGex1 !== null
    ? `Reclaim above GEX1 (SPY ${spyGex1.toFixed(0)}) flips the read neutral.`
    : label === 'Bullish' && spyPut !== null
      ? `Hold above put support (SPY ${spyPut.toFixed(0)}) keeps the bid intact.`
      : 'Watch the GEX pivot for a regime flip.';

  return (
    <div>
      <SleeveSummary score={score} label={label} hint="tactical overlay" delta={delta} />

      {/* Key levels — SPY (SPX ÷10) and QQQ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
        <LevelGroup name="SPY" resistance={spy(graddox.spx?.resistance)} gex1={spyGex1} putSupport={spyPut} />
        <LevelGroup name="QQQ" resistance={graddox.qqq?.resistance ?? null} gex1={graddox.qqq?.gex1 ?? null} putSupport={graddox.qqq?.put_support ?? null} />
      </div>

      {/* Trigger + implication */}
      <div style={{ marginTop: 12, fontSize: FONT_SIZE.sm, color: 'var(--t2)', lineHeight: 1.5 }}>
        <div><span style={{ color: 'var(--t3)', fontWeight: FONT_WEIGHT.semibold }}>Trigger:</span> {trigger}</div>
        <div><span style={{ color: 'var(--t3)', fontWeight: FONT_WEIGHT.semibold }}>Implication:</span> {gexImplication(graddox.bias)}</div>
        {graddox.bias_note && (
          <div style={{ marginTop: 4, color: 'var(--t3)' }}>{graddox.bias_note}</div>
        )}
      </div>

      <div style={{ marginTop: 10, fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', lineHeight: 1.4 }}>
        STW Graddox GEX signal{graddox.last_updated ? ` · updated ${fmtDateTime(graddox.last_updated)}` : ''}
      </div>
    </div>
  );
}

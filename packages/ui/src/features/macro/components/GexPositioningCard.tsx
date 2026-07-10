import {
  gexSleeveScore, gexPositioningLabel, gexPositioningImplication, fmtDateTime, FONT_SIZE, FONT_WEIGHT,
} from '@stw/shared';
import type { GexExposureRead } from '../useGexExposure';
import { SleeveSummary } from './macroVisuals';

interface Props {
  data: GexExposureRead | null;
  loading: boolean;
  /** 3D sleeve-score delta from the P2 trend engine (GEX moves fast → 3D not 5D); null until history accrues. */
  threeDayDelta?: number | null;
}

// A dense reference tile (not KpiCard — this sits in a compact multi-tile grid).
function LevelTile({ label, value, hint }: { label: string; value: number | null; hint?: string }) {
  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px' }}>
      <div style={{ fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.semibold, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t3)' }}>{label}</div>
      <div style={{ fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, color: 'var(--text)', marginTop: 2 }}>
        {value !== null ? value.toFixed(2) : '—'}
      </div>
      {hint && <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', marginTop: 1 }}>{hint}</div>}
    </div>
  );
}

/** Compact aggregate-GEX label, e.g. "+$2.85B (positive γ)". */
function netGexText(netGex: number | null, label: string | null): string {
  if (netGex === null) return '—';
  const sign = netGex >= 0 ? '+' : '−';
  const abs = Math.abs(netGex);
  const mag = abs >= 1e9 ? `$${(abs / 1e9).toFixed(2)}B` : abs >= 1e6 ? `$${(abs / 1e6).toFixed(0)}M` : `$${abs.toFixed(0)}`;
  return `${sign}${mag}${label ? ` (${label} γ)` : ''}`;
}

export function GexPositioningCard({ data, loading, threeDayDelta }: Props) {
  if (loading && !data) return <div style={{ color: 'var(--t3)', fontSize: FONT_SIZE.sm }}>Loading positioning…</div>;
  if (!data) return <div style={{ color: 'var(--t3)', fontSize: FONT_SIZE.sm }}>No GEX snapshot available yet.</div>;

  const score = gexSleeveScore(data.spot, data.gammaFlip);
  const label = gexPositioningLabel({ spot: data.spot, gammaFlip: data.gammaFlip });
  const implication = gexPositioningImplication({ spot: data.spot, gammaFlip: data.gammaFlip });
  const delta = threeDayDelta === null || threeDayDelta === undefined
    ? null
    : `3D ${threeDayDelta >= 0 ? '+' : ''}${Math.round(threeDayDelta)}`;

  // Cushion above/below the flip — the number that decides the positioning read.
  const cushion = data.spot !== null && data.gammaFlip !== null ? data.spot - data.gammaFlip : null;
  const cushionHint = cushion === null ? undefined : `${cushion >= 0 ? '+' : ''}${cushion.toFixed(2)} vs spot`;

  return (
    <div>
      <SleeveSummary score={score} label={label} hint="SPY · tactical overlay" delta={delta} />

      {/* Key levels — SPY (free tier is SPY-only; a paid key adds SPX) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
        <LevelTile label="Spot" value={data.spot} />
        <LevelTile label="Gamma Flip" value={data.gammaFlip} hint={cushionHint} />
        <LevelTile label="Call Wall" value={data.callWall} hint="upside magnet" />
        <LevelTile label="Put Wall" value={data.putWall} hint="downside support" />
      </div>

      <div style={{ marginTop: 12, fontSize: FONT_SIZE.sm, color: 'var(--t2)', lineHeight: 1.5 }}>
        <div><span style={{ color: 'var(--t3)', fontWeight: FONT_WEIGHT.semibold }}>Net GEX:</span> {netGexText(data.netGex, data.netGexLabel)}</div>
        <div><span style={{ color: 'var(--t3)', fontWeight: FONT_WEIGHT.semibold }}>Read:</span> {implication}</div>
      </div>

      <div style={{ marginTop: 10, fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', lineHeight: 1.4 }}>
        Source: FlashAlpha · SPY (index proxy){data.asOf ? ` · Updated: ${fmtDateTime(data.asOf)}` : ''}
      </div>
    </div>
  );
}

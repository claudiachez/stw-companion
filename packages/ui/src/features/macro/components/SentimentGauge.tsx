import { GaugeComponent } from 'react-gauge-component';
import type { SentimentScore } from '@stw/shared';
import { FONT_SIZE, FONT_WEIGHT } from '@stw/shared';

interface Props {
  score: SentimentScore | null;
  loading: boolean;
  /** 5D delta on the total risk-appetite score (P2 trend engine); null until ~5 days of history accrue. */
  fiveDayDelta?: number | null;
}

interface Zone { label: string; short: string; color: string; limit: number }

// 0 = extreme fear … 100 = extreme greed. `limit` is this zone's upper score bound — the
// single source both zoneFor() and the gauge's own arc.subArcs config read from, so the
// same 5 colors are never hardcoded twice (they used to be, independently, in both places).
const ZONES: Zone[] = [
  { label: 'Extreme Fear', short: 'Ext. Fear',  color: 'var(--c1)',               limit: 25 },
  { label: 'Fear',         short: 'Fear',       color: 'var(--status-elevated)',  limit: 45 },
  { label: 'Neutral',      short: 'Neutral',    color: 'var(--c2l)',              limit: 55 },
  { label: 'Greed',        short: 'Greed',      color: 'var(--sentiment-greed)',  limit: 75 },
  { label: 'Extreme Greed', short: 'Ext. Greed', color: 'var(--c5)',             limit: 100 },
];

function zoneFor(s: number): Zone {
  return ZONES.find((z) => s < z.limit) ?? ZONES[ZONES.length - 1];
}

function MiniBar({ score }: { score: number | null }) {
  if (score === null) return <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3 }} />;
  const z = zoneFor(score);
  return (
    <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ width: `${score}%`, height: '100%', background: z.color, borderRadius: 3, transition: 'width 0.4s' }} />
    </div>
  );
}

export function SentimentGauge({ score, loading, fiveDayDelta }: Props) {
  if (loading && !score) {
    return <div style={{ color: 'var(--t3)', fontSize: FONT_SIZE.sm, padding: '16px 0' }}>Computing risk appetite…</div>;
  }
  if (!score) return <div style={{ color: 'var(--t3)', fontSize: FONT_SIZE.sm }}>Risk-appetite data unavailable.</div>;

  const total = score.total;
  const z = total !== null ? zoneFor(total) : null;
  const deltaText = fiveDayDelta === null || fiveDayDelta === undefined
    ? null
    : `5D ${fiveDayDelta >= 0 ? '+' : ''}${Math.round(fiveDayDelta)}`;

  return (
    // Two columns on desktop (gauge ┃ breakdown), stacks on mobile — fills the width.
    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>

      {/* Gauge — pinned in a fixed-height, clipped box so the library's re-render
          on scroll/resize can't reflow the page or leave an empty block. */}
      <div style={{ flex: '1 1 260px', minWidth: 240, maxWidth: 340, margin: '0 auto' }}>
        {total !== null && z ? (
          <>
            <div style={{ height: 168, overflow: 'hidden' }}>
              <GaugeComponent
                type="semicircle"
                value={total}
                minValue={0}
                maxValue={100}
                marginInPercent={{ top: 0.04, bottom: 0.0, left: 0.05, right: 0.05 }}
                arc={{
                  width: 0.22,
                  padding: 0.008,
                  cornerRadius: 2,
                  // Derived from the same ZONES list zoneFor() reads — these 5 colors used to
                  // be hardcoded a second time here, independently of zoneFor's own copy.
                  subArcs: ZONES.map((zone) => ({ limit: zone.limit, color: zone.color })),
                }}
                pointer={{ type: 'needle', color: 'var(--c2)', width: 12, length: 0.72, elastic: true }}
                labels={{
                  valueLabel: { formatTextValue: (v) => `${Math.round(v)}`, style: { fill: z.color, fontSize: '34px', textShadow: 'none' } },
                  tickLabels: {
                    type: 'outer',
                    defaultTickValueConfig: { style: { fill: 'var(--c2l)', fontSize: '8px' } },
                    ticks: [{ value: 25 }, { value: 50 }, { value: 75 }],
                  },
                }}
              />
            </div>
            <div style={{ textAlign: 'center', marginTop: 6 }}>
              <div style={{ fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, color: z.color }}>
                {z.label}{deltaText ? ` · ${deltaText}` : ''}
              </div>
              <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)' }}>Risk appetite · 0 = fear, 100 = greed</div>
            </div>
          </>
        ) : (
          <div style={{ color: 'var(--t3)', fontSize: FONT_SIZE.sm, textAlign: 'center' }}>Not enough data to score.</div>
        )}
      </div>

      {/* Component breakdown */}
      <div style={{ flex: '2 1 300px', minWidth: 260 }}>
        <div style={{ fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.semibold, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 8 }}>
          What's driving it (0 = fear · 100 = greed)
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {score.inputs.map((inp) => {
            const iz = inp.score !== null ? zoneFor(inp.score) : null;
            return (
              <div key={inp.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ minWidth: 120, fontSize: FONT_SIZE.sm, color: 'var(--t2)' }}>{inp.label}</div>
                <MiniBar score={inp.score} />
                <div style={{ minWidth: 86, fontSize: FONT_SIZE.sm, textAlign: 'right', color: iz ? iz.color : 'var(--t3)' }}>
                  {inp.score !== null ? `${Math.round(inp.score)} · ${iz!.short}` : '—'}
                </div>
                <div style={{ minWidth: 30, fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', textAlign: 'right' }}>
                  {Math.round(inp.weight * 100)}%
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 12, fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', lineHeight: 1.4 }}>
          Source: Finnhub (VIX/VVIX) + TwelveData (SPY/RSP/HYG daily) + STW Graddox (GEX). Live quotes ≤15m; daily metrics refresh once per session.
        </div>
      </div>
    </div>
  );
}

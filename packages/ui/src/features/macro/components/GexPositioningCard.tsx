import {
  gexSleeveScore, gexPositioningLabel, gexPositioningImplication, fmtDateTime, FONT_SIZE, FONT_WEIGHT,
} from '@stw/shared';
import type { GexExposureRead } from '../useGexExposure';
import { useLiveSpxSpot } from '../useLiveSpxSpot';
import { SleeveSummary } from './macroVisuals';

interface Props {
  data: GexExposureRead | null;
  loading: boolean;
  /** 3D sleeve-score delta from the P2 trend engine (GEX moves fast → 3D not 5D); null until history accrues. */
  threeDayDelta?: number | null;
}

/** Price format: thousands comma, and no decimals when the value is whole
 *  (7527.00 → "7,527"; 7543.64 → "7,543.64"). */
function fmtLevel(v: number): string {
  return Number.isInteger(v)
    ? v.toLocaleString('en-US')
    : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Signed aggregate-GEX value, e.g. "+101,111" (the newsletter's index-scaled
 *  units, not dollars). Polarity already lives in the "Positive/Negative γ" label. */
function netGexRaw(netGex: number | null): string | null {
  if (netGex === null) return null;
  return `${netGex >= 0 ? '+' : '−'}${Math.abs(netGex).toLocaleString('en-US')}`;
}

/** Compact intraday time tag, e.g. "@ 9:40 AM ET" (allowed non-fmtDateTime tag). */
function timeTag(ms: number): string {
  return '@ ' + new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET';
}

// Horizontal price track (number line) — plots the levels at their true relative
// positions so you SEE where spot sits between support (put wall, left/green) and
// resistance (call wall, right/red), with the gamma flip (amber) as the pivot. The
// live Spot is the prominent marker above the line; the walls + flip label below.
function PriceTrack({ callWall, spot, gammaFlip, putWall, spotSub }: {
  callWall: number | null; spot: number | null; gammaFlip: number | null; putWall: number | null; spotSub?: string;
}) {
  const vals = [callWall, spot, gammaFlip, putWall].filter((v): v is number => v != null);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const pad = (hi - lo) * 0.08 || 1; // breathing room so edge markers aren't flush
  const dmin = lo - pad;
  const span = (hi + pad) - dmin || 1;
  const pos = (v: number) => ((v - dmin) / span) * 100;
  // Keep edge labels from overflowing the card.
  const tx = (pct: number) => (pct < 14 ? '0%' : pct > 86 ? '-100%' : '-50%');

  const refs = ([
    callWall != null ? { price: callWall, label: 'Call Wall', color: 'var(--c1)' } : null,
    gammaFlip != null ? { price: gammaFlip, label: 'Gamma Flip', color: 'var(--c3)' } : null,
    putWall != null ? { price: putWall, label: 'Put Wall', color: 'var(--c5)' } : null,
  ].filter(Boolean) as { price: number; label: string; color: string }[]);

  return (
    <div style={{ margin: '16px 0 4px' }}>
      {/* Spot marker (above the line) */}
      <div style={{ position: 'relative', height: 32 }}>
        {spot != null && (
          <div style={{ position: 'absolute', left: `${pos(spot)}%`, transform: `translateX(${tx(pos(spot))})`, textAlign: 'center', whiteSpace: 'nowrap', lineHeight: 1.1 }}>
            <span style={{ fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>Spot {fmtLevel(spot)}</span>
            <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--text)' }}>▼</div>
          </div>
        )}
      </div>
      {/* Track: green (support) → amber (pivot) → red (resistance) */}
      <div style={{ position: 'relative', height: 8, borderRadius: 4, background: 'linear-gradient(90deg, color-mix(in srgb, var(--c5) 45%, transparent), color-mix(in srgb, var(--c3) 45%, transparent), color-mix(in srgb, var(--c1) 45%, transparent))' }}>
        {refs.map((r) => (
          <div key={r.label} style={{ position: 'absolute', left: `${pos(r.price)}%`, top: -2, bottom: -2, width: 2, transform: 'translateX(-1px)', background: r.color }} title={`${r.label} ${fmtLevel(r.price)}`} />
        ))}
        {spot != null && <div style={{ position: 'absolute', left: `${pos(spot)}%`, top: -3, bottom: -3, width: 2, transform: 'translateX(-1px)', background: 'var(--text)' }} />}
      </div>
      {/* Wall/flip labels (below the line) */}
      <div style={{ position: 'relative', height: 34, marginTop: 5 }}>
        {refs.map((r) => {
          const pct = pos(r.price);
          return (
            <div key={r.label} style={{ position: 'absolute', left: `${pct}%`, transform: `translateX(${tx(pct)})`, textAlign: 'center', whiteSpace: 'nowrap', lineHeight: 1.15 }}>
              <div style={{ fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, color: r.color, fontVariantNumeric: 'tabular-nums' }}>{fmtLevel(r.price)}</div>
              <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)' }}>{r.label}</div>
            </div>
          );
        })}
      </div>
      {spotSub && <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t2)', textAlign: 'center', marginTop: 2 }}>{spotSub}</div>}
    </div>
  );
}

export function GexPositioningCard({ data, loading, threeDayDelta }: Props) {
  const live = useLiveSpxSpot();

  if (loading && !data) return <div style={{ color: 'var(--t3)', fontSize: FONT_SIZE.sm }}>Loading positioning…</div>;
  if (!data) return <div style={{ color: 'var(--t3)', fontSize: FONT_SIZE.sm }}>No GEX snapshot available yet.</div>;

  // The sleeve score / label stay on the report spot — they're the regime-sleeve
  // contribution (matching the persisted composite score + the 3D delta), not a
  // live-drifting number. The track's Spot is the LIVE quote (host ask).
  const spot = live?.spx ?? data.spot;
  const liveTag = live ? `live ${timeTag(live.at)}` : data.asOf ? 'as of report' : null;

  const score = gexSleeveScore(data.spot, data.gammaFlip);
  const label = gexPositioningLabel({ spot: data.spot, gammaFlip: data.gammaFlip });
  const implication = gexPositioningImplication({ spot: data.spot, gammaFlip: data.gammaFlip });
  const delta = threeDayDelta === null || threeDayDelta === undefined
    ? null
    : `3D ${threeDayDelta >= 0 ? '+' : ''}${Math.round(threeDayDelta)}`;

  // Cushion phrased from SPOT's perspective (spot is N above/below the flip).
  const cushion = spot !== null && data.gammaFlip !== null ? spot - data.gammaFlip : null;
  const cushionText = cushion === null ? null
    : cushion >= 0 ? `+${fmtLevel(cushion)} above flip` : `${fmtLevel(Math.abs(cushion))} below flip`;
  const spotSub = [cushionText, liveTag].filter(Boolean).join(' · ') || undefined;

  const raw = netGexRaw(data.netGex);
  const hint = raw ? `net GEX ${raw}` : 'SPX · tactical overlay';

  return (
    <div>
      <SleeveSummary score={score} label={label} hint={hint} delta={delta} />

      <PriceTrack callWall={data.callWall} spot={spot} gammaFlip={data.gammaFlip} putWall={data.putWall} spotSub={spotSub} />

      <div style={{ marginTop: 12, fontSize: FONT_SIZE.sm, color: 'var(--t2)', lineHeight: 1.5 }}>
        <div><span style={{ color: 'var(--t3)', fontWeight: FONT_WEIGHT.semibold }}>Read:</span> {implication}</div>
      </div>

      <div style={{ marginTop: 10, fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', lineHeight: 1.4 }}>
        Levels via <a href="https://spxgammaedge.substack.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--t3)', textDecoration: 'underline' }}>SPX Gamma Edge</a> · SPX{data.asOf ? ` · Updated: ${fmtDateTime(data.asOf)}` : ''}
      </div>
    </div>
  );
}

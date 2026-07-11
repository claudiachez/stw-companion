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

/** Aggregate-GEX label, e.g. "+101,111 (positive γ)". The SPX Gamma Edge figure
 *  is a signed index-scaled aggregate (the newsletter's own units), not dollars. */
function netGexText(netGex: number | null, label: string | null): string {
  if (netGex === null) return '—';
  const sign = netGex >= 0 ? '+' : '−';
  return `${sign}${Math.abs(netGex).toLocaleString('en-US')}${label ? ` (${label} γ)` : ''}`;
}

/** Compact intraday time tag, e.g. "@ 9:40 AM ET" (allowed non-fmtDateTime tag). */
function timeTag(ms: number): string {
  return '@ ' + new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET';
}

interface LadderRow { price: number; label: string; sub?: string; color: string }

// Price-sorted level ladder (high → low), styled like the Market Internals rows:
// flat rows (no nested box, no icons), the color-code carried by the PRICE itself
// — call wall red (resistance overhead), put wall green (support below), gamma
// flip amber (the pivot), spot neutral-bold (where we are now). So spot's position
// between the walls + flip reads at a glance.
function LevelLadder({ rows }: { rows: LadderRow[] }) {
  return (
    <div style={{ marginTop: 10 }}>
      {rows.map((r, i) => (
        <div
          key={r.label}
          style={{
            display: 'flex', alignItems: 'baseline', gap: 10, padding: '9px 0', flexWrap: 'wrap',
            borderBottom: i < rows.length - 1 ? '1px solid var(--bsub)' : 'none',
          }}
        >
          <span style={{
            fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-0.01em', color: r.color, minWidth: 82, flexShrink: 0, textAlign: 'right',
          }}>
            {fmtLevel(r.price)}
          </span>
          <span style={{ fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold, color: 'var(--text)' }}>{r.label}</span>
          {r.sub && <span style={{ fontSize: FONT_SIZE.xs, color: 'var(--t2)', marginLeft: 'auto', textAlign: 'right' }}>{r.sub}</span>}
        </div>
      ))}
    </div>
  );
}

export function GexPositioningCard({ data, loading, threeDayDelta }: Props) {
  const live = useLiveSpxSpot();

  if (loading && !data) return <div style={{ color: 'var(--t3)', fontSize: FONT_SIZE.sm }}>Loading positioning…</div>;
  if (!data) return <div style={{ color: 'var(--t3)', fontSize: FONT_SIZE.sm }}>No GEX snapshot available yet.</div>;

  // The sleeve score / label stay on the report spot — they're the regime-sleeve
  // contribution (matching the persisted composite score + the 3D delta), not a
  // live-drifting number. The ladder's Spot row is the LIVE quote (host ask).
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

  // High → low so the call wall sits on top and the put wall at the bottom; spot
  // slots into its live position between them. Price color encodes the level type.
  const rows: LadderRow[] = ([
    data.callWall !== null ? { price: data.callWall, label: 'Call Wall', sub: 'upside magnet', color: 'var(--c1)' } : null,
    spot !== null ? { price: spot, label: 'Spot', sub: spotSub, color: 'var(--text)' } : null,
    data.gammaFlip !== null ? { price: data.gammaFlip, label: 'Gamma Flip', sub: 'positive/negative-γ pivot', color: 'var(--c3)' } : null,
    data.putWall !== null ? { price: data.putWall, label: 'Put Wall', sub: 'downside support', color: 'var(--c5)' } : null,
  ].filter(Boolean) as LadderRow[]).sort((a, b) => b.price - a.price);

  return (
    <div>
      <SleeveSummary score={score} label={label} hint="SPX · tactical overlay" delta={delta} />

      <LevelLadder rows={rows} />

      <div style={{ marginTop: 12, fontSize: FONT_SIZE.sm, color: 'var(--t2)', lineHeight: 1.5 }}>
        <div><span style={{ color: 'var(--t3)', fontWeight: FONT_WEIGHT.semibold }}>Aggregate GEX:</span> {netGexText(data.netGex, data.netGexLabel)}</div>
        <div><span style={{ color: 'var(--t3)', fontWeight: FONT_WEIGHT.semibold }}>Read:</span> {implication}</div>
      </div>

      <div style={{ marginTop: 10, fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', lineHeight: 1.4 }}>
        Levels via <a href="https://spxgammaedge.substack.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--t3)', textDecoration: 'underline' }}>SPX Gamma Edge</a> · SPX{data.asOf ? ` · Updated: ${fmtDateTime(data.asOf)}` : ''}
      </div>
    </div>
  );
}

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

interface LadderRow { icon: string; price: number; label: string; sub?: string; current?: boolean }

// A price-sorted level ladder (high → low), so spot's position between the call
// wall, gamma flip and put wall reads at a glance — the same shape as the Signals
// page level ladder. Spot is live (Finnhub SPY × 10); the walls + flip are the
// newsletter's structural read.
function LevelLadder({ rows }: { rows: LadderRow[] }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      {rows.map((r, i) => (
        <div
          key={r.label}
          style={{
            display: 'flex', alignItems: 'center', gap: 9, padding: '8px 13px',
            borderBottom: i === rows.length - 1 ? undefined : '1px solid var(--bsub)',
            background: r.current ? 'var(--c5bg)' : undefined,
          }}
        >
          <span style={{ fontSize: FONT_SIZE.sm, flexShrink: 0, width: 16, textAlign: 'center' }}>{r.icon}</span>
          <span style={{
            fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold, fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-0.01em', minWidth: 62, color: r.current ? 'var(--c5l)' : 'var(--text)',
          }}>
            {fmtLevel(r.price)}
          </span>
          <span style={{ fontSize: FONT_SIZE.xs, color: 'var(--t2)', flex: 1, lineHeight: 1.35 }}>
            {r.label}
            {r.sub ? <><br /><span style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)' }}>{r.sub}</span></> : null}
          </span>
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
  const spotSub = live ? `live ${timeTag(live.at)}` : data.asOf ? 'as of report' : undefined;

  const score = gexSleeveScore(data.spot, data.gammaFlip);
  const label = gexPositioningLabel({ spot: data.spot, gammaFlip: data.gammaFlip });
  const implication = gexPositioningImplication({ spot: data.spot, gammaFlip: data.gammaFlip });
  const delta = threeDayDelta === null || threeDayDelta === undefined
    ? null
    : `3D ${threeDayDelta >= 0 ? '+' : ''}${Math.round(threeDayDelta)}`;

  // Cushion annotates the gamma-flip row against the live spot shown in the ladder.
  const cushion = spot !== null && data.gammaFlip !== null ? spot - data.gammaFlip : null;
  const cushionHint = cushion === null ? undefined : `${cushion >= 0 ? '+' : '−'}${fmtLevel(Math.abs(cushion))} vs spot`;

  // High → low so the call wall sits on top and the put wall at the bottom; spot
  // slots into its live position between them.
  const rows: LadderRow[] = ([
    data.callWall !== null ? { icon: '🔴', price: data.callWall, label: 'Call Wall', sub: 'upside magnet' } : null,
    spot !== null ? { icon: '💲', price: spot, label: 'Spot', sub: spotSub, current: true } : null,
    data.gammaFlip !== null ? { icon: '🟡', price: data.gammaFlip, label: 'Gamma Flip', sub: cushionHint } : null,
    data.putWall !== null ? { icon: '🟢', price: data.putWall, label: 'Put Wall', sub: 'downside support' } : null,
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

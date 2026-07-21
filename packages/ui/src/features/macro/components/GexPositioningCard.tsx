import {
  gexSleeveScore, gexPositioningImplication, fmtDateTime, FONT_SIZE, FONT_WEIGHT,
} from '@stw/shared';
import type { GexExposureRead } from '../useGexExposure';
import { useLiveSpxSpot } from '../useLiveSpxSpot';
import { Card, CardHeader, HelpPanel } from './macroVisuals';

interface Props {
  data: GexExposureRead | null;
  loading: boolean;
  helpOpen: boolean;
  onToggleHelp: () => void;
  help: React.ReactNode;
}

/** Thousands comma, no decimals when whole (7527.00 → "7,527"; 7543.64 → "7,543.64"). */
function fmtLevel(v: number): string {
  return Number.isInteger(v)
    ? v.toLocaleString('en-US')
    : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// "Dealer positioning (GEX)" — a one-sentence read plus a 14px level bar showing
// where live SPX sits between the put wall (floor), gamma flip (pivot) and call wall
// (ceiling), each a hover-tipped marker with a label below. Levels + scoring come
// straight from useGexExposure / the shared GEX scorers — nothing re-derived here.
export function GexPositioningCard({ data, loading, helpOpen, onToggleHelp, help }: Props) {
  const live = useLiveSpxSpot();

  if (loading && !data) {
    return (
      <Card style={{ display: 'flex', flexDirection: 'column' }}>
        <CardHeader title="Dealer positioning (GEX)" helpOpen={helpOpen} onToggleHelp={onToggleHelp} />
        {helpOpen && <HelpPanel>{help}</HelpPanel>}
        <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t3)', marginTop: 6 }}>Loading positioning…</div>
      </Card>
    );
  }
  if (!data) {
    return (
      <Card style={{ display: 'flex', flexDirection: 'column' }}>
        <CardHeader title="Dealer positioning (GEX)" helpOpen={helpOpen} onToggleHelp={onToggleHelp} />
        {helpOpen && <HelpPanel>{help}</HelpPanel>}
        <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t3)', marginTop: 6 }}>No GEX snapshot available yet.</div>
      </Card>
    );
  }

  const spot = live?.spx ?? data.spot;
  const flip = data.gammaFlip;
  const implication = gexPositioningImplication({ spot: data.spot, gammaFlip: data.gammaFlip });
  void gexSleeveScore; // sleeve score surfaced in the driver strip, not on this card

  // Position markers on a padded min→max scale (same math as the report track).
  const vals = [data.callWall, spot, flip, data.putWall].filter((v): v is number => v != null);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const pad = (hi - lo) * 0.08 || 1;
  const dmin = lo - pad;
  const span = (hi + pad) - dmin || 1;
  const pos = (v: number) => ((v - dmin) / span) * 100;

  const cushion = spot != null && flip != null ? spot - flip : null;
  const sentence = spot != null && flip != null
    ? <>SPX <b style={{ color: 'var(--text)' }}>{fmtLevel(spot)}</b> is <b style={{ color: (cushion ?? 0) >= 0 ? 'var(--status-positive-text)' : 'var(--status-negative-text)' }}>{(cushion ?? 0) >= 0 ? `above the gamma flip (${fmtLevel(flip)})` : `below the gamma flip (${fmtLevel(flip)})`}</b> — {implication}</>
    : <>{implication}</>;

  const flipPct = flip != null ? pos(flip) : 50;

  const markers: { price: number; color: string; label: string; tip: string; tall?: boolean }[] = [];
  if (data.putWall != null) markers.push({ price: data.putWall, color: 'var(--status-positive-text)', label: `Put ${fmtLevel(data.putWall)}`, tip: `Put wall ${fmtLevel(data.putWall)} — the floor` });
  if (flip != null) markers.push({ price: flip, color: 'var(--status-warning-text)', label: `Flip ${fmtLevel(flip)}`, tip: `Gamma flip ${fmtLevel(flip)} — behavior flips below` });
  if (data.callWall != null) markers.push({ price: data.callWall, color: 'var(--status-negative-text)', label: `Call ${fmtLevel(data.callWall)}`, tip: `Call wall ${fmtLevel(data.callWall)} — the ceiling` });

  return (
    <Card style={{ display: 'flex', flexDirection: 'column' }}>
      <CardHeader title="Dealer positioning (GEX)" helpOpen={helpOpen} onToggleHelp={onToggleHelp} />
      {helpOpen && <HelpPanel>{help}</HelpPanel>}

      <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t2)', lineHeight: 1.55, marginTop: 6 }}>{sentence}</div>

      {/* 14px level bar: negative-gamma tint left of the flip, positive-gamma tint right. */}
      <div style={{
        position: 'relative', height: 14, borderRadius: 7, marginTop: 10,
        background: `linear-gradient(90deg, var(--status-negative-bg) 0 ${flipPct}%, var(--status-positive-bg) ${flipPct}% 100%)`,
      }}>
        {markers.map((m) => (
          <span key={m.label} title={m.tip} style={{ position: 'absolute', left: `${pos(m.price)}%`, top: -4, width: 3, height: 22, background: m.color, borderRadius: 2, transform: 'translateX(-1px)', cursor: 'help' }} />
        ))}
        {spot != null && (
          <span title={`SPX now — ${fmtLevel(spot)}`} style={{ position: 'absolute', left: `${pos(spot)}%`, top: -6, width: 3, height: 26, background: 'var(--text)', borderRadius: 2, transform: 'translateX(-1px)', cursor: 'help' }} />
        )}
      </div>
      {/* Marker labels below the bar. */}
      <div style={{ position: 'relative', height: 14, marginTop: 4 }}>
        {markers.map((m) => (
          <span key={m.label} style={{
            position: 'absolute', left: `${pos(m.price)}%`, transform: 'translateX(-50%)', whiteSpace: 'nowrap',
            fontSize: FONT_SIZE['3xs'], fontWeight: FONT_WEIGHT.bold, letterSpacing: '0.05em', textTransform: 'uppercase', color: m.color,
          }}>{m.label}</span>
        ))}
      </div>

      <div style={{ marginTop: 'auto', paddingTop: 8, fontSize: FONT_SIZE['2xs'], color: 'var(--t3)' }}>
        Source: <a href="https://spxgammaedge.substack.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--t3)', textDecoration: 'underline' }}>SPX Gamma Edge</a> · SPX{data.asOf ? ` · ${fmtDateTime(data.asOf)}` : ''}
      </div>
    </Card>
  );
}

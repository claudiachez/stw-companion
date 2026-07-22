import { fmtDateTime, formatDate, isTradingDay, lastTradingDay, FONT_SIZE, FONT_WEIGHT } from '@stw/shared';
import type { RegimeRead, RegimeLabel } from '@stw/shared';
import type { RegimeSeriesPoint } from '../useMacroTrendHistory';
import { RegimeTrajectory } from './RegimeTrajectory';
import { Card, HelpPanel, InfoButton } from './macroVisuals';

interface Props {
  regime: RegimeRead | null;
  updatedAt: Date | null;
  /** Per-day regime scores (oldest → newest) — drives the trend chip + trajectory. */
  series: RegimeSeriesPoint[];
  helpOpen: boolean;
  onToggleHelp: () => void;
  help: React.ReactNode;
}

// Pill treatment per regime band: bg + border + text, so the verdict reads as a
// filled status pill (not bare colored text). Defensive is the "elevated" orange —
// it has no bg/border token pair, so it's mixed from the base color.
const PILL: Record<RegimeLabel, { bg: string; border: string; text: string }> = {
  'Risk-On':                  { bg: 'var(--status-positive-bg)', border: 'var(--status-positive-border)', text: 'var(--status-positive-text)' },
  'Constructive / Selective': { bg: 'var(--status-info-bg)',     border: 'var(--status-info-border)',     text: 'var(--status-info-text)' },
  'Cautious / Neutral':       { bg: 'var(--status-warning-bg)',  border: 'var(--status-warning-border)',  text: 'var(--status-warning-text)' },
  'Defensive':                { bg: 'color-mix(in srgb, var(--status-elevated) 14%, transparent)', border: 'color-mix(in srgb, var(--status-elevated) 40%, transparent)', text: 'var(--status-elevated)' },
  'Risk-Off':                 { bg: 'var(--status-negative-bg)', border: 'var(--status-negative-border)', text: 'var(--status-negative-text)' },
};

/** Latest scored session − the prior scored session (the series holds only actual
 *  trading days), so on a weekend/holiday this is Friday vs Thursday, not "today". */
function deltaVsPriorSession(series: RegimeSeriesPoint[]): number | null {
  const scored = series.filter((p) => p.score !== null);
  if (scored.length < 2) return null;
  return (scored[scored.length - 1].score as number) - (scored[scored.length - 2].score as number);
}

// The regime verdict banner: a filled status pill (label + 0–100 score), a
// Δ-vs-prior-session chip, the 9-day history dots (right-aligned), a one-line
// action-guidance sentence, and a source + freshness stamp — with the single-open
// ⓘ explainer between the header row and the guidance line.
export function RegimeCard({ regime, updatedAt, series, helpOpen, onToggleHelp, help }: Props) {
  if (!regime) {
    return (
      <Card style={{ padding: '14px 16px' }}>
        <span style={{ fontSize: FONT_SIZE.base, color: 'var(--t3)' }}>Computing market regime…</span>
      </Card>
    );
  }

  const pill = PILL[regime.label];
  const delta = deltaVsPriorSession(series);
  const n = delta === null ? null : Math.round(delta);
  const chipArrow = n === null ? '' : n > 0 ? '▲ ' : n < 0 ? '▼ ' : '';
  const chipColor = n === null || n === 0 ? 'var(--t3)' : n > 0 ? 'var(--status-positive-text)' : 'var(--status-negative-text)';
  const chipText = n === null ? '— vs prior session' : `${chipArrow}${n >= 0 ? '+' : ''}${n} vs prior session`;

  // On a non-trading day the read reflects the last close, not "now".
  const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const marketOpen = isTradingDay(todayET);
  const stamp = updatedAt
    ? marketOpen ? `Updated ${fmtDateTime(updatedAt)}` : `as of ${formatDate(lastTradingDay(todayET))} · market closed`
    : null;

  return (
    <Card style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 12px', borderRadius: 999,
          background: pill.bg, border: `1px solid ${pill.border}`, color: pill.text,
          fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, letterSpacing: '0.03em',
        }}>
          ● {regime.label.toUpperCase()} · {regime.score}
        </span>
        <span style={{
          display: 'inline-flex', alignItems: 'center', fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold,
          color: chipColor, background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 999, padding: '2px 9px',
        }}>
          {chipText}
        </span>
        <InfoButton open={helpOpen} onClick={onToggleHelp} />
        <span style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
          <span style={{ fontSize: FONT_SIZE['3xs'], fontWeight: FONT_WEIGHT.bold, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t3)' }}>Last 9 days</span>
          <RegimeTrajectory series={series} days={9} />
        </span>
      </div>

      <div style={{ fontSize: FONT_SIZE.sms, color: 'var(--text)', fontWeight: FONT_WEIGHT.semibold, marginTop: 8 }}>{regime.tradingMode}</div>

      {helpOpen && <HelpPanel>{help}</HelpPanel>}

      <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', marginTop: 2 }}>
        {stamp ? `${stamp} · ` : ''}refreshes daily after the close
      </div>
    </Card>
  );
}

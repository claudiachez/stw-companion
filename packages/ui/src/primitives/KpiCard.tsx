import { FONT_SIZE, FONT_WEIGHT, LETTER_SPACING, NUMERIC_STYLE, RADIUS, SPACE } from '@stw/shared';
import { Icon, type IconName } from './Icon';

// Phase 3 core component (plans/stw-design-system.md §3.3). One layout rule for
// primary/secondary value placement, applied always — generalizes the stat-card pattern
// already used ad hoc in PortfolioDashboard.tsx (Active Holdings / Avg Return /
// Equity:Options), which the audit flagged for inconsistent placement elsewhere
// (docs/design-system/audit/02-component-duplication-report.md).
export type KpiDeltaDirection = 'up' | 'down' | 'flat';
export type KpiStatus = 'positive' | 'negative' | 'neutral';

export interface KpiCardProps {
  label: string;
  /** The hero value — pre-formatted by the caller (e.g. "12", "+4.2%"). */
  primaryValue: React.ReactNode;
  /** A smaller value shown beside the primary (e.g. a second half of a ratio). */
  secondaryValue?: React.ReactNode;
  delta?: { value: string; direction: KpiDeltaDirection };
  /** Colors the primary value + delta. Defaults to 'neutral'. */
  status?: KpiStatus;
}

const STATUS_COLOR: Record<KpiStatus, string> = {
  positive: 'var(--pnl-gain)',
  negative: 'var(--pnl-loss)',
  neutral: 'var(--text)',
};

const DELTA_ICON: Record<KpiDeltaDirection, IconName> = { up: 'up', down: 'down', flat: 'flat' };

export function KpiCard({ label, primaryValue, secondaryValue, delta, status = 'neutral' }: KpiCardProps) {
  const valueColor = STATUS_COLOR[status];
  return (
    <div
      style={{
        flex: 1,
        padding: `${SPACE[3.5]}px ${SPACE[4]}px`,
        borderRadius: RADIUS.lg,
        background: 'var(--s2)',
        border: '1px solid var(--bsub)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: SPACE[1], lineHeight: 1 }}>
        <span style={{ fontSize: FONT_SIZE.display, fontWeight: FONT_WEIGHT.bold, color: valueColor, ...NUMERIC_STYLE }}>
          {primaryValue}
        </span>
        {secondaryValue != null && (
          <span style={{ fontSize: FONT_SIZE.lg, color: 'var(--t2)', marginBottom: 1, ...NUMERIC_STYLE }}>
            {secondaryValue}
          </span>
        )}
      </div>
      <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', marginTop: SPACE[1], letterSpacing: LETTER_SPACING.label, textTransform: 'uppercase' }}>
        {label}
      </div>
      {delta && (
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[0.5], fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, color: valueColor, marginTop: SPACE[1], ...NUMERIC_STYLE }}>
          <Icon name={DELTA_ICON[delta.direction]} size={11} />
          {delta.value}
        </div>
      )}
    </div>
  );
}

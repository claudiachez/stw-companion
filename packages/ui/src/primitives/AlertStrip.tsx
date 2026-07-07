import { FONT_SIZE, RADIUS, SPACE } from '@stw/shared';
import { Icon, type IconName } from './Icon';

// Phase 3 core component (plans/stw-design-system.md §3.10). Severity variants,
// dismissible, optional action link — consumes only `status.*` tokens. Uses the `Icon`
// primitive (lucide-react) for its severity glyphs and dismiss button rather than raw
// Unicode — the audit's own recommendation for exactly this kind of "severity glyph"
// (docs/design-system/audit/04-additional-inconsistencies.md §1).
export type AlertSeverity = 'info' | 'positive' | 'warning' | 'negative';

const SEVERITY_ROLE: Record<AlertSeverity, 'info' | 'positive' | 'warning' | 'negative'> = {
  info: 'info', positive: 'positive', warning: 'warning', negative: 'negative',
};

const SEVERITY_ICON: Record<AlertSeverity, IconName> = { info: 'info', positive: 'positive', warning: 'warning', negative: 'negative' };

export interface AlertStripProps {
  severity: AlertSeverity;
  children: React.ReactNode;
  onDismiss?: () => void;
  action?: { label: string; onClick: () => void };
}

export function AlertStrip({ severity, children, onDismiss, action }: AlertStripProps) {
  const role = SEVERITY_ROLE[severity];
  return (
    <div
      style={{
        display: 'flex', alignItems: 'flex-start', gap: SPACE[2],
        padding: `${SPACE[2]}px ${SPACE[3]}px`,
        borderRadius: RADIUS.md,
        borderLeft: `3px solid var(--status-${role}-border)`,
        background: `var(--status-${role}-bg)`,
        color: `var(--status-${role}-text)`,
        fontSize: FONT_SIZE.sm,
      }}
    >
      <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', height: '1.4em' }}>
        <Icon name={SEVERITY_ICON[severity]} size={14} />
      </span>
      <div style={{ flex: 1, minWidth: 0, lineHeight: 1.4 }}>
        {children}
        {action && (
          <button
            onClick={action.onClick}
            style={{
              display: 'block', marginTop: SPACE[1], fontSize: FONT_SIZE.xs, fontWeight: 600,
              color: `var(--status-${role}-text)`, background: 'none', border: 'none',
              cursor: 'pointer', padding: 0, textDecoration: 'underline',
            }}
          >
            {action.label}
          </button>
        )}
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          style={{
            flexShrink: 0, display: 'flex', background: 'none', border: 'none', cursor: 'pointer',
            color: `var(--status-${role}-text)`, padding: 0, opacity: 0.7,
          }}
        >
          <Icon name="close" size={14} />
        </button>
      )}
    </div>
  );
}

import { FONT_SIZE, SPACE } from '@stw/shared';

// Phase 3 core component (plans/stw-design-system.md §3.9). Was a single fixed-string
// component with no variants (docs/design-system/audit/00-structure-overview.md finding
// #1) — extended in place (not replaced) per the audit's "consolidate into an existing
// partial system" guidance. All 6 existing call sites pass only `message` and keep
// rendering unchanged; `icon`/`action` are additive. Replaces the paragraph-length
// "coming soon" prose pattern the spec calls out with a consistent icon + one line +
// optional action instead.
export interface EmptyStateProps {
  message: string;
  icon?: React.ReactNode;
  action?: { label: string; onClick: () => void };
  className?: string;
}

export function EmptyState({ message, icon, action, className }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center h-40 text-t3 text-sm ${className ?? ''}`}
      style={{ gap: SPACE[2] }}
    >
      {icon && <div style={{ fontSize: FONT_SIZE.display, lineHeight: 1, opacity: 0.6 }}>{icon}</div>}
      <div>{message}</div>
      {action && (
        <button
          onClick={action.onClick}
          style={{
            fontSize: FONT_SIZE.sm, color: 'var(--acc)', background: 'none',
            border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline',
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

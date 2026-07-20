import { FONT_SIZE, LETTER_SPACING, RADIUS, SPACE } from '@stw/shared';

// Phase 3 core component (plans/stw-design-system.md §3.1). Consumes only the `status.*`
// CSS variables added in Phase 2 (packages/ui/src/styles/tokens.css) — never a literal
// color. `near` and `unevaluated` are the two variants the spec calls out as genuinely
// new: `near` fires at ≥80% of a limit (visually identical to `warning` — there's no
// separate token for "almost breaching", just a distinct name for callers to reach for);
// `unevaluated` is for missing data (e.g. an unmapped sector) and deliberately does NOT
// borrow a tier color, so it can never be mistaken for a conviction badge or a real breach.
//
// `neutral` was added on a second pass against the audit: tokens.md already defines a
// `status.neutral` role (docs/design-system/tokens.md), but the first pass only exposed
// 5 of its 6 roles as variants here. `neutral` is the correct fit for an inactive/steady
// state that is neither a real breach nor missing data — e.g. SettingsPage.tsx's "Not
// connected" pill or a "flat" bias reading (docs/design-system/audit/02-component-
// duplication-report.md item 2, audit/03's BiasChip).
// `warning` and `near` share the amber `status.warning` role but carry distinct intent:
// `near` is specifically "≥80% of a limit, about to breach" (the risk engine); `warning` is a
// generic caution state that isn't a limit reading — e.g. an account "Pending approval" pill,
// which is a caution, not a near-breach. Keep them separate so a reader isn't forced to read
// `near` as "near what?" on a non-limit surface.
export type StatusPillVariant = 'ok' | 'near' | 'warning' | 'breach' | 'unevaluated' | 'info' | 'neutral';

const VARIANT_ROLE: Record<StatusPillVariant, 'positive' | 'warning' | 'negative' | 'unevaluated' | 'info' | 'neutral'> = {
  ok: 'positive',
  near: 'warning',
  warning: 'warning',
  breach: 'negative',
  unevaluated: 'unevaluated',
  info: 'info',
  neutral: 'neutral',
};

export interface StatusPillProps {
  variant: StatusPillVariant;
  children: React.ReactNode;
}

export function StatusPill({ variant, children }: StatusPillProps) {
  const role = VARIANT_ROLE[variant];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: SPACE[1],
        padding: `${SPACE[0.5]}px ${SPACE[1.5]}px`,
        borderRadius: RADIUS.full,
        border: `1px solid var(--status-${role}-border)`,
        background: `var(--status-${role}-bg)`,
        color: `var(--status-${role}-text)`,
        fontSize: FONT_SIZE['2xs'],
        fontWeight: 700,
        letterSpacing: LETTER_SPACING.label,
        textTransform: 'uppercase',
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

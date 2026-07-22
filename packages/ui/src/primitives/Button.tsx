import { forwardRef } from 'react';
import { DURATION, EASING, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACE } from '@stw/shared';

// Phase 3 core component (plans/stw-design-system.md §3.5). Four variants, replacing the
// two competing button-authoring mechanisms (Tailwind classes vs. inline `style` objects)
// found for the identical primary-CTA role, and killing the pale-green ambiguous Save the
// spec calls out by name — `primary` is always the same solid `--acc` fill with
// `--text-inverse` text, never a lower-opacity "disabled-looking but actually clickable"
// variant (docs/design-system/audit/02-component-duplication-report.md).
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';

export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'color'> {
  variant?: ButtonVariant;
  /** Marks a Save-style button as having unsaved changes — adds a highlight ring so a
   * live "there's something to save" state is visually distinct from a static one. Pair
   * with `disabled={!dirty}` so Save is inert until there's actually something to save. */
  dirty?: boolean;
}

const VARIANT_STYLE: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    background: 'var(--acc)',
    color: 'var(--text-inverse)',
    border: '1px solid var(--acc)',
  },
  secondary: {
    background: 'transparent',
    color: 'var(--t2)',
    border: '1px solid var(--border)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--t2)',
    border: '1px solid transparent',
  },
  destructive: {
    background: 'transparent',
    color: 'var(--status-negative-text)',
    border: '1px solid var(--status-negative-border)',
  },
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', dirty, disabled, style, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled}
      style={{
        padding: `${SPACE[1.5]}px ${SPACE[3.5]}px`,
        borderRadius: RADIUS.md,
        fontSize: FONT_SIZE.sm,
        fontWeight: FONT_WEIGHT.semibold,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        transition: `background ${DURATION.fast}ms ${EASING.standard}, box-shadow ${DURATION.fast}ms ${EASING.standard}`,
        boxShadow: dirty && !disabled ? '0 0 0 2px var(--status-warning-border)' : 'none',
        ...VARIANT_STYLE[variant],
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
});

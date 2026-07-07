import { forwardRef } from 'react';
import { FONT_SIZE, RADIUS, SPACE } from '@stw/shared';

// Added to the Phase 3 library after a second pass against the Phase 1 audit
// (docs/design-system/audit/04-additional-inconsistencies.md §3) flagged the
// inline-style-authored inputs in SettingsPage.tsx and all three FilterBar variants
// for setting `outline: 'none'` with NO focus-state replacement — a real keyboard-
// accessibility regression on `staging` today, not a cosmetic nit. The audit's own
// fix instruction: "Phase 2/3's FormRow/Button/input primitives should standardize
// on the Tailwind-class pattern's approach (remove-and-replace, never just
// remove)" — the Tailwind-class inputs elsewhere already correctly pair
// `focus:outline-none` with `focus:border-acc`. This component does the same:
// base look via tokens (an inline `style` object, matching this codebase's
// dominant authoring convention), focus behavior via Tailwind's `:focus`
// pseudo-class utilities (which a plain `style` object cannot express).
//
// Pair with FormRow for label/input/suffix layout — FormRow stays a layout-only
// wrapper (unchanged), this owns the actual control.
export interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Error state — swaps the focus/border color from brand green to the negative
   * status color. Does not add validation logic; purely visual. */
  invalid?: boolean;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { invalid, className, style, ...rest },
  ref,
) {
  const focusClass = invalid ? 'focus:border-[var(--status-negative-border)]' : 'focus:border-acc';
  return (
    <input
      ref={ref}
      className={`focus:outline-none ${focusClass} ${className ?? ''}`}
      style={{
        width: '100%',
        background: 'var(--surface-inset)',
        border: `1px solid ${invalid ? 'var(--status-negative-border)' : 'var(--border)'}`,
        borderRadius: RADIUS.md,
        padding: `${SPACE[1.5]}px ${SPACE[2]}px`,
        // FONT_SIZE.input (16), not .base (14) — below 16px, mobile Safari zooms the
        // viewport on focus. See tokens.ts's comment on `input` for the full rationale.
        fontSize: FONT_SIZE.input,
        color: 'var(--text)',
        boxSizing: 'border-box',
        ...style,
      }}
      {...rest}
    />
  );
});

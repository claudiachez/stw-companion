import { FONT_SIZE, FONT_WEIGHT, LETTER_SPACING, SPACE } from '@stw/shared';

// Phase 3 core component (plans/stw-design-system.md §3.8). Label / input / suffix on one
// aligned grid — fixes the audit's "Form rows in Settings with three different
// label/input/suffix alignments" finding (docs/design-system/audit/02-component-
// duplication-report.md). `prefix` reserves its slot's width even when unused, per the
// standing convention in ConfigPage.tsx's `rowPrefix` (CLAUDE.md "UI consistency" rules)
// — so a stack of rows where only some carry a prefix still keeps every input aligned.
export interface FormRowProps {
  label: string;
  children: React.ReactNode;
  /** Fixed-width slot before the input (e.g. "$") — reserved even when omitted. */
  prefix?: React.ReactNode;
  /** Rendered immediately after the input (e.g. "%"). */
  suffix?: React.ReactNode;
  /** Full-width helper text below the row. */
  hint?: React.ReactNode;
  /** 'stacked' (label above input, full width — Settings' existing convention) or
   * 'horizontal' (label + fixed-width column, input inline — ConfigPage's dense
   * convention). Defaults to 'stacked'. */
  layout?: 'stacked' | 'horizontal';
  /** Only used by 'horizontal' layout. Defaults to 140. */
  labelWidth?: number;
}

const label: React.CSSProperties = {
  fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', textTransform: 'uppercase',
  letterSpacing: LETTER_SPACING.label, fontWeight: FONT_WEIGHT.semibold,
};
const prefixSlot: React.CSSProperties = { fontSize: FONT_SIZE.sm, color: 'var(--t2)', width: SPACE[4], flexShrink: 0, textAlign: 'right' };
const suffixStyle: React.CSSProperties = { fontSize: FONT_SIZE.sm, color: 'var(--t2)', flexShrink: 0 };

export function FormRow({ label: labelText, children, prefix, suffix, hint, layout = 'stacked', labelWidth = 140 }: FormRowProps) {
  if (layout === 'horizontal') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[2] }}>
        <span style={{ ...label, width: labelWidth, flexShrink: 0 }}>{labelText}</span>
        <span style={prefixSlot}>{prefix ?? ''}</span>
        <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
        {suffix != null && <span style={suffixStyle}>{suffix}</span>}
        {hint && <div style={{ flexBasis: '100%', fontSize: FONT_SIZE.xs, color: 'var(--t3)', marginTop: SPACE[0.5] }}>{hint}</div>}
      </div>
    );
  }
  return (
    <div>
      <label style={{ ...label, display: 'block', marginBottom: SPACE[1.5] }}>{labelText}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[1.5] }}>
        {prefix != null && <span style={prefixSlot}>{prefix}</span>}
        <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
        {suffix != null && <span style={suffixStyle}>{suffix}</span>}
      </div>
      {hint && <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', marginTop: SPACE[1] }}>{hint}</div>}
    </div>
  );
}

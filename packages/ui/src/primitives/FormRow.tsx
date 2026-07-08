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
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[2], flexWrap: 'wrap' }}>
        <span style={{ ...label, width: labelWidth, flexShrink: 0 }}>{labelText}</span>
        <span style={prefixSlot}>{prefix ?? ''}</span>
        <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
        {suffix != null && <span style={suffixStyle}>{suffix}</span>}
        {/* flexBasis: '100%' only forces its own line when the container can wrap — without
            flexWrap above, this hint would instead squeeze onto the same row as the input,
            starving it down to near-zero width (found live: the input rendered empty/invisible
            with the hint text overlapping where its value should have shown). */}
        {hint && <div style={{ flexBasis: '100%', paddingLeft: labelWidth + SPACE[2], fontSize: FONT_SIZE.xs, color: 'var(--t3)', marginTop: SPACE[0.5] }}>{hint}</div>}
      </div>
    );
  }
  // Stacked: reserve the prefix slot even when this row has no prefix (matches the
  // horizontal layout + this file's documented intent) so every input's left edge lines
  // up down a column — otherwise a "$"-prefixed row's input sat ~16px right of the
  // suffix-only rows, and its hint then read as misaligned against the others. The hint
  // is indented by the same slot+gap so it sits directly under the input, not the prefix.
  const hintIndent = SPACE[4] + SPACE[1.5];
  return (
    <div>
      <label style={{ ...label, display: 'block', marginBottom: SPACE[1.5] }}>{labelText}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[1.5] }}>
        <span style={prefixSlot}>{prefix ?? ''}</span>
        <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
        {suffix != null && <span style={suffixStyle}>{suffix}</span>}
      </div>
      {hint && <div style={{ paddingLeft: hintIndent, fontSize: FONT_SIZE.xs, color: 'var(--t3)', marginTop: SPACE[1] }}>{hint}</div>}
    </div>
  );
}

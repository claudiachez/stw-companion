import { FONT_SIZE, FONT_WEIGHT, LETTER_SPACING, SPACE } from '@stw/shared';

// Phase 3 core component (plans/stw-design-system.md §3.4). One treatment: uppercase
// small-caps, tokenized color, optional right-aligned slot for actions/status. Replaces
// the local unexported `SectionHeader` in PortfolioDashboard.tsx (CLAUDE.md already
// referenced it by name as if it were shared — see
// docs/design-system/audit/00-structure-overview.md finding #3) and generalizes
// macroVisuals.tsx's `ModuleHeader`, which serves the identical role scoped to Macro only.
export interface SectionHeaderProps {
  title: React.ReactNode;
  /** Defaults to the standard muted label color; pass a status color (e.g. 'var(--c3)')
   * for an attention-grabbing header like "⚠ Unpriced Legs". */
  color?: string;
  /** Right-aligned slot — an "Updated: …" stamp, an action button, a status pill. */
  right?: React.ReactNode;
}

export function SectionHeader({ title, color = 'var(--t3)', right }: SectionHeaderProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: SPACE[2], marginBottom: SPACE[2.5] }}>
      <div style={{ fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.semibold, letterSpacing: LETTER_SPACING.label, textTransform: 'uppercase', color }}>
        {title}
      </div>
      {right != null && (
        <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {right}
        </div>
      )}
    </div>
  );
}

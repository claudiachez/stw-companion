import { FONT_SIZE, FONT_WEIGHT, LETTER_SPACING, NUMERIC_STYLE, SPACE } from '@stw/shared';
import { Icon } from './Icon';

// Phase 3 core component (plans/stw-design-system.md §3.7). The ADEA-pane structure
// (HoldingDetail.tsx) generalized: header row (title + subtitle + badge strip), a 3-col
// metric block, stacked section cards, and a standard close affordance. Both Stock Picks
// and My Portfolio detail panes are meant to become instances of this.
export interface DetailPaneMetric {
  key: string;
  content: React.ReactNode;
}

export interface DetailPaneProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Badge/StatusPill strip next to the title — composed by the caller. */
  badges?: React.ReactNode;
  /** Up to 3 columns, divided by a vertical rule (HoldingDetail's price/P&L/weight cols). */
  metrics?: DetailPaneMetric[];
  /** Pass the caller's own useIsMobile() result to stack metrics full-width, one per row,
   * instead of the fixed 3-equal-columns row — same isMobile-boolean-prop convention every
   * other responsive component in this codebase uses (e.g. AccordionList's consumers,
   * FlatTable/GroupRow), rather than a CSS breakpoint mechanism nothing else here uses.
   * Added during HoldingDetail.tsx's Phase 5 migration — its first real integration against
   * genuinely dense metric content: 3 columns of price/P&L/weight text unconditionally
   * side-by-side is illegible at ≤390px (the "design for mobile" ground rule); the original
   * component had only been checked against the gallery's short demo values, never real
   * dense content. */
  isMobile?: boolean;
  onClose?: () => void;
  /** Stacked section cards below the metric block. */
  children?: React.ReactNode;
}

const colBorder: React.CSSProperties = { borderLeft: '1px solid var(--border)', paddingLeft: SPACE[3] };

export function DetailPane({ title, subtitle, badges, metrics, isMobile, onClose, children }: DetailPaneProps) {
  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: `${SPACE[4]}px ${SPACE[5]}px` }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: SPACE[2], marginBottom: SPACE[3] }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[2], flexWrap: 'wrap' }}>
            <span style={{ fontSize: FONT_SIZE.display, fontWeight: FONT_WEIGHT.bold, color: 'var(--text)', lineHeight: 1.1 }}>{title}</span>
            {badges && <div style={{ display: 'flex', gap: SPACE[1], flexWrap: 'wrap' }}>{badges}</div>}
          </div>
          {subtitle && (
            <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t2)', marginTop: SPACE[1] }}>{subtitle}</div>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              flexShrink: 0, background: 'none', border: '1px solid var(--border)', borderRadius: 6,
              width: 28, height: 28, cursor: 'pointer', color: 'var(--t2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Icon name="close" size={16} />
          </button>
        )}
      </div>

      {/* 3-col metric block — stacks full-width on mobile (isMobile) since 3 columns of
          dense text side-by-side doesn't fit a narrow screen legibly. */}
      {metrics && metrics.length > 0 && (
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: SPACE[3], marginBottom: SPACE[4], ...NUMERIC_STYLE }}>
          {metrics.map((m, i) => (
            <div key={m.key} style={{ flex: 1, minWidth: 0, ...(i > 0 && !isMobile ? colBorder : {}) }}>{m.content}</div>
          ))}
        </div>
      )}

      {children}
    </div>
  );
}

/** A metric column's uppercase caption — the shared label style HoldingDetail's price/
 * weight/P&L columns each already use for their own top line. */
export function DetailPaneMetricLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: LETTER_SPACING.label, marginBottom: SPACE[0.5] }}>
      {children}
    </div>
  );
}

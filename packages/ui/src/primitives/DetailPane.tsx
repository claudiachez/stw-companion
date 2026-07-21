import { FONT_SIZE, FONT_WEIGHT, LETTER_SPACING, NUMERIC_STYLE, RADIUS, SPACE } from '@stw/shared';
import { Icon } from './Icon';

// Phase 3 core component (plans/stw-design-system.md §3.7). The ADEA-pane structure
// (HoldingDetail.tsx) generalized: an eyebrow top strip, header row (22px title + subtitle
// + badge strip), a stat block (up to N columns, 2-up on mobile), stacked section cards,
// and a standard close affordance. Both Stock Picks and My Portfolio detail panes are
// instances of this — the "Detail Panes — Unified" redesign (2026-07-20) makes the two
// share this one skeleton so they can't drift apart.
export interface DetailPaneMetric {
  key: string;
  content: React.ReactNode;
}

export interface DetailPaneProps {
  /** Tiny uppercase top strip identifying the surface — e.g. "My Portfolio · your position". */
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Badge/StatusPill strip next to the title — composed by the caller. */
  badges?: React.ReactNode;
  /** Stat block columns, divided by vertical rules (price/P&L/weight/… cols). */
  metrics?: DetailPaneMetric[];
  /** Pass the caller's own useIsMobile() result to lay metrics out 2-up (instead of one
   * row of N) — same isMobile-boolean-prop convention every other responsive component in
   * this codebase uses. N columns of dense metric text side-by-side is illegible at ≤390px
   * (the "design for mobile" ground rule). */
  isMobile?: boolean;
  onClose?: () => void;
  /** Stacked section cards below the stat block. */
  children?: React.ReactNode;
}

export function DetailPane({ eyebrow, title, subtitle, badges, metrics, isMobile, onClose, children }: DetailPaneProps) {
  const cols = metrics ? (isMobile ? 2 : metrics.length) : 0;
  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      {/* Eyebrow top strip — full-bleed, names the surface (shared anatomy). */}
      {eyebrow && (
        <div style={{
          background: 'var(--s2)', borderBottom: '1px solid var(--bsub)',
          padding: `${SPACE[1.5]}px ${SPACE[3.5]}px`,
          fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.bold, letterSpacing: LETTER_SPACING.label,
          textTransform: 'uppercase', color: 'var(--t3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {eyebrow}
        </div>
      )}

      {/* Header row — 22px title + badge/label strip + close. */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: SPACE[2], padding: `${SPACE[3.5]}px ${SPACE[4]}px 0` }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[2], flexWrap: 'wrap' }}>
            <span style={{ fontSize: FONT_SIZE['2xl'], fontWeight: FONT_WEIGHT.bold, color: 'var(--text)', lineHeight: 1.1 }}>{title}</span>
            {badges && <div style={{ display: 'flex', gap: SPACE[2], flexWrap: 'wrap', alignItems: 'center' }}>{badges}</div>}
          </div>
          {subtitle && (
            <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t3)', marginTop: 1 }}>{subtitle}</div>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              flexShrink: 0, background: 'none', border: '1px solid var(--border)', borderRadius: RADIUS.md,
              width: 32, height: 32, cursor: 'pointer', color: 'var(--t2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Icon name="close" size={16} />
          </button>
        )}
      </div>

      {/* Stat block — N columns (2-up on mobile), bounded top+bottom by a hairline, each
          cell divided by a vertical rule. */}
      {metrics && metrics.length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`,
          borderTop: '1px solid var(--bsub)', borderBottom: '1px solid var(--bsub)',
          margin: `${SPACE[3]}px ${SPACE[4]}px`, ...NUMERIC_STYLE,
        }}>
          {metrics.map((m, i) => (
            <div key={m.key} style={{
              minWidth: 0, padding: `${SPACE[2.5]}px ${SPACE[3]}px ${SPACE[3]}px`,
              borderLeft: i % cols !== 0 ? '1px solid var(--bsub)' : undefined,
              borderTop: i >= cols ? '1px solid var(--bsub)' : undefined,
            }}>{m.content}</div>
          ))}
        </div>
      )}

      {/* Section cards. */}
      <div style={{ padding: `0 ${SPACE[4]}px ${SPACE[4]}px` }}>{children}</div>
    </div>
  );
}

/** A stat/section caption — the shared 9px/700 uppercase label the redesign uses for every
 * stat column head and section-card head. */
export function DetailPaneMetricLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: FONT_SIZE['3xs'], fontWeight: FONT_WEIGHT.bold, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: LETTER_SPACING.label, marginBottom: SPACE[0.5] }}>
      {children}
    </div>
  );
}

/** A section card in the stacked body — 1px hairline border, radius, uniform padding, with an
 * optional uppercase title and a right-aligned `action` slot (filter chips, add buttons). The
 * shared section skeleton both detail panes stack, so they can't drift. */
export function DetailPaneSection({ title, action, children }: { title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ border: '1px solid var(--bsub)', borderRadius: 10, padding: `${SPACE[3]}px ${SPACE[3.5]}px`, marginBottom: SPACE[2.5] }}>
      {(title || action) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: SPACE[2], marginBottom: SPACE[2] }}>
          {title ? <DetailPaneMetricLabel>{title}</DetailPaneMetricLabel> : <span />}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

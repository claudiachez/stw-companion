import { FONT_SIZE, FONT_WEIGHT, LETTER_SPACING, MODAL_WIDTH, OVERLAY, SHADOW, SPACE, Z_INDEX } from '@stw/shared';

// Phase 3 addition to the spec's component list (not in the original 11 — added based on
// a Phase 1 finding: docs/design-system/audit/03-responsive-mobile-conventions.md found
// the modal backdrop already 5/5 consistent, but vertical alignment a real 2-vs-3 split —
// PositionEditor.tsx (top-anchored) vs. the standing rule CLAUDE.md cites it as the
// canonical *centered* example. This component extracts the already-consistent chrome
// verbatim (rgba(0,0,0,0.55) backdrop, z-index 1000) and always centers — no `align` prop,
// since a top-aligned escape hatch is exactly the drift this component exists to prevent.
export interface ModalProps {
  onClose: () => void;
  width?: keyof typeof MODAL_WIDTH;
  /** Border accent color — defaults to the standard `--acc` used by every existing modal
   * except the real-order IBKR flow, which intentionally uses its own solid dark green. */
  accentColor?: string;
  title?: React.ReactNode;
  children: React.ReactNode;
}

export function Modal({ onClose, width = 'md', accentColor = 'var(--acc)', title, children }: ModalProps) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: Z_INDEX.modal,
        background: OVERLAY.backdrop,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: SPACE[4], overflowY: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: MODAL_WIDTH[width],
          background: 'var(--surface)', border: `1px solid ${accentColor}`, borderRadius: 10,
          padding: `${SPACE[4]}px ${SPACE[5]}px`, boxShadow: SHADOW.modal,
        }}
      >
        {title && (
          <div style={{ fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: accentColor, marginBottom: SPACE[3], textTransform: 'uppercase', letterSpacing: LETTER_SPACING.label }}>
            {title}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

import { TIERS, FONT_SIZE, FONT_WEIGHT, LETTER_SPACING } from '@stw/shared';
import type { ConvictionComment, ConvictionSource } from '@stw/shared';
import { SourceLink } from './SourceLink';
import { Badge } from '../../../primitives/Badge';

export const SOURCE_LABELS: Record<ConvictionSource, string> = {
  discord:   'Discord',
  streaming: 'Stream',
  manual:    'Manual',
};

// Date-only display for a conviction event_date (no time component).
export function formatConvictionDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * One conviction note row — shared by the featured "Latest Comments" block and the
 * "Conviction Notes" history timeline so both render identically.
 */
export function CommentRow({
  cc, currentUserId, canEdit, onDelete,
}: {
  cc: ConvictionComment;
  currentUserId: string | null;
  canEdit: boolean;
  onDelete: (id: number) => void;
}) {
  const tier = TIERS[cc.conviction_level] ?? TIERS[0];
  const isOwn = cc.user_id != null && cc.user_id === currentUserId;
  const canDelete = canEdit || isOwn;

  return (
    <div style={{ padding: '8px 0', borderBottom: '1px solid var(--bsub)' }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
        {/* Same tier-color pill as ConvictionBadge/Badge kind="tier", but with a custom
            "C{level} {short}" label — Badge's label override lets this keep that exact
            text while sourcing color from the same tier map, not a hand-rolled one. */}
        <Badge kind="tier" tier={cc.conviction_level} label={`C${cc.conviction_level} ${tier.short}`} />
        <span style={{ fontSize: FONT_SIZE.xs, color: 'var(--t2)' }}>{formatConvictionDate(cc.event_date)}</span>
        {/* Show source only on admin notes (user_id null). Not a Badge kind="source" — that
            means "which trader this call came from" (STW/Graddox); this is the note's
            content-origin channel (Discord/Stream/Manual), a different concept despite
            the similar name. */}
        {cc.user_id === null && (
          <span style={{
            fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.semibold, letterSpacing: LETTER_SPACING.label,
            padding: '1px 5px', borderRadius: 3,
            background: 'var(--s2)', color: 'var(--t3)',
            textTransform: 'uppercase',
          }}>
            {SOURCE_LABELS[cc.source]}
          </span>
        )}
        <SourceLink url={cc.source_url} title="Open original message" />
        {isOwn && (
          <span style={{
            fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.semibold, letterSpacing: LETTER_SPACING.label,
            padding: '1px 5px', borderRadius: 3,
            background: 'var(--s2)', color: 'var(--acc)',
            textTransform: 'uppercase',
          }}>
            You
          </span>
        )}
        {canDelete && (
          <button
            onClick={() => onDelete(cc.id)}
            title="Delete"
            style={{
              marginLeft: 'auto', background: 'none', border: 'none',
              cursor: 'pointer', color: 'var(--t3)', fontSize: FONT_SIZE.sm, padding: '0 2px',
            }}
          >
            ✕
          </button>
        )}
      </div>
      <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: 'var(--text)', lineHeight: 1.5 }}>{cc.comment}</p>
    </div>
  );
}

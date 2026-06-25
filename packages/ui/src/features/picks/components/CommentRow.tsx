import { TIERS } from '@stw/shared';
import type { ConvictionComment, ConvictionSource } from '@stw/shared';
import { SourceLink } from './SourceLink';

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
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
          padding: '2px 6px', borderRadius: 3,
          color: tier.color, background: tier.bg,
          textTransform: 'uppercase',
        }}>
          C{cc.conviction_level} {tier.short}
        </span>
        <span style={{ fontSize: 11, color: 'var(--t2)' }}>{formatConvictionDate(cc.event_date)}</span>
        {/* Show source only on admin notes (user_id null) */}
        {cc.user_id === null && (
          <span style={{
            fontSize: 9, fontWeight: 600, letterSpacing: '0.08em',
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
            fontSize: 9, fontWeight: 600, letterSpacing: '0.08em',
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
              cursor: 'pointer', color: 'var(--t3)', fontSize: 12, padding: '0 2px',
            }}
          >
            ✕
          </button>
        )}
      </div>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}>{cc.comment}</p>
    </div>
  );
}

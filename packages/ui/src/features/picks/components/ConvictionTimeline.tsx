import { useState } from 'react';
import { TIERS } from '@stw/shared';
import type { ConvictionComment, ConvictionSource } from '@stw/shared';
import { useConvictionComments } from '../useHoldingHistory';
import { useQueryClient } from '@tanstack/react-query';
import { deleteConvictionComment } from '../api';
import { ConvictionCommentForm } from './ConvictionCommentForm';
import { useCapabilities } from '../../../context/AppCapabilities';
import { useAuthStore } from '../../../store/auth';

const SOURCE_LABELS: Record<ConvictionSource, string> = {
  discord:   'Discord',
  streaming: 'Stream',
  manual:    'Manual',
};

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function CommentRow({
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
        <span style={{ fontSize: 11, color: 'var(--t2)' }}>{formatDate(cc.event_date)}</span>
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

interface Props {
  ticker: string;
  currentConviction: number;
}

export function ConvictionTimeline({ ticker, currentConviction }: Props) {
  const { canEdit, canViewHistory, isAdmin } = useCapabilities();
  const user = useAuthStore((s) => s.user);
  const { data: comments = [], isLoading } = useConvictionComments(ticker);
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  // Subscribers can add their own notes too
  const canAddNote = canEdit || canViewHistory || isAdmin;

  async function handleDelete(id: number) {
    try {
      await deleteConvictionComment(id);
      queryClient.invalidateQueries({ queryKey: ['conviction-comments', ticker] });
    } catch {
      // silently ignore
    }
  }

  if (isLoading) {
    return <div style={{ fontSize: 12, color: 'var(--t3)', padding: '8px 0' }}>Loading…</div>;
  }

  return (
    <div>
      {comments.length === 0 && !showForm && (
        <div style={{ fontSize: 12, color: 'var(--t3)', padding: '4px 0' }}>No conviction notes yet.</div>
      )}

      <div>
        {comments.map((cc) => (
          <CommentRow
            key={cc.id}
            cc={cc}
            currentUserId={user?.id ?? null}
            canEdit={!!canEdit}
            onDelete={handleDelete}
          />
        ))}
      </div>

      {showForm ? (
        <ConvictionCommentForm
          ticker={ticker}
          currentConviction={currentConviction}
          onDone={() => setShowForm(false)}
        />
      ) : canAddNote && (
        <button
          onClick={() => setShowForm(true)}
          style={{
            marginTop: 8, background: 'none', border: '1px dashed var(--border)',
            borderRadius: 5, color: 'var(--t2)', fontSize: 11, cursor: 'pointer',
            padding: '5px 10px', width: '100%',
          }}
        >
          ＋ {canEdit ? 'Add Note' : 'Add Personal Note'}
        </button>
      )}
    </div>
  );
}

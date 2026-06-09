import { useState } from 'react';
import { useConvictionComments } from '../useHoldingHistory';
import { useQueryClient } from '@tanstack/react-query';
import { deleteConvictionComment } from '../api';
import { ConvictionCommentForm } from './ConvictionCommentForm';
import { CommentRow } from './CommentRow';
import { useCapabilities } from '../../../context/AppCapabilities';
import { useAuthStore } from '../../../store/auth';

interface Props {
  ticker: string;
  currentConviction: number;
  /** Row id featured in the "Latest Comments" block — excluded here so it isn't shown twice. */
  excludeId?: number;
}

export function ConvictionTimeline({ ticker, currentConviction, excludeId }: Props) {
  const { canEdit, canViewHistory, isAdmin } = useCapabilities();
  const user = useAuthStore((s) => s.user);
  const { data: allComments = [], isLoading } = useConvictionComments(ticker);
  const comments = excludeId != null ? allComments.filter((c) => c.id !== excludeId) : allComments;
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

  // Hide when nobody can interact and there's nothing to show
  if (!canAddNote && comments.length === 0) return null;

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

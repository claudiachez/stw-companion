import { useState } from 'react';
import { useConvictionComments } from '../useHoldingHistory';
import { useQueryClient } from '@tanstack/react-query';
import { deleteConvictionComment } from '../api';
import { ConvictionCommentForm } from './ConvictionCommentForm';
import { CommentRow } from './CommentRow';
import { useCapabilities } from '../../../context/AppCapabilities';
import { useAuthStore } from '../../../store/auth';
import { FONT_SIZE } from '@stw/shared';

interface Props {
  ticker: string;
  currentConviction: number;
}

// Unified "Commentary" feed: every conviction_comments row for the ticker, newest first
// (host Discord/stream notes + subscriber personal notes), with + Add Note at the bottom.
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
    return <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t3)', padding: '8px 0' }}>Loading…</div>;
  }

  // Hide when nobody can interact and there's nothing to show
  if (!canAddNote && comments.length === 0) return null;

  return (
    <div>
      {comments.length === 0 && !showForm && (
        <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t3)', padding: '4px 0' }}>No commentary yet.</div>
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
            borderRadius: 5, color: 'var(--t2)', fontSize: FONT_SIZE.xs, cursor: 'pointer',
            padding: '5px 10px', width: '100%',
          }}
        >
          ＋ {canEdit ? 'Add Note' : 'Add Personal Note'}
        </button>
      )}
    </div>
  );
}

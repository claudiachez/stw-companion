import { useState } from 'react';
import { useConvictionComments } from '../useHoldingHistory';
import { useQueryClient } from '@tanstack/react-query';
import { deleteConvictionComment } from '../api';
import { ConvictionCommentForm } from './ConvictionCommentForm';
import { CommentRow } from './CommentRow';
import { useCapabilities } from '../../../context/AppCapabilities';
import { useAuthStore } from '../../../store/auth';
import { FONT_SIZE, FONT_WEIGHT } from '@stw/shared';

interface Props {
  ticker: string;
  currentConviction: number;
  /** Which rows + add-affordance to show: STW public notes (user_id null), the subscriber's
   *  own private notes, or everything (default). Lets the pick pane render STW commentary and
   *  the "Your personal note" section (design: two distinct sections) from the one feed. */
  scope?: 'all' | 'stw' | 'personal';
}

// A conviction_comments feed for the ticker, newest first. RLS already limits a subscriber to
// STW's public notes (user_id null) + their OWN notes, so `scope` just partitions those two.
export function ConvictionTimeline({ ticker, currentConviction, scope = 'all' }: Props) {
  const { canEdit, canViewHistory, isAdmin } = useCapabilities();
  const user = useAuthStore((s) => s.user);
  const { data: comments = [], isLoading } = useConvictionComments(ticker);
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const visible = scope === 'stw' ? comments.filter((cc) => cc.user_id == null)
    : scope === 'personal' ? comments.filter((cc) => cc.user_id != null)
    : comments;
  // Long-held names accrete a lot of "still holding" notes; show the 5 most recent, the rest
  // behind a toggle. (Comments arrive newest-first.) Interim until the routines only log real
  // conviction moves — see docs/status.md.
  const CAP = 5;
  const shown = showAll ? visible : visible.slice(0, CAP);
  const hidden = visible.length - shown.length;
  // STW commentary is admin-authored (canEdit); a personal note is the subscriber's own.
  const canAddNote = scope === 'personal' ? (!canEdit && canViewHistory)
    : scope === 'stw' ? !!canEdit
    : (canEdit || canViewHistory || isAdmin);
  const addLabel = scope === 'personal' ? 'Add a personal note' : (canEdit ? 'Add Note' : 'Add Personal Note');
  const emptyText = scope === 'personal' ? 'No personal note yet.' : 'No commentary yet.';

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
  if (!canAddNote && visible.length === 0) return null;

  return (
    <div>
      {visible.length === 0 && !showForm && (
        <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t3)', padding: '4px 0' }}>{emptyText}</div>
      )}

      <div>
        {shown.map((cc) => (
          <CommentRow
            key={cc.id}
            cc={cc}
            currentUserId={user?.id ?? null}
            canEdit={!!canEdit}
            onDelete={handleDelete}
          />
        ))}
      </div>

      {(hidden > 0 || showAll) && visible.length > CAP && (
        <button
          onClick={() => setShowAll((v) => !v)}
          style={{ marginTop: 6, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, color: 'var(--acc)' }}
        >
          {showAll ? 'Show fewer ↑' : `Show ${hidden} older ↓`}
        </button>
      )}

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
          ＋ {addLabel}
        </button>
      )}
    </div>
  );
}

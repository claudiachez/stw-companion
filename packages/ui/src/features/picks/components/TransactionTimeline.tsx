import { useState } from 'react';
import type { HoldingTransaction } from '@stw/shared';
import { useHoldingTransactions } from '../useHoldingHistory';
import { useQueryClient } from '@tanstack/react-query';
import { deleteHoldingTransaction } from '../api';
import { TransactionEventForm } from './TransactionEventForm';
import { ActionBadge } from './ActionBadge';
import { useCapabilities } from '../../../context/AppCapabilities';

function dotColor(action: string): string {
  if (action === 'New') return 'var(--acc)';
  if (action === 'Closed') return '#ef4444';
  if (action === 'Upsized') return '#3b82f6';
  if (action === 'Trimmed') return '#f59e0b';
  return 'var(--t3)';
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Row columns: Action · Date · Weight · Notes.
function EventRow({ tx, canEdit, onDelete }: { tx: HoldingTransaction; canEdit: boolean; onDelete: (id: number) => void }) {
  const color = dotColor(tx.action);

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '6px 0' }}>
      <div style={{ flexShrink: 0, marginTop: 5 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <ActionBadge action={tx.action} />
          <span style={{ fontSize: 11, color: 'var(--t2)' }}>{formatDate(tx.event_date)}</span>
          {tx.weight != null && (
            <span style={{ fontSize: 11, color: 'var(--t2)' }}>{tx.weight}%</span>
          )}
        </div>
        {tx.notes && (
          <div style={{ fontSize: 11, color: 'var(--t2)', marginTop: 2, fontStyle: 'italic' }}>{tx.notes}</div>
        )}
      </div>
      {canEdit && (
        <button
          onClick={() => onDelete(tx.id)}
          title="Delete"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--t3)', fontSize: 12, padding: '0 2px', flexShrink: 0,
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
}

interface Props {
  ticker: string;
}

export function TransactionTimeline({ ticker }: Props) {
  const { canEdit } = useCapabilities();
  const { data: transactions = [], isLoading } = useHoldingTransactions(ticker);
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  async function handleDelete(id: number) {
    try {
      await deleteHoldingTransaction(id);
      queryClient.invalidateQueries({ queryKey: ['transactions', ticker] });
    } catch {
      // silently ignore
    }
  }

  if (isLoading) {
    return <div style={{ fontSize: 12, color: 'var(--t3)', padding: '8px 0' }}>Loading…</div>;
  }

  // Non-admin: hide entire block when there's nothing to show
  if (!canEdit && transactions.length === 0) return null;

  // Newest first — a flat chronological audit of weight/action changes (no leg grouping).
  const ordered = [...transactions].sort((a, b) => b.event_date.localeCompare(a.event_date));

  return (
    <div>
      {transactions.length === 0 && !showForm && (
        <div style={{ fontSize: 12, color: 'var(--t3)', padding: '4px 0' }}>No transaction history yet.</div>
      )}

      {ordered.length > 0 && (
        <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: 10, marginBottom: 12 }}>
          {ordered.map((tx) => (
            <EventRow key={tx.id} tx={tx} canEdit={!!canEdit} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {showForm ? (
        <TransactionEventForm
          ticker={ticker}
          onDone={() => setShowForm(false)}
        />
      ) : canEdit && (
        <button
          onClick={() => setShowForm(true)}
          style={{
            marginTop: 8, background: 'none', border: '1px dashed var(--border)',
            borderRadius: 5, color: 'var(--t2)', fontSize: 11, cursor: 'pointer',
            padding: '5px 10px', width: '100%',
          }}
        >
          ＋ Add Event
        </button>
      )}
    </div>
  );
}

import { useState } from 'react';
import { ACTION_VARS } from '@stw/shared';
import type { HoldingTransaction } from '@stw/shared';
import { useHoldingTransactions } from '../useHoldingHistory';
import { useQueryClient } from '@tanstack/react-query';
import { deleteHoldingTransaction } from '../api';
import { TransactionEventForm } from './TransactionEventForm';
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

function ActionBadge({ action }: { action: string }) {
  const vars = ACTION_VARS[action];
  if (!vars) return null;
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
      padding: '2px 5px', borderRadius: 3,
      color: vars.color, background: vars.bg,
      textTransform: 'uppercase',
    }}>
      {action}
    </span>
  );
}

function EventRow({ tx, canEdit, onDelete }: { tx: HoldingTransaction; canEdit: boolean; onDelete: (id: number) => void }) {
  const color = dotColor(tx.action);

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '6px 0' }}>
      <div style={{ flexShrink: 0, marginTop: 5 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <ActionBadge action={tx.action} />
          <span style={{ fontSize: 11, color: 'var(--t2)' }}>{formatDate(tx.event_date)}</span>
          {tx.weight != null && (
            <span style={{ fontSize: 11, color: 'var(--t2)' }}>{tx.weight}%</span>
          )}
          {tx.action === 'Closed' && tx.pnl_pct != null && (
            <span style={{
              fontSize: 11, fontWeight: 600,
              color: tx.pnl_pct >= 0 ? 'var(--acc)' : '#ef4444',
            }}>
              {tx.pnl_pct >= 0 ? '+' : ''}{tx.pnl_pct.toFixed(1)}%
            </span>
          )}
          {tx.price != null && (
            <span style={{ fontSize: 11, color: 'var(--t3)' }}>${tx.price.toFixed(2)}</span>
          )}
        </div>
        {tx.position_detail && (
          <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{tx.position_detail}</div>
        )}
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

  // Group by leg
  const byLeg = transactions.reduce<Record<number, HoldingTransaction[]>>((acc, tx) => {
    if (!acc[tx.leg]) acc[tx.leg] = [];
    acc[tx.leg].push(tx);
    return acc;
  }, {});
  const legs = Object.keys(byLeg).map(Number).sort((a, b) => a - b);
  const maxLeg = legs.length > 0 ? Math.max(...legs) : 1;

  if (isLoading) {
    return <div style={{ fontSize: 12, color: 'var(--t3)', padding: '8px 0' }}>Loading…</div>;
  }

  return (
    <div>
      {transactions.length === 0 && !showForm && (
        <div style={{ fontSize: 12, color: 'var(--t3)', padding: '4px 0' }}>No transaction history yet.</div>
      )}

      {legs.map((leg) => (
        <div key={leg} style={{ marginBottom: 12 }}>
          {(legs.length > 1 || leg > 1) && (
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
              color: 'var(--acc)', textTransform: 'uppercase', marginBottom: 6,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              {leg === 1 ? 'Position #1' : `Position #${leg} — Re-entry`}
              <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>
          )}
          <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: 10 }}>
            {byLeg[leg].map((tx) => (
              <EventRow key={tx.id} tx={tx} canEdit={!!canEdit} onDelete={handleDelete} />
            ))}
          </div>
        </div>
      ))}

      {showForm ? (
        <TransactionEventForm
          ticker={ticker}
          defaultLeg={maxLeg}
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

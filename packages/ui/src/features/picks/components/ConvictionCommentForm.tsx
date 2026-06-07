import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { TIERS } from '@stw/shared';
import type { ConvictionSource } from '@stw/shared';
import { insertConvictionComment } from '../api';
import { useCapabilities } from '../../../context/AppCapabilities';
import { useAuthStore } from '../../../store/auth';

const CONVICTIONS = [5, 4, 3, 2, 1, 0] as const;
const SOURCES: { value: ConvictionSource; label: string }[] = [
  { value: 'discord',   label: 'Discord' },
  { value: 'streaming', label: 'Streaming' },
  { value: 'manual',    label: 'Manual' },
];

const labelStyle: React.CSSProperties = {
  fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase',
  letterSpacing: '0.1em', marginBottom: 3, display: 'block',
};
const fieldStyle: React.CSSProperties = {
  width: '100%', background: 'var(--bg)', border: '1px solid var(--border)',
  borderRadius: 5, padding: '6px 8px', fontSize: 13, color: 'var(--text)',
  boxSizing: 'border-box',
};
const cellStyle: React.CSSProperties = { minWidth: 0 };

function formatDateDisplay(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface Props {
  ticker: string;
  currentConviction: number;
  onDone: () => void;
}

export function ConvictionCommentForm({ ticker, currentConviction, onDone }: Props) {
  const queryClient = useQueryClient();
  const { canEdit } = useCapabilities();
  const user = useAuthStore((s) => s.user);

  const today = new Date().toISOString().slice(0, 10);
  const [eventDate, setEventDate] = useState(today);
  const [convictionLevel, setConvictionLevel] = useState(String(currentConviction));
  const [source, setSource] = useState<ConvictionSource>('discord');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (!comment.trim()) { setError('Note is required.'); return; }
    setSaving(true);
    setError('');
    try {
      await insertConvictionComment({
        ticker,
        event_date: canEdit ? eventDate : today,
        conviction_level: (canEdit ? Number(convictionLevel) : currentConviction) as 0 | 1 | 2 | 3 | 4 | 5,
        comment: comment.trim(),
        source: canEdit ? source : 'manual',
        user_id: canEdit ? null : (user?.id ?? null),
      });
      await queryClient.invalidateQueries({ queryKey: ['conviction-comments', ticker] });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      background: 'var(--s2)', border: '1px solid var(--border)',
      borderRadius: 6, padding: '12px 14px', marginTop: 10,
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--acc)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {canEdit ? '＋ New Conviction Note' : '＋ Add Personal Note'}
      </div>

      {/* Subscriber: show date as text + single note field only */}
      {!canEdit && (
        <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 10 }}>
          {formatDateDisplay(today)}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Admin: full controls */}
        {canEdit && (
          <>
            <div style={cellStyle}>
              <label style={labelStyle}>Date</label>
              <input style={fieldStyle} type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
            </div>
            <div style={cellStyle}>
              <label style={labelStyle}>Conviction Level</label>
              <select style={fieldStyle} value={convictionLevel} onChange={(e) => setConvictionLevel(e.target.value)}>
                {CONVICTIONS.map((v) => (
                  <option key={v} value={v}>{v} — {TIERS[v].short}</option>
                ))}
              </select>
            </div>
            <div style={cellStyle}>
              <label style={labelStyle}>Source</label>
              <select style={fieldStyle} value={source} onChange={(e) => setSource(e.target.value as ConvictionSource)}>
                {SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </>
        )}

        <div style={cellStyle}>
          {canEdit && <label style={labelStyle}>Note</label>}
          <textarea
            style={{ ...fieldStyle, minHeight: 80, resize: 'vertical' }}
            value={comment}
            placeholder={canEdit ? 'What drove this conviction reading?' : 'Your personal notes on this position…'}
            onChange={(e) => setComment(e.target.value)}
            autoFocus
          />
        </div>
      </div>

      {error && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 10 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          onClick={save}
          disabled={saving}
          style={{
            padding: '6px 14px', borderRadius: 5, border: 'none', cursor: 'pointer',
            background: 'var(--acc)', color: '#000', fontSize: 12, fontWeight: 600,
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? 'Saving…' : 'Add Note'}
        </button>
        <button
          onClick={onDone}
          disabled={saving}
          style={{
            padding: '6px 14px', borderRadius: 5, cursor: 'pointer',
            background: 'none', border: '1px solid var(--border)', color: 'var(--t2)', fontSize: 12,
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

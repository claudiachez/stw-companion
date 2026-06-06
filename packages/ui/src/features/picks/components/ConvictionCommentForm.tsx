import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { TIERS } from '@stw/shared';
import type { ConvictionSource } from '@stw/shared';
import { insertConvictionComment } from '../api';

const CONVICTIONS = [5, 4, 3, 2, 1, 0] as const;
const SOURCES: { value: ConvictionSource; label: string }[] = [
  { value: 'discord', label: 'Discord' },
  { value: 'streaming', label: 'Streaming' },
  { value: 'manual', label: 'Manual' },
];

const labelStyle: React.CSSProperties = {
  fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase',
  letterSpacing: '0.1em', marginBottom: 3, display: 'block',
};
const fieldStyle: React.CSSProperties = {
  width: '100%', background: 'var(--bg)', border: '1px solid var(--border)',
  borderRadius: 5, padding: '6px 8px', fontSize: 13, color: 'var(--text)',
};

interface Props {
  ticker: string;
  currentConviction: number;
  onDone: () => void;
}

export function ConvictionCommentForm({ ticker, currentConviction, onDone }: Props) {
  const queryClient = useQueryClient();
  const [eventDate, setEventDate] = useState(new Date().toISOString().slice(0, 10));
  const [convictionLevel, setConvictionLevel] = useState(String(currentConviction));
  const [source, setSource] = useState<ConvictionSource>('discord');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (!comment.trim()) { setError('Comment is required.'); return; }
    if (!eventDate) { setError('Date is required.'); return; }
    setSaving(true);
    setError('');
    try {
      await insertConvictionComment({
        ticker,
        event_date: eventDate,
        conviction_level: Number(convictionLevel) as 0 | 1 | 2 | 3 | 4 | 5,
        comment: comment.trim(),
        source,
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
        ＋ New Conviction Note
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={labelStyle}>Date</label>
          <input style={fieldStyle} type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Conviction Level</label>
          <select style={fieldStyle} value={convictionLevel} onChange={(e) => setConvictionLevel(e.target.value)}>
            {CONVICTIONS.map((v) => (
              <option key={v} value={v}>{v} — {TIERS[v].short}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Source</label>
          <select style={fieldStyle} value={source} onChange={(e) => setSource(e.target.value as ConvictionSource)}>
            {SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Comment</label>
          <textarea
            style={{ ...fieldStyle, minHeight: 72, resize: 'vertical' }}
            value={comment}
            placeholder="What drove this conviction reading?"
            onChange={(e) => setComment(e.target.value)}
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

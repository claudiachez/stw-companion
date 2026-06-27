import type { MacroRecap } from '@stw/shared';

interface Props {
  recap: MacroRecap | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

export function MacroRecapCard({ recap, loading, error, onRefresh }: Props) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
      {loading && (
        <div style={{ color: 'var(--t3)', fontSize: 12 }}>Generating AI recap…</div>
      )}

      {error && !loading && (
        <div style={{ color: 'var(--c1)', fontSize: 12 }}>{error}</div>
      )}

      {recap && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text)', lineHeight: 1.6 }}>{recap.summary}</p>

          {recap.keyLevel !== null && (
            <div style={{ background: 'var(--s2)', borderRadius: 6, padding: '8px 12px', fontSize: 12 }}>
              <span style={{ fontWeight: 600, color: 'var(--t2)' }}>Key Level: </span>
              <span style={{ color: 'var(--text)' }}>{recap.keyLevel}</span>
              {recap.keyLevelNote && <span style={{ color: 'var(--t2)' }}> — {recap.keyLevelNote}</span>}
            </div>
          )}

          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--t2)', borderTop: '1px solid var(--bsub)', paddingTop: 8 }}>
            {recap.bottomLine}
          </p>
        </div>
      )}

      {!recap && !loading && !error && (
        <div style={{ color: 'var(--t3)', fontSize: 12 }}>No recap yet — click Refresh to generate.</div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <button
          onClick={onRefresh}
          disabled={loading}
          style={{
            fontSize: 11,
            padding: '3px 10px',
            borderRadius: 4,
            border: '1px solid var(--border)',
            background: 'transparent',
            color: loading ? 'var(--t3)' : 'var(--t2)',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Generating…' : 'AI-generated · Refresh'}
        </button>
      </div>
    </div>
  );
}

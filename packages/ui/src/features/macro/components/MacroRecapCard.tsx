import { useState } from 'react';
import type { MacroRecap } from '@stw/shared';

interface Props {
  recap: MacroRecap | null;
  loading: boolean;
  error: string | null;
  canEdit: boolean;
  onRefresh: (note?: string) => void;
}

function Paragraphs({ text, size = 14, color = 'var(--text)' }: { text?: string; size?: number; color?: string }) {
  if (!text) return null;
  return (
    <>
      {text.split(/\n\n+/).map((p, i) => (
        <p key={i} style={{ margin: 0, fontSize: size, color, lineHeight: 1.6 }}>{p.trim()}</p>
      ))}
    </>
  );
}

function SubHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--t3)', marginTop: 4 }}>
      {children}
    </div>
  );
}

function ScenarioRow({ label, text, color }: { label: string; text?: string; color: string }) {
  if (!text) return null;
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 13, lineHeight: 1.5 }}>
      <span style={{ flexShrink: 0, minWidth: 42, fontWeight: 700, color }}>{label}</span>
      <span style={{ color: 'var(--t2)' }}>{text}</span>
    </div>
  );
}

export function MacroRecapCard({ recap, loading, error, canEdit, onRefresh }: Props) {
  const [note, setNote] = useState('');

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
      {loading && <div style={{ color: 'var(--t3)', fontSize: 12 }}>Writing this week's recap…</div>}

      {error && !loading && <div style={{ color: 'var(--c1)', fontSize: 12 }}>{error}</div>}

      {recap && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {recap.headline && (
            <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text)', lineHeight: 1.4 }}>{recap.headline}</p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Paragraphs text={recap.verdict} />
          </div>

          {recap.bigStory && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid var(--bsub)', paddingTop: 12 }}>
              <SubHeader>The Big Story</SubHeader>
              <Paragraphs text={recap.bigStory} size={13} color="var(--t2)" />
            </div>
          )}

          {recap.scenarios && (recap.scenarios.bull || recap.scenarios.base || recap.scenarios.bear) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid var(--bsub)', paddingTop: 12 }}>
              <SubHeader>Week Ahead</SubHeader>
              <ScenarioRow label="Bull" text={recap.scenarios.bull} color="var(--c5)" />
              <ScenarioRow label="Base" text={recap.scenarios.base} color="var(--c3)" />
              <ScenarioRow label="Bear" text={recap.scenarios.bear} color="var(--c1)" />
            </div>
          )}

          {recap.playbook && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid var(--bsub)', paddingTop: 12 }}>
              <SubHeader>Next Week</SubHeader>
              <Paragraphs text={recap.playbook} size={13} color="var(--t2)" />
            </div>
          )}

          {recap.watching && (
            <div style={{ background: 'var(--s2)', borderRadius: 6, padding: '8px 12px', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
              📍 {recap.watching}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, borderTop: '1px solid var(--bsub)', paddingTop: 12, flexWrap: 'wrap' }}>
            {recap.tradingMode && (
              <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: 'var(--acc)', borderRadius: 4, padding: '2px 8px' }}>
                {recap.tradingMode}
              </span>
            )}
            {recap.finalWord && (
              <span style={{ fontSize: 13, fontStyle: 'italic', color: 'var(--t2)' }}>{recap.finalWord}</span>
            )}
          </div>
        </div>
      )}

      {!recap && !loading && !error && (
        <div style={{ color: 'var(--t3)', fontSize: 12 }}>No recap yet — generating…</div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: 'var(--t3)' }}>AI-generated weekly from the module scores + GEX read · refreshes weekly</span>
        {canEdit && (
          <button
            onClick={() => onRefresh(note)}
            disabled={loading}
            style={{
              fontSize: 11, padding: '3px 10px', borderRadius: 4, border: '1px solid var(--border)',
              background: 'transparent', color: loading ? 'var(--t3)' : 'var(--t2)',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Generating…' : 'Regenerate'}
          </button>
        )}
      </div>

      {canEdit && (
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={loading}
          placeholder="Optional: steer the next rewrite, e.g. focus more on credit stress this week"
          style={{
            width: '100%', marginTop: 8, fontSize: 12, padding: '6px 10px', borderRadius: 4,
            border: '1px solid var(--border)', background: 'var(--s2)', color: 'var(--text)',
          }}
        />
      )}
    </div>
  );
}

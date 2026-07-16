import { useState } from 'react';
import type { MacroDailyRecap, RecapSession } from '@stw/shared';
import { fmtDateTime, FONT_SIZE, FONT_WEIGHT } from '@stw/shared';
import { TextInput } from '../../../primitives/TextInput';

interface Props {
  recap: MacroDailyRecap | null;
  recapDate: string | null;
  recapSession: RecapSession | null;
  loading: boolean;
  error: string | null;
  canEdit: boolean;
  onRefresh: (note?: string, session?: RecapSession) => void;
}

function Paragraphs({ text, size = FONT_SIZE.base, color = 'var(--text)' }: { text?: string; size?: number; color?: string }) {
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
    <div style={{ fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.bold, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--t3)', marginTop: 4 }}>
      {children}
    </div>
  );
}

function ScenarioRow({ label, text, color }: { label: string; text?: string; color: string }) {
  if (!text) return null;
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: FONT_SIZE.base, lineHeight: 1.5 }}>
      <span style={{ flexShrink: 0, minWidth: 42, fontWeight: FONT_WEIGHT.bold, color }}>{label}</span>
      <span style={{ color: 'var(--t2)' }}>{text}</span>
    </div>
  );
}

function sessionLabel(session: RecapSession | null): string {
  if (session === 'am') return 'Pre-Market';
  if (session === 'pm') return 'Post-Market';
  return 'Market Note';
}

function formatRecapDate(dateStr: string | null): string {
  if (!dateStr) return '';
  // dateStr is YYYY-MM-DD ET — parse as local to avoid UTC midnight shift
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function MacroRecapCard({ recap, recapDate, recapSession, loading, error, canEdit, onRefresh }: Props) {
  const [note, setNote] = useState('');
  const [editSession, setEditSession] = useState<RecapSession>('pm');

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
      {loading && <div style={{ color: 'var(--t3)', fontSize: FONT_SIZE.sm }}>Writing today's {sessionLabel(editSession).toLowerCase()} note…</div>}

      {error && !loading && <div style={{ color: 'var(--c1)', fontSize: FONT_SIZE.sm }}>{error}</div>}

      {recap && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Session badge + date */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.bold, color: 'var(--text-inverse)',
              background: recapSession === 'am' ? 'var(--c3)' : 'var(--c4)',
              borderRadius: 4, padding: '2px 7px', textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>
              {sessionLabel(recapSession)}
            </span>
            {recapDate && (
              <span style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)' }}>
                {formatRecapDate(recapDate)}
                {recap.generatedAt ? ` · Generated: ${fmtDateTime(recap.generatedAt)}` : ''}
              </span>
            )}
          </div>

          {recap.headline && (
            <p style={{ margin: 0, fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, color: 'var(--text)', lineHeight: 1.4 }}>{recap.headline}</p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Paragraphs text={recap.verdict} />
          </div>

          {recap.scenarios && (recap.scenarios.bull || recap.scenarios.base || recap.scenarios.bear) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid var(--bsub)', paddingTop: 12 }}>
              <SubHeader>{recapSession === 'am' ? "Today's Scenarios" : "Tomorrow's Scenarios"}</SubHeader>
              <ScenarioRow label="Bull" text={recap.scenarios.bull} color="var(--c5)" />
              <ScenarioRow label="Base" text={recap.scenarios.base} color="var(--c3)" />
              <ScenarioRow label="Bear" text={recap.scenarios.bear} color="var(--c1)" />
            </div>
          )}

          {recap.playbook && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid var(--bsub)', paddingTop: 12 }}>
              <SubHeader>{recapSession === 'am' ? "Today's Playbook" : "Next-Day Setup"}</SubHeader>
              <Paragraphs text={recap.playbook} size={FONT_SIZE.base} color="var(--t2)" />
            </div>
          )}

          {recap.watching && (
            <div style={{ background: 'var(--s2)', borderRadius: 6, padding: '8px 12px', fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold, color: 'var(--text)' }}>
              📍 {recap.watching}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, borderTop: '1px solid var(--bsub)', paddingTop: 12, flexWrap: 'wrap' }}>
            {recap.tradingMode && (
              <span style={{ fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold, color: 'var(--text-inverse)', background: 'var(--acc)', borderRadius: 4, padding: '2px 8px' }}>
                {recap.tradingMode}
              </span>
            )}
            {recap.finalWord && (
              <span style={{ fontSize: FONT_SIZE.base, fontStyle: 'italic', color: 'var(--t2)' }}>{recap.finalWord}</span>
            )}
          </div>
        </div>
      )}

      {!recap && !loading && !error && (
        <div style={{ color: 'var(--t3)', fontSize: FONT_SIZE.sm }}>No note yet today — auto-generates pre-market (~7:50am, or ~8:33am after a data release) and post-market (~4:30pm ET) on weekdays.</div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)' }}>AI-generated from module scores + GEX · auto-updates twice daily</span>
        {canEdit && (
          // Not Button: a compact inline toolbar control pair (11px, 3px/6-10px padding) —
          // Button's fixed 14px/SPACE[1.5,4] sizing would look oversized next to this bar,
          // same reasoning as TradesTable's row-scoped Edit button.
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <select
              value={editSession}
              onChange={(e) => setEditSession(e.target.value as RecapSession)}
              disabled={loading}
              style={{
                fontSize: FONT_SIZE.xs, padding: '3px 6px', borderRadius: 4, border: '1px solid var(--border)',
                background: 'var(--s2)', color: 'var(--t2)', cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              <option value="am">AM</option>
              <option value="pm">PM</option>
            </select>
            <button
              onClick={() => onRefresh(note, editSession)}
              disabled={loading}
              style={{
                fontSize: FONT_SIZE.xs, padding: '3px 10px', borderRadius: 4, border: '1px solid var(--border)',
                background: 'transparent', color: loading ? 'var(--t3)' : 'var(--t2)',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Generating…' : 'Regenerate'}
            </button>
          </div>
        )}
      </div>

      {canEdit && (
        <TextInput
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={loading}
          placeholder="Optional: steer the rewrite, e.g. focus more on credit stress"
          style={{ marginTop: 8 }}
        />
      )}
    </div>
  );
}

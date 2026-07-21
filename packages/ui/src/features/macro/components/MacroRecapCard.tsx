import { useState } from 'react';
import type { MacroDailyRecap, RecapSession } from '@stw/shared';
import { fmtDateTime, FONT_SIZE, FONT_WEIGHT } from '@stw/shared';
import { TextInput } from '../../../primitives/TextInput';
import { Card, CardHeader, HelpPanel } from './macroVisuals';

interface Props {
  recap: MacroDailyRecap | null;
  recapDate: string | null;
  recapSession: RecapSession | null;
  loading: boolean;
  error: string | null;
  canEdit: boolean;
  onRefresh: (note?: string, session?: RecapSession) => void;
  helpOpen: boolean;
  onToggleHelp: () => void;
  help: React.ReactNode;
}

function Paragraphs({ text, color = 'var(--t2)' }: { text?: string; color?: string }) {
  if (!text) return null;
  return (
    <>
      {text.split(/\n\n+/).map((p, i) => (
        <p key={i} style={{ margin: 0, fontSize: FONT_SIZE.sm, color, lineHeight: 1.65 }}>{p.trim()}</p>
      ))}
    </>
  );
}

function ScenarioRow({ label, text, color }: { label: string; text?: string; color: string }) {
  if (!text) return null;
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: FONT_SIZE.sm, lineHeight: 1.55 }}>
      <span style={{ flexShrink: 0, minWidth: 42, fontWeight: FONT_WEIGHT.bold, color }}>{label}</span>
      <span style={{ color: 'var(--t2)' }}>{text}</span>
    </div>
  );
}

function sessionLabel(s: RecapSession | null): string {
  return s === 'am' ? 'pre-market' : s === 'pm' ? 'post-market' : 'market note';
}
function formatRecapDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// AI recap — the one-paragraph read plus suggested mode, with the scenarios /
// playbook / watch-item behind a "Read the full recap" expander. Recap content is
// unchanged (useDailyRecap); this is a layout + progressive-disclosure pass.
export function MacroRecapCard({ recap, recapDate, recapSession, loading, error, canEdit, onRefresh, helpOpen, onToggleHelp, help }: Props) {
  const [note, setNote] = useState('');
  const [editSession, setEditSession] = useState<RecapSession>('pm');
  const [expanded, setExpanded] = useState(false);

  const meta = recap ? `AI recap · ${sessionLabel(recapSession)}${recapDate ? `, ${formatRecapDate(recapDate)}` : ''}` : 'AI recap';
  const hasDetail = !!(recap && (recap.scenarios?.bull || recap.scenarios?.base || recap.scenarios?.bear || recap.playbook || recap.watching));

  return (
    <Card>
      <CardHeader title="Today's read, in plain English" meta={meta} helpOpen={helpOpen} onToggleHelp={onToggleHelp} />
      {helpOpen && <HelpPanel>{help}</HelpPanel>}

      {loading && <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t3)', marginTop: 8 }}>Writing today's note…</div>}
      {error && !loading && <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--status-negative-text)', marginTop: 8 }}>{error}</div>}

      {recap && !loading && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {recap.headline && (
            <p style={{ margin: 0, fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold, color: 'var(--text)', lineHeight: 1.4 }}>{recap.headline}</p>
          )}
          <Paragraphs text={recap.verdict} />
          {recap.tradingMode && (
            <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t2)', lineHeight: 1.6 }}>
              Suggested mode: <b style={{ color: 'var(--text)' }}>{recap.tradingMode}</b>
              {recap.finalWord && <span style={{ fontStyle: 'italic' }}> — {recap.finalWord}</span>}
            </div>
          )}

          {hasDetail && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              style={{ alignSelf: 'flex-start', background: 'none', border: 'none', padding: '4px 0', cursor: 'pointer', fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, color: 'var(--acc)' }}
            >
              {expanded ? 'Hide the full recap ▴' : 'Read the full recap ▾'}
            </button>
          )}

          {expanded && hasDetail && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--bsub)', paddingTop: 10 }}>
              {recap.scenarios && (recap.scenarios.bull || recap.scenarios.base || recap.scenarios.bear) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <SubHeader>{recapSession === 'am' ? "Today's scenarios" : "Tomorrow's scenarios"}</SubHeader>
                  <ScenarioRow label="Bull" text={recap.scenarios.bull} color="var(--status-positive-text)" />
                  <ScenarioRow label="Base" text={recap.scenarios.base} color="var(--status-warning-text)" />
                  <ScenarioRow label="Bear" text={recap.scenarios.bear} color="var(--status-negative-text)" />
                </div>
              )}
              {recap.playbook && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <SubHeader>{recapSession === 'am' ? "Today's playbook" : 'Next-day setup'}</SubHeader>
                  <Paragraphs text={recap.playbook} />
                </div>
              )}
              {recap.watching && (
                <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--text)', lineHeight: 1.6, background: 'var(--status-warning-bg)', border: '1px solid var(--status-warning-border)', borderRadius: 8, padding: '10px 12px' }}>
                  <b>Watch</b> — {recap.watching}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {!recap && !loading && !error && (
        <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t3)', marginTop: 8 }}>No note yet today — auto-generates pre-market (~7:50am) and post-market (~4:30pm ET) on weekdays.</div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)' }}>
          Source: generated from this page's data{recap?.generatedAt ? ` · ${fmtDateTime(recap.generatedAt)}` : ''}
        </span>
        {canEdit && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <select
              value={editSession}
              onChange={(e) => setEditSession(e.target.value as RecapSession)}
              disabled={loading}
              style={{ fontSize: FONT_SIZE.xs, padding: '3px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--s2)', color: 'var(--t2)', cursor: loading ? 'not-allowed' : 'pointer' }}
            >
              <option value="am">AM</option>
              <option value="pm">PM</option>
            </select>
            <button
              onClick={() => onRefresh(note, editSession)}
              disabled={loading}
              style={{ fontSize: FONT_SIZE.xs, padding: '3px 10px', borderRadius: 4, border: '1px solid var(--border)', background: 'transparent', color: loading ? 'var(--t3)' : 'var(--t2)', cursor: loading ? 'not-allowed' : 'pointer' }}
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
    </Card>
  );
}

function SubHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.bold, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--t3)' }}>
      {children}
    </div>
  );
}

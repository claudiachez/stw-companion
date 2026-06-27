import { formatDate } from '@stw/shared';

// Shared visual primitives for the macro module cards.

/** A muted source + freshness footer. `asOf` is a daily-close date (ISO). */
export function SourceNote({ source, asOf }: { source: string; asOf?: string | null }) {
  return (
    <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 10, lineHeight: 1.4 }}>
      {source}{asOf ? ` · daily close ${formatDate(asOf)}` : ''}
    </div>
  );
}

/** 0–100 sub-score (higher = more risk-on / calmer) → CSS color token. */
export function scoreColor(score: number | null): string {
  if (score === null) return 'var(--t3)';
  if (score >= 60) return 'var(--c5)';
  if (score >= 40) return 'var(--c3)';
  return 'var(--c1)';
}

/** A labelled stat tile used across the stress / credit / rates cards. */
export function StatTile({ label, value, sub, score }: {
  label: string; value: string; sub?: string; score: number | null;
}) {
  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t3)' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: scoreColor(score), marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t2)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

/** A 0–100 sleeve-score summary line (big number + status word). */
export function SleeveSummary({ score, label, hint }: { score: number | null; label: string; hint?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 26, fontWeight: 700, color: scoreColor(score) }}>{score ?? '—'}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: scoreColor(score) }}>{label}</span>
      {hint && <span style={{ fontSize: 11, color: 'var(--t3)' }}>{hint}</span>}
    </div>
  );
}

/** Responsive tile grid: multi-column on desktop, stacks on mobile. */
export function TileGrid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
      {children}
    </div>
  );
}

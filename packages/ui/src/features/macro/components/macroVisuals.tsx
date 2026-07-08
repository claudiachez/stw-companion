import { useState, type ReactNode } from 'react';
import { formatDate, fmtDateTime, FONT_SIZE, FONT_WEIGHT } from '@stw/shared';
import { Icon } from '../../../primitives/Icon';

// Shared visual primitives for the macro module cards.
//
// Deliberately NOT replaced with SectionHeader/KpiCard during the Phase 5 Macro
// migration, despite docs/design-system/migration-plan.md suggesting exactly that
// ("migrating it means replacing it with imports of the components it inspired").
// Checked against real call sites first (every StatTile usage across Volatility/
// Credit/RatesDollar — see those files) rather than assuming the plan's estimate
// held: StatTile's `sub` line carries real, load-bearing methodology text in every
// single usage ("VIX ÷ HV30 (23.4%)", "23rd pct", "vol-of-vol") — not a decorative
// delta. KpiCard has no slot for this: `secondaryValue` sits beside the primary
// value, not below it, and `delta` mandates an up/down/flat icon that doesn't fit
// free-form text. Forcing the migration would silently drop this content, not just
// look different. Likewise ModuleHeader's collapsible ⓘ help toggle doesn't compose
// cleanly with SectionHeader's own fixed margin (wrapping it would double the gap
// between title and the expanded help box). All 11 of this file's violations are
// pure fontSize literals — no color-token bug, no duplicate hex map — so this pass
// is a straight tokenization, not a restructure.

/**
 * Section title with an optional collapsible help blurb (a small ⓘ toggle).
 * Collapsed by default so it never clutters the page; tap-to-expand works on
 * mobile and desktop alike.
 */
export function ModuleHeader({ title, color = 'var(--t3)', help }: { title: string; color?: string; help?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.semibold, letterSpacing: '0.12em', textTransform: 'uppercase', color }}>{title}</span>
        {help && (
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? 'Hide explanation' : 'What is this?'}
            aria-expanded={open}
            style={{
              width: 15, height: 15, borderRadius: '50%', border: '1px solid var(--border)',
              background: open ? 'var(--s2)' : 'transparent', color: 'var(--t3)',
              cursor: 'pointer', padding: 0, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Icon name="info" size={10} />
          </button>
        )}
      </div>
      {open && help && (
        <div style={{ marginTop: 6, fontSize: FONT_SIZE.sm, color: 'var(--t2)', lineHeight: 1.5, background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px' }}>
          {help}
        </div>
      )}
    </div>
  );
}

/**
 * A muted source + freshness footer. `asOf` is the daily-close DATE the data runs
 * through (date-only is correct — a daily bar has no time-of-day). `updatedAt` is
 * when we last refreshed it — a real datetime, shown via fmtDateTime so every
 * module carries a full "Updated: … ET" stamp, not just a bare date.
 */
export function SourceNote({ source, asOf, updatedAt }: { source: string; asOf?: string | null; updatedAt?: Date | string | null }) {
  return (
    <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', marginTop: 10, lineHeight: 1.4 }}>
      {source}{asOf ? ` · data through ${formatDate(asOf)}` : ''}{updatedAt ? ` · Updated: ${fmtDateTime(updatedAt)}` : ''}
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
      <div style={{ fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.semibold, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t3)' }}>{label}</div>
      {/* 22 collapses into `display` (26) — tokens.md's own type-scale rule already folds
          20/22/26/28 into this one bucket; not a new judgment call. */}
      <div style={{ fontSize: FONT_SIZE.display, fontWeight: FONT_WEIGHT.bold, color: scoreColor(score), marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t2)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

/** A 0–100 sleeve-score summary line (big number + status word). */
export function SleeveSummary({ score, label, hint, delta }: {
  score: number | null; label: string; hint?: string;
  /** Pre-formatted lookback delta, e.g. "3D +5" — omitted/null until enough history accrues. */
  delta?: string | null;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
      <span style={{ fontSize: FONT_SIZE.display, fontWeight: FONT_WEIGHT.bold, color: scoreColor(score) }}>{score ?? '—'}</span>
      <span style={{ fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold, color: scoreColor(score) }}>{label}</span>
      {hint && <span style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)' }}>{hint}</span>}
      {delta && <span style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)' }}>{delta}</span>}
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

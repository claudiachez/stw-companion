import { useState, type ReactNode, type CSSProperties } from 'react';
import { formatDate, fmtDateTime, FONT_SIZE, FONT_WEIGHT } from '@stw/shared';
import { Icon } from '../../../primitives/Icon';

// ── Redesign shell + one-open-at-a-time ⓘ help ──────────────────────────────
// The webapp redesign lays Macro out as a single 900px column of surface cards
// (radius 12, padding 16). Every card header carries an 18px round "i" button; the
// explainer panel opens inline below the header. Only ONE panel is open across the
// whole page at a time — the open section id lives in a single `help` state in
// MacroView, and each card is told whether it's the open one (`helpOpen`) plus how
// to toggle it (`onToggleHelp`). (HelpToggle, the shared primitive, owns its own
// independent open state + renders a floating popover — neither fits the controlled
// single-open inline-panel behavior this screen specifies, so it's replicated here.)

/** A surface card — the redesign's one container idiom (radius 12, padding 16). */
export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, ...style }}>
      {children}
    </div>
  );
}

/** The 18px round ⓘ toggle in a card header. Controlled by the parent. Matches the
 *  shared HelpToggle (Risk tab): muted --s2 by default, filling to accent on hover/open. */
export function InfoButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  const active = open || hover;
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-label={open ? 'Hide explanation' : 'What is this?'}
      aria-expanded={open}
      style={{
        width: 18, height: 18, borderRadius: '50%',
        border: `1px solid ${active ? 'var(--acc)' : 'var(--border)'}`,
        background: active ? 'var(--acc)' : 'var(--s2)',
        color: active ? 'var(--text-inverse)' : 'var(--t3)',
        fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.bold, lineHeight: 1,
        cursor: 'pointer', padding: 0, flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      i
    </button>
  );
}

/** The inline `--s2` explainer panel shown below a card header when its ⓘ is open. */
export function HelpPanel({ children }: { children: ReactNode }) {
  return (
    <div style={{
      background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8,
      padding: '8px 12px', fontSize: FONT_SIZE.xs, color: 'var(--t2)', lineHeight: 1.6, marginTop: 8,
    }}>
      {children}
    </div>
  );
}

/**
 * Card header: title (+ optional ⓘ) on the left, optional muted `meta` right-aligned.
 * `helpOpen`/`onToggleHelp` wire the single-open ⓘ; omit them for a header with no help.
 */
export function CardHeader({ title, meta, helpOpen, onToggleHelp }: {
  title: string; meta?: ReactNode; helpOpen?: boolean; onToggleHelp?: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span style={{ fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold, color: 'var(--text)' }}>{title}</span>
      {onToggleHelp && <InfoButton open={!!helpOpen} onClick={onToggleHelp} />}
      {meta != null && <span style={{ marginLeft: 'auto', fontSize: FONT_SIZE['2xs'], color: 'var(--t3)' }}>{meta}</span>}
    </div>
  );
}

/**
 * Redesign status-color thresholds (distinct from scoreColor's ≥60/≥40 split):
 * score ≥ 60 green · 45–59 amber · < 45 red. Used by the sleeve bars, the regime
 * pill and the stress dots so every 0–100 read on the page bands identically.
 */
export function bandColor(score: number | null): string {
  if (score === null) return 'var(--t3)';
  if (score >= 60) return 'var(--status-positive-text)';
  if (score >= 45) return 'var(--status-warning-text)';
  return 'var(--status-negative-text)';
}

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
 *
 * `href` makes the source label a link out to the data provider — every module
 * footer is a clickable source, matching the GEX card (host: consistency across
 * the board, 2026-07-13).
 */
export function SourceNote({ source, href, asOf, updatedAt, marginTop = 10 }: { source: string; href?: string; asOf?: string | null; updatedAt?: Date | string | null; marginTop?: number }) {
  return (
    <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', marginTop, lineHeight: 1.4 }}>
      {href
        ? <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--t3)', textDecoration: 'underline' }}>{source}</a>
        : source}
      {asOf ? ` · data through ${formatDate(asOf)}` : ''}{updatedAt ? ` · Updated: ${fmtDateTime(updatedAt)}` : ''}
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

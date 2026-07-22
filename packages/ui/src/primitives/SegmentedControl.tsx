import { FONT_SIZE, FONT_WEIGHT, LETTER_SPACING } from '@stw/shared';

// Shared segmented filter-chip group (Listing Pages redesign — plans/20260720_webapp_redesign).
// One idiom, used by BOTH list filter bars (the Stock Picks FilterBar + the My Portfolio
// PortfolioFilterBar) for their row-2 filter groups, so the segmented control lives ONCE
// (the "shared styling lives once in packages/*" ground rule) instead of being forked per bar.
//
// Anatomy (from the design ref): a 9px/700/0.08em uppercase label + a bordered inline-flex of
// segment buttons (4px 9px, 11px/600; active = --acc fill + inverse text; inactive = --surface
// + --t2; a --bsub borderLeft divides each segment from the previous). Values are plain strings
// (incl. '' for the "All" segment), so a caller wires it straight to its existing filter state.

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  /** Uppercase group label shown to the left (e.g. "Type", "Trend", "Sector regime"). */
  label: string;
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Hover tooltip for the whole group. */
  title?: string;
}

export function SegmentedControl<T extends string>({ label, options, value, onChange, title }: Props<T>) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }} title={title}>
      <span
        style={{
          fontSize: FONT_SIZE['3xs'], fontWeight: FONT_WEIGHT.bold, letterSpacing: LETTER_SPACING.label,
          textTransform: 'uppercase', color: 'var(--t3)', whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
      <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
        {options.map((o, i) => {
          const active = o.value === value;
          return (
            <button
              key={o.value || '__all__'}
              type="button"
              onClick={() => onChange(o.value)}
              style={{
                padding: '4px 9px', fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold,
                background: active ? 'var(--acc)' : 'var(--surface)',
                color: active ? 'var(--text-inverse)' : 'var(--t2)',
                border: 'none', borderLeft: i === 0 ? 'none' : '1px solid var(--bsub)',
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

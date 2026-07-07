import { ACTION_VARS, bColor, TIERS, FONT_SIZE, LETTER_SPACING, RADIUS, SPACE } from '@stw/shared';

// Phase 3 core component (plans/stw-design-system.md §3.2). One component, five kinds,
// replacing the audit's 6 ad hoc badge treatments (green source chip, purple basket
// tag, orange text-only flag, gray text-only conviction label, transaction-action pill,
// GEX bias chip — docs/design-system/audit/02-component-duplication-report.md).
//
// `kind='tier'` is the named fix for ConvictionBadge.tsx, which currently hardcodes its
// own literal-hex tier-color map that 100% duplicates TIERS in
// packages/shared/src/constants/tiers.ts — this component reads TIERS directly instead
// (migrating ConvictionBadge's actual call sites onto it is a follow-up, not this phase).
//
// `kind='action'` was added on a second pass against the audit: `ActionBadge.tsx`
// (New/Upsized/Trimmed/Closed transaction states, reading `ACTION_VARS`) is a genuinely
// distinct concept class from source/category/tier/flag — none of those four fit a
// transaction-lifecycle state — so it had nowhere to migrate to without this kind.
export type BadgeKind = 'source' | 'category' | 'tier' | 'flag' | 'action';

export interface BadgeProps {
  kind: BadgeKind;
  /** Display text. For kind='tier', optional — defaults to TIERS[tier].short. */
  label?: string;
  /** kind='source' only — the trader's name (e.g. "STW", "Graddox"). Never hardcode a
   * single trader in a consumer; pass whichever trader this chip represents. */
  trader?: string;
  /** kind='category' only — the basket/theme name; color resolves via the shared
   * per-basket color map (bColor), the same content-color source every sector dot in
   * the app already uses — not a literal picked in this component. */
  category?: string;
  /** kind='tier' only — conviction level 0-5; resolves color + default label via TIERS. */
  tier?: number;
  /** kind='flag' only — severity tone. Defaults to 'warning'. */
  tone?: 'warning' | 'negative';
  /** kind='action' only — a transaction-action label ('New'/'Upsized'/'Trimmed'/
   * 'Closed'); color resolves via ACTION_VARS. 'Hold' has no entry (holding is the
   * implicit default state) — renders nothing, matching ActionBadge.tsx's own gate. */
  action?: string;
}

// `border` defaults to 'transparent' rather than requiring every call site to supply
// one — ACTION_VARS only carries {color, bg}, no border, and its color values are
// `var(--new)`-style CSS-var references, not hex literals, so the `${color}33` alpha-
// suffix trick the category/tier kinds use would silently produce an invalid
// `"var(--new)33"` string. Kinds with a real border color still pass one explicitly.
const pillStyle = (color: string, bg: string, border = 'transparent'): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  padding: `${SPACE[0.5]}px ${SPACE[1.5]}px`,
  borderRadius: RADIUS.DEFAULT,
  border: `1px solid ${border}`,
  background: bg,
  color,
  fontSize: FONT_SIZE['2xs'],
  fontWeight: 700,
  letterSpacing: LETTER_SPACING.label,
  textTransform: 'uppercase',
  lineHeight: 1.4,
  whiteSpace: 'nowrap',
});

export function Badge(props: BadgeProps) {
  switch (props.kind) {
    case 'source': {
      const name = props.trader ?? props.label ?? '—';
      return <span style={pillStyle('var(--acc)', 'var(--c5bg)', 'var(--c5b)')}>{name}</span>;
    }
    case 'category': {
      const name = props.category ?? props.label ?? '—';
      const c = bColor(name);
      // Basket colors are literal hex from a single named source (constants/baskets.ts),
      // not a fresh literal in this component — same convention every sector dot uses.
      return <span style={pillStyle(c, `${c}15`, `${c}33`)}>{name}</span>;
    }
    case 'tier': {
      const t = TIERS[props.tier ?? 0] ?? TIERS[0];
      return <span style={pillStyle(t.color, t.bg, t.border)}>{props.label ?? t.short}</span>;
    }
    case 'flag': {
      const role = props.tone === 'negative' ? 'negative' : 'warning';
      return (
        <span style={pillStyle(`var(--status-${role}-text)`, `var(--status-${role}-bg)`, `var(--status-${role}-border)`)}>
          {props.label ?? '—'}
        </span>
      );
    }
    case 'action': {
      const name = props.action ?? props.label ?? '';
      const vars = ACTION_VARS[name];
      if (!vars) return null;
      return <span style={pillStyle(vars.color, vars.bg)}>{name}</span>;
    }
  }
}

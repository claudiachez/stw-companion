import { Info, CheckCircle2, AlertTriangle, XCircle, X, ArrowUp, ArrowDown, Minus, type LucideIcon } from 'lucide-react';

// Added to the Phase 3 library after a second pass against the Phase 1 audit
// (docs/design-system/audit/04-additional-inconsistencies.md §1) found zero icon
// componentization: 90 raw Unicode glyphs (no `aria-label`s — a screen reader hits
// these as unlabeled text) plus 4 files of hand-copied SVG path data, all already
// drawn in one consistent stroke-based style — the audit recommended adopting
// `lucide-react` directly rather than inventing a bespoke icon set, "instead of
// falling back to more Unicode characters" for new Phase 3 components. Scoped to
// exactly the names this library's own components need (severity glyphs, close,
// delta arrows) — not a wholesale migration of the app's existing 90+ call sites,
// which is Phase 4 work.
export type IconName = 'info' | 'positive' | 'warning' | 'negative' | 'close' | 'up' | 'down' | 'flat';

const ICONS: Record<IconName, LucideIcon> = {
  info: Info,
  positive: CheckCircle2,
  warning: AlertTriangle,
  negative: XCircle,
  close: X,
  up: ArrowUp,
  down: ArrowDown,
  flat: Minus,
};

export interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  /** Omit for a purely decorative icon (e.g. one paired with adjacent text) — it's
   * then marked `aria-hidden` automatically. Pass a label when the icon is the only
   * content conveying meaning (e.g. an icon-only close button). */
  label?: string;
}

export function Icon({ name, size = 14, className, style, label }: IconProps) {
  const Cmp = ICONS[name];
  return <Cmp size={size} className={className} style={style} aria-hidden={label ? undefined : true} aria-label={label} />;
}

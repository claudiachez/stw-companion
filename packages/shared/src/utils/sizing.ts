// Position-sizing tone: how a subscriber's own weight in a name compares to the trader
// they're tailing. One source of truth for the wording AND the color treatment so the
// My Portfolio detail pane and the Tailing tab read identically — oversized and undersized
// are deliberately DIFFERENT colors (host, 2026-07-08): oversized = warning (amber, you're
// heavier than the trader → concentration caution), undersized = info (blue, you're lighter
// → informational, not a risk). Returns CSS-var token references, never literal colors.

export type SizingState = 'inline' | 'oversized' | 'undersized';

export interface SizingTone {
  state: SizingState;
  /** Canonical wording, used identically everywhere: "in line", "1.2 points heavier", "1.2 points lighter". */
  label: string;
  textVar: string;
  bgVar: string;
  borderVar: string;
}

// deltaPct = your book weight − the tailed trader's weight, in percentage points.
// Within ±threshold of parity reads as "in line" (neutral).
export function sizingTone(deltaPct: number | null, threshold = 0.5): SizingTone {
  if (deltaPct === null) {
    return { state: 'inline', label: '—', textVar: 'var(--t3)', bgVar: 'var(--s2)', borderVar: 'var(--border)' };
  }
  if (Math.abs(deltaPct) <= threshold) {
    return { state: 'inline', label: 'in line', textVar: 'var(--t3)', bgVar: 'var(--s2)', borderVar: 'var(--border)' };
  }
  if (deltaPct > 0) {
    return { state: 'oversized', label: `${deltaPct.toFixed(1)} points heavier`, textVar: 'var(--status-warning-text)', bgVar: 'var(--status-warning-bg)', borderVar: 'var(--status-warning-border)' };
  }
  return { state: 'undersized', label: `${Math.abs(deltaPct).toFixed(1)} points lighter`, textVar: 'var(--status-info-text)', bgVar: 'var(--status-info-bg)', borderVar: 'var(--status-info-border)' };
}

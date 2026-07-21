// Conviction bands — a coarse grouping of the 0–5 STW conviction tier, used by the
// list filters (My Portfolio, Trades). One source of truth so every surface bands
// the same way. 'low' matches the My-Portfolio Overview "low / declining conviction"
// chip exactly (tiers 1–2), deliberately excluding Legacy (0), which is its own band.

export type ConvictionBand = '' | 'high' | 'medium' | 'low' | 'legacy';

export const CONVICTION_BAND_OPTIONS: { value: Exclude<ConvictionBand, ''>; label: string }[] = [
  { value: 'high',   label: 'High (Tier 4–5)' },
  { value: 'medium', label: 'Moderate (Tier 3)' },
  { value: 'low',    label: 'Low / declining (Tier 1–2)' },
  { value: 'legacy', label: 'Legacy (Tier 0)' },
];

/**
 * Does a conviction tier fall in the chosen band? An empty band matches everything;
 * a null conviction (untailed / unrated) matches nothing once a band is chosen.
 */
export function matchConvictionBand(conviction: number | null | undefined, band: ConvictionBand): boolean {
  if (!band) return true;
  if (conviction == null) return false;
  switch (band) {
    case 'high':   return conviction >= 4;
    case 'medium': return conviction === 3;
    case 'low':    return conviction === 1 || conviction === 2;
    case 'legacy': return conviction === 0;
    default:       return true;
  }
}

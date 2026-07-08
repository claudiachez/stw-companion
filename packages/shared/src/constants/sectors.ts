// Canonical sector taxonomy — the 11 GICS sectors + two non-equity buckets.
//
// Replaces the stopgap where ticker_sector_map held Finnhub's finer, drifting
// finnhubIndustry labels (Technology / Semiconductors / Electrical Equipment / …).
// Host decisions (2026-07-07): canonical = GICS-11 + ETF + Cash; resolve each
// ticker by its authoritative GICS sector; a new scheduled sector-map-sync keeps
// the map current. See plans/20260707_data_feeds_inventory_and_plan.md.

/** The 11 GICS sectors — the canonical, mutually-exclusive equity set. */
export const GICS_SECTORS = [
  'Energy',
  'Materials',
  'Industrials',
  'Consumer Discretionary',
  'Consumer Staples',
  'Health Care',
  'Financials',
  'Information Technology',
  'Communication Services',
  'Utilities',
  'Real Estate',
] as const;
export type GicsSector = (typeof GICS_SECTORS)[number];

/** Non-equity buckets — held in the same column but EXCLUDED from sector concentration. */
export const NON_EQUITY_BUCKETS = ['ETF', 'Cash'] as const;
export type NonEquityBucket = (typeof NON_EQUITY_BUCKETS)[number];

/** Any value the ticker_sector_map.sector column may hold post-migration. */
export type SectorBucket = GicsSector | NonEquityBucket;

const GICS_SET = new Set<string>(GICS_SECTORS);
const NON_EQUITY_SET = new Set<string>(NON_EQUITY_BUCKETS);

export function isGicsSector(s: string): s is GicsSector { return GICS_SET.has(s); }
/** True for ETF / Cash — a bucket that must be excluded from sector-concentration. */
export function isNonEquityBucket(s: string | null | undefined): boolean {
  return s != null && NON_EQUITY_SET.has(s);
}

/**
 * Finnhub `profile2.finnhubIndustry` label → GICS sector. Finnhub's industries
 * roll up to GICS sectors along the actual GICS hierarchy, so this fold IS an
 * authoritative mapping, not an arbitrary bucketing — e.g. clean-energy lands
 * where GICS puts it (solar equipment "Electrical Equipment" → Industrials; a
 * solar-cell maker like FSLR "Semiconductors" → Information Technology; a
 * nuclear-fuel name "Energy" → Energy). Per-ticker exceptions live in TICKER_GICS.
 * Keys are matched case-insensitively (see resolveSector).
 */
export const FINNHUB_GICS: Record<string, GicsSector> = {
  // Information Technology
  'technology': 'Information Technology',
  'semiconductors': 'Information Technology',
  'software': 'Information Technology',
  'hardware': 'Information Technology',
  'electronic equipment': 'Information Technology',
  // Communication Services
  'communications': 'Communication Services',
  'telecommunication': 'Communication Services',
  'media': 'Communication Services',
  'entertainment': 'Communication Services',
  // Industrials
  'electrical equipment': 'Industrials',
  'aerospace & defense': 'Industrials',
  'machinery': 'Industrials',
  'industrial conglomerates': 'Industrials',
  'construction': 'Industrials',
  'building': 'Industrials',
  'marine': 'Industrials',
  'logistics & transportation': 'Industrials',
  'airlines': 'Industrials',
  'commercial services & supplies': 'Industrials',
  // Consumer Discretionary
  'retail': 'Consumer Discretionary',
  'automobiles': 'Consumer Discretionary',
  'textiles apparel & luxury goods': 'Consumer Discretionary',
  'hotels restaurants & leisure': 'Consumer Discretionary',
  'consumer products': 'Consumer Discretionary',
  // Consumer Staples
  'food products': 'Consumer Staples',
  'beverages': 'Consumer Staples',
  'consumer staples': 'Consumer Staples',
  'tobacco': 'Consumer Staples',
  // Health Care
  'health care': 'Health Care',
  'pharmaceuticals': 'Health Care',
  'biotechnology': 'Health Care',
  'life sciences tools & services': 'Health Care',
  // Financials
  'banking': 'Financials',
  'financial services': 'Financials',
  'insurance': 'Financials',
  'diversified financial services': 'Financials',
  // Energy
  'energy': 'Energy',
  'oil & gas': 'Energy',
  // Utilities
  'utilities': 'Utilities',
  // Materials
  'chemicals': 'Materials',
  'metals & mining': 'Materials',
  'materials': 'Materials',
  // Real Estate
  'real estate': 'Real Estate',
  'reits': 'Real Estate',
};

/**
 * Per-ticker overrides — the authoritative bucket for names the Finnhub fold
 * doesn't cover or gets wrong. Currently only the non-equity holdings (ETFs +
 * the cash balance row) that Finnhub profile2 has no industry for; add an equity
 * entry here only to correct a genuinely mis-folded name.
 */
export const TICKER_GICS: Record<string, SectorBucket> = {
  // Non-equity holdings (Finnhub profile2 has no industry for these).
  CASH: 'Cash',
  ARKK: 'ETF',
  SQQQ: 'ETF',
  // Equity corrections where the Finnhub fold disagrees with authoritative GICS:
  // Viavi is test/measurement + comms EQUIPMENT → GICS Information Technology,
  // though Finnhub tags it the ambiguous "Communications" (which folds to Comm Services).
  VIAV: 'Information Technology',
};

/** Normalize a Finnhub label for case-insensitive lookup. */
function normalizeLabel(label: string): string {
  return label.trim().toLowerCase();
}

/**
 * Resolve a ticker to its canonical bucket: an explicit TICKER_GICS override
 * first, else the Finnhub-label fold, else null (unmapped — the caller leaves it
 * for review; the Risk tab shows it as `unevaluated`, never a breach).
 */
export function resolveSector(ticker: string, finnhubLabel?: string | null): SectorBucket | null {
  const override = TICKER_GICS[ticker.toUpperCase()];
  if (override) return override;
  if (finnhubLabel) {
    const folded = FINNHUB_GICS[normalizeLabel(finnhubLabel)];
    if (folded) return folded;
  }
  return null;
}

// ── GEX / Positioning — SPX Gamma Edge source (Macro tab, Module 8) ──────────
//
// Source: the SPX Gamma Edge newsletter (spxgammaedge.substack.com) — a free,
// publicly readable, twice-daily report on SPX dealer gamma positioning:
// `PREMARKET REPORT.` (before the open) and `END OF SESSION REPORT.` (after the
// close). The `gex-snapshot` scheduled fn reads the public RSS feed, extracts the
// factual "Structural Read" levels from the latest report of the session, and
// upserts them into `gex_snapshots`; every client + macro-snapshot reads that
// table. We surface ONLY the factual numeric levels (gamma flip, walls, aggregate
// GEX) with attribution — never the newsletter's prose (host terms, 2026-07-11).
//
// Replaces the FlashAlpha attempt (its free tier gates all ETF/index GEX behind a
// paid plan — verified 2026-07-11) and the lagging Graddox-Discord signal. Real
// index (SPX), fresh (premarket, before the open), free, cloud-native.
//
// IMPORTANT: this feeds the Market *composite* regime score, never the frozen
// two-component regime GATE (engine_version 1.1.0) — the gate and the composite
// never blend (standing prohibition).

/** Display-ready GEX levels — what the card + regime sleeve read. */
export interface GexLevels {
  symbol: string;
  /** Spot: implied open (premarket) / session close (EOD), else prior close. */
  spot: number | null;
  /** The level where dealer gamma flips sign — the positive/negative-gamma pivot. */
  gammaFlip: number | null;
  /** Aggregate GEX, signed (the newsletter's own units — NOT dollars). */
  netGex: number | null;
  netGexLabel: 'positive' | 'negative' | null;
  /** Strike carrying the most call gamma (upside magnet / resistance). */
  callWall: number | null;
  /** Strike carrying the most put gamma (downside support / "support shelf"). */
  putWall: number | null;
  asOf: string;
}

/** Which SPX Gamma Edge report a snapshot came from. */
export type GammaEdgeKind = 'premarket' | 'eod';

/** Parsed SPX Gamma Edge "Structural Read" — the levels + report context. */
export interface GammaEdgeReport {
  kind: GammaEdgeKind;
  spot: number | null;
  gammaFlip: number | null;
  callWall: number | null;
  putWall: number | null;
  netGex: number | null;
  netGexLabel: 'positive' | 'negative' | null;
  /** Context-only extras (persisted in the snapshot `raw`, not the sleeve math). */
  peakGamma: number | null;
  upperShelf: number | null;
  priorClose: number | null;
}

/**
 * Parse a numeric token as it appears in the report, e.g. `~7,486`, `+101,111`,
 * `-156,633`, `7,543.64`. Strips the leading `~`/`+` and thousands commas; keeps
 * a leading `-`. Returns null on anything non-finite.
 */
function parseReportNum(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[~+,\s]/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Grab the value that follows a `Label:` in the report's plain text. The colon is
 * REQUIRED so prose mentions ("the 7,600 Call Wall") never match — only the
 * structured "Structural Read" lines ("Call Wall: 7,600") do. Returns the first
 * such match (the Structural Read is the first colon-form occurrence of each).
 */
function grabLabel(text: string, label: string): number | null {
  const re = new RegExp(`${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*([~+\\-]?\\d[\\d,]*(?:\\.\\d+)?)`, 'i');
  const m = text.match(re);
  return m ? parseReportNum(m[1]) : null;
}

/**
 * Parse the SPX Gamma Edge report text (HTML already stripped to plain text) into
 * the structured levels. Every field is null-on-missing — the parser never
 * fabricates, so a wording/format drift degrades honestly to nulls (visible in
 * run_log + as em-dashes on the card) rather than a wrong number.
 *
 * Spot differs by report: premarket → `Implied Open`, EOD → `Session Close`;
 * both fall back to `Prior Close`.
 */
export function parseGammaEdgeReport(text: string, kind: GammaEdgeKind): GammaEdgeReport {
  const priorClose = grabLabel(text, 'Prior Close');
  const spot = (kind === 'premarket' ? grabLabel(text, 'Implied Open') : grabLabel(text, 'Session Close')) ?? priorClose;
  const netGex = grabLabel(text, 'Aggregate GEX');
  const netGexLabel = netGex == null ? null : netGex >= 0 ? 'positive' : 'negative';
  return {
    kind,
    spot,
    gammaFlip: grabLabel(text, 'Gamma Flip'),
    callWall: grabLabel(text, 'Call Wall'),
    putWall: grabLabel(text, 'Support Shelf'),
    netGex,
    netGexLabel,
    peakGamma: grabLabel(text, 'Peak Gamma') ?? grabLabel(text, 'Pin Node'),
    upperShelf: grabLabel(text, 'Upper Shelf'),
    priorClose,
  };
}

/**
 * GEX sleeve score (0–100, higher = more risk-on) for the Market Regime
 * composite. Positioning is read off spot vs the gamma-flip: ABOVE flip =
 * positive-gamma, dealers dampen volatility (supportive → higher); BELOW flip =
 * negative-gamma, dealers amplify moves (fragile → lower). One tunable slope.
 *
 * At the flip → 50 (pivot). Each 1% of spot above/below flip moves the score by
 * GEX_SLEEVE_SLOPE points, clamped to [5, 95].
 */
export const GEX_SLEEVE_SLOPE = 20;

export function gexSleeveScore(spot: number | null, gammaFlip: number | null): number | null {
  if (spot == null || gammaFlip == null || spot === 0) return null;
  const cushionPct = ((spot - gammaFlip) / spot) * 100;
  const raw = 50 + cushionPct * GEX_SLEEVE_SLOPE;
  return Math.max(5, Math.min(95, Math.round(raw)));
}

/** One-word regime word for the card/strip, from spot vs flip. */
export function gexPositioningLabel(levels: Pick<GexLevels, 'spot' | 'gammaFlip'>): string {
  const { spot, gammaFlip } = levels;
  if (spot == null || gammaFlip == null) return '—';
  const cushionPct = ((spot - gammaFlip) / spot) * 100;
  if (cushionPct > 0.15) return 'Positive γ';
  if (cushionPct < -0.15) return 'Negative γ';
  return 'At flip';
}

/** Short, plain-English trade implication from the positioning read. */
export function gexPositioningImplication(levels: Pick<GexLevels, 'spot' | 'gammaFlip'>): string {
  const label = gexPositioningLabel(levels);
  switch (label) {
    case 'Positive γ': return 'Dealers dampen moves — dips into support tend to hold; expect a grind, not a chase.';
    case 'Negative γ': return 'Dealers amplify moves — breaks accelerate; keep size down until spot reclaims the flip.';
    case 'At flip':    return 'Right at the pivot — a decisive break either side sets the tone; wait for confirmation.';
    default:           return 'No current positioning read.';
  }
}

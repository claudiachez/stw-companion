// ── GEX / Positioning — FlashAlpha source (Macro tab, Module 8) ──────────
//
// Replaces the Discord-sourced Graddox signal as the Macro-composite GEX source
// (host decision 2026-07-10). Pure parsing + scoring over FlashAlpha's GEX
// exposure endpoint (GET /v1/exposure/gex/{symbol}). The free tier serves SPY
// only (single expiry), so these read SPY as the index proxy; upgrading the key
// to a paid tier unlocks SPX with no change here.
//
// IMPORTANT: this feeds the Market *composite* regime score, never the frozen
// two-component regime GATE (engine_version 1.1.0) — the gate and the composite
// never blend (standing prohibition).

/** One strike row from FlashAlpha's `strikes[]` array (subset we consume). */
export interface FlashAlphaStrike {
  strike: number;
  call_gex: number;
  put_gex: number;
  net_gex: number;
  call_oi?: number;
  put_oi?: number;
}

/** FlashAlpha GEX response (subset we consume). */
export interface FlashAlphaGexResponse {
  symbol: string;
  underlying_price: number | null;
  as_of: string;
  gamma_flip: number | null;
  net_gex: number | null;
  net_gex_label: string | null; // 'positive' | 'negative'
  strikes: FlashAlphaStrike[];
}

/** Derived, display-ready GEX levels — what the card + regime sleeve read. */
export interface GexLevels {
  symbol: string;
  /** Current spot of the underlying (SPY on the free tier). */
  spot: number | null;
  /** Strike where net GEX crosses zero — the positive/negative-gamma pivot. */
  gammaFlip: number | null;
  /** Aggregate gamma exposure in dollars. */
  netGex: number | null;
  netGexLabel: 'positive' | 'negative' | null;
  /** Strike carrying the most call gamma (upside magnet / resistance). */
  callWall: number | null;
  /** Strike carrying the most put gamma (downside support). */
  putWall: number | null;
  asOf: string;
}

function num(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Derive the card-level GEX levels from a raw FlashAlpha response. Net GEX and
 * the gamma-flip come native; the call/put walls are the strikes with the
 * greatest call / put gamma concentration (FlashAlpha reports both as positive
 * magnitudes — see its docs example).
 */
export function deriveGexLevels(r: FlashAlphaGexResponse): GexLevels {
  const strikes = Array.isArray(r.strikes) ? r.strikes : [];
  let callWall: number | null = null;
  let putWall: number | null = null;
  let maxCall = -Infinity;
  let maxPut = -Infinity;
  for (const s of strikes) {
    if (typeof s.call_gex === 'number' && s.call_gex > maxCall) { maxCall = s.call_gex; callWall = s.strike; }
    if (typeof s.put_gex === 'number' && s.put_gex > maxPut) { maxPut = s.put_gex; putWall = s.strike; }
  }
  const label = r.net_gex_label === 'positive' ? 'positive'
    : r.net_gex_label === 'negative' ? 'negative'
      : null;
  return {
    symbol: r.symbol,
    spot: num(r.underlying_price),
    gammaFlip: num(r.gamma_flip),
    netGex: num(r.net_gex),
    netGexLabel: label,
    callWall,
    putWall,
    asOf: r.as_of,
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

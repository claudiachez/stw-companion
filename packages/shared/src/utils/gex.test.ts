import { describe, it, expect } from 'vitest';
import {
  parseGammaEdgeReport, gexSleeveScore, gexPositioningLabel, gexPositioningImplication,
} from './gex';

// Real "Structural Read" blocks from SPX Gamma Edge (spxgammaedge.substack.com),
// HTML already stripped to plain text — the exact shape the gex-snapshot fn feeds
// parseGammaEdgeReport (captured 2026-07-10 reports).
const PREMARKET = 'QUICK READ Regime: Positive Gamma Active Bias: Mild Bullish While Above 7,486 '
  + 'GEX Status: Strongly Positive ... The 7,600 Call Wall sits overhead. '
  + 'Structural Read Prior Close: 7,543.64 Implied Open: ~7,527 Gamma Flip: ~7,486 '
  + 'Open vs Flip: +41 Points Aggregate GEX: +101,111 Pin Zone: 7,500-7,550 Peak Gamma: 7,550 '
  + 'Call Wall: 7,600 Upper Shelf: 7,700 Support Shelf: 7,400 Why This Setup Matters ...';

const EOD = 'QUICK READ ... The 7,600 Call Wall is the largest on the board. '
  + 'Structural Read Prior Close: 7,543.64 Session Close: 7,575.39 Gamma Flip: ~7,495 '
  + 'Close vs Flip: +80 Points Aggregate GEX: +156,633 Pin Node: 7,550 '
  + 'Call Wall: 7,600 Upper Shelf: 7,700 Support Shelf: 7,450 Why This Setup Matters ...';

describe('parseGammaEdgeReport', () => {
  it('parses the premarket report (spot = implied open)', () => {
    const r = parseGammaEdgeReport(PREMARKET, 'premarket');
    expect(r.spot).toBe(7527);        // Implied Open, not Prior Close
    expect(r.gammaFlip).toBe(7486);
    expect(r.callWall).toBe(7600);
    expect(r.putWall).toBe(7400);     // Support Shelf
    expect(r.netGex).toBe(101111);
    expect(r.netGexLabel).toBe('positive');
    expect(r.peakGamma).toBe(7550);
    expect(r.upperShelf).toBe(7700);
    expect(r.priorClose).toBe(7543.64);
  });

  it('parses the EOD report (spot = session close, pin node → peakGamma)', () => {
    const r = parseGammaEdgeReport(EOD, 'eod');
    expect(r.spot).toBe(7575.39);     // Session Close
    expect(r.gammaFlip).toBe(7495);
    expect(r.callWall).toBe(7600);
    expect(r.putWall).toBe(7450);
    expect(r.netGex).toBe(156633);
    expect(r.peakGamma).toBe(7550);   // via "Pin Node"
  });

  it('reads a negative aggregate GEX as negative gamma', () => {
    const r = parseGammaEdgeReport('Structural Read Gamma Flip: ~7,500 Aggregate GEX: -156,633 Call Wall: 7,600 Support Shelf: 7,400', 'eod');
    expect(r.netGex).toBe(-156633);
    expect(r.netGexLabel).toBe('negative');
  });

  it('falls back to prior close when the session spot label is absent', () => {
    const r = parseGammaEdgeReport('Structural Read Prior Close: 7,543.64 Gamma Flip: ~7,486 Call Wall: 7,600 Support Shelf: 7,400', 'premarket');
    expect(r.spot).toBe(7543.64);
  });

  it('never matches prose mentions — only colon-anchored structural lines', () => {
    // "the 7,600 Call Wall" (no colon) must NOT be read as a level.
    const r = parseGammaEdgeReport('Watch the 7,600 Call Wall overhead. Gamma Flip: ~7,486', 'premarket');
    expect(r.callWall).toBeNull();
    expect(r.gammaFlip).toBe(7486);
  });

  it('degrades to nulls on unrecognized text (never fabricates)', () => {
    const r = parseGammaEdgeReport('No structural read here.', 'premarket');
    expect(r.gammaFlip).toBeNull();
    expect(r.spot).toBeNull();
    expect(r.callWall).toBeNull();
    expect(r.netGex).toBeNull();
    expect(r.netGexLabel).toBeNull();
  });
});

describe('gexSleeveScore', () => {
  it('is 50 at the flip', () => {
    expect(gexSleeveScore(600, 600)).toBe(50);
  });

  it('rises above the flip (positive gamma) and falls below it', () => {
    const above = gexSleeveScore(606, 600)!; // +1% → +20
    const below = gexSleeveScore(594, 600)!; // -1% → -20
    expect(above).toBeGreaterThan(50);
    expect(below).toBeLessThan(50);
    expect(above).toBe(70);
    expect(below).toBe(30);
  });

  it('clamps to [5, 95]', () => {
    expect(gexSleeveScore(660, 600)).toBe(95); // +10% would be 250 → clamp
    expect(gexSleeveScore(540, 600)).toBe(5);  // -10% would be -150 → clamp
  });

  it('scores real SPX levels (spot 7527 vs flip 7486 → mildly positive)', () => {
    const s = gexSleeveScore(7527, 7486)!; // +0.545% → 50 + 10.9 ≈ 61
    expect(s).toBeGreaterThan(55);
    expect(s).toBeLessThan(66);
  });

  it('returns null on missing inputs', () => {
    expect(gexSleeveScore(null, 600)).toBeNull();
    expect(gexSleeveScore(600, null)).toBeNull();
    expect(gexSleeveScore(0, 600)).toBeNull();
  });
});

describe('gexPositioningLabel / implication', () => {
  it('labels positive/negative/at-flip by spot vs flip', () => {
    expect(gexPositioningLabel({ spot: 606, gammaFlip: 600 })).toBe('Positive γ');
    expect(gexPositioningLabel({ spot: 594, gammaFlip: 600 })).toBe('Negative γ');
    expect(gexPositioningLabel({ spot: 600, gammaFlip: 600 })).toBe('At flip');
    expect(gexPositioningLabel({ spot: null, gammaFlip: 600 })).toBe('—');
  });

  it('gives a distinct implication per state', () => {
    expect(gexPositioningImplication({ spot: 606, gammaFlip: 600 })).toMatch(/dampen/i);
    expect(gexPositioningImplication({ spot: 594, gammaFlip: 600 })).toMatch(/amplify/i);
    expect(gexPositioningImplication({ spot: 600, gammaFlip: 600 })).toMatch(/pivot/i);
  });
});

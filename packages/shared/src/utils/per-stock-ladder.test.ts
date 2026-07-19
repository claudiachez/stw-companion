import { describe, it, expect } from 'vitest';
import {
  reconstructPositionEpisode, perStockLadderStatus,
  DEFAULT_PER_STOCK_LADDER, type PositionFill,
} from './per-stock-ladder';

const fills = (...specs: [qty: number, day: string][]): PositionFill[] =>
  specs.map(([quantity, d]) => ({ quantity, executedAt: `2026-06-${d}T14:30:00Z` }));

describe('reconstructPositionEpisode — peak from the append-only fill log', () => {
  it('a single buy → peak = that size, open episode', () => {
    const e = reconstructPositionEpisode(fills([100, '01']));
    expect(e).toEqual({ hasOpenEpisode: true, peakQty: 100, entryQty: 100, reconstructedQty: 100 });
  });

  it('scale in then trim → peak is the largest size held, current is what remains', () => {
    // buy 100, buy 100 (peak 200), sell 120 → hold 80.
    const e = reconstructPositionEpisode(fills([100, '01'], [100, '02'], [-120, '03']));
    expect(e.peakQty).toBe(200);
    expect(e.reconstructedQty).toBe(80);
    expect(e.hasOpenEpisode).toBe(true);
  });

  it('averaging DOWN raises the peak (a bigger position to de-risk from)', () => {
    const e = reconstructPositionEpisode(fills([100, '01'], [50, '05']));
    expect(e.peakQty).toBe(150);
  });

  it('a fully closed position → no open episode, peak 0', () => {
    const e = reconstructPositionEpisode(fills([100, '01'], [-100, '02']));
    expect(e).toEqual({ hasOpenEpisode: false, peakQty: 0, entryQty: 0, reconstructedQty: 0 });
  });

  it('close then RE-ENTER → peak resets to the new episode, not last time', () => {
    // buy 1000, sell 1000 (closed), later buy 100 → current peak 100, not 1000.
    const e = reconstructPositionEpisode(fills([1000, '01'], [-1000, '02'], [100, '10']));
    expect(e.peakQty).toBe(100);
    expect(e.reconstructedQty).toBe(100);
    expect(e.hasOpenEpisode).toBe(true);
  });

  it('sorts unordered fills before walking them', () => {
    const e = reconstructPositionEpisode(fills([-120, '03'], [100, '01'], [100, '02']));
    expect(e.peakQty).toBe(200);
    expect(e.reconstructedQty).toBe(80);
  });

  it('missing opening history surfaces as a reconstructed qty that won\'t reconcile', () => {
    // We only see a later sell of 200 (the opening buy aged out of the Flex window).
    const e = reconstructPositionEpisode(fills([-200, '20']));
    expect(e.reconstructedQty).toBe(-200); // ≠ a real long snapshot → caller falls back
  });
});

describe('perStockLadderStatus — reduce-to-peak rungs, idempotent on trims', () => {
  const L = DEFAULT_PER_STOCK_LADDER; // -5→75, -10→50, -15→25, -20→0

  it('a small loss, comfortably above the first rung → ok', () => {
    const s = perStockLadderStatus(-2, 100, 100, L);
    expect(s.severity).toBe('ok');
    expect(s.activeRung).toBeNull();
    expect(s.nextRung).toEqual({ drawdownPct: -5, holdFractionPct: 75 });
    expect(s.distanceToNextPp).toBeCloseTo(3, 5);
  });

  it('within the near band of the first rung → near (no trim needed yet)', () => {
    const s = perStockLadderStatus(-4, 100, 100, L); // 1pp from -5
    expect(s.severity).toBe('near');
    expect(s.activeRung).toBeNull();
  });

  it('past a rung and NOT trimmed → breach, with the reduce-to target', () => {
    // down 12%, still holding full size (100/100) vs the -10 rung's 50% target.
    const s = perStockLadderStatus(-12, 100, 100, L);
    expect(s.severity).toBe('breach');
    expect(s.activeRung).toEqual({ drawdownPct: -10, holdFractionPct: 50 });
    expect(s.targetHoldPct).toBe(50);
    expect(s.currentHoldPct).toBeCloseTo(100, 5);
    expect(s.alreadyComplies).toBe(false);
    expect(s.nextRung).toEqual({ drawdownPct: -15, holdFractionPct: 25 });
  });

  it('past a rung but ALREADY trimmed to target → not a breach (idempotent)', () => {
    // down 12%, trimmed to 50 of a 100 peak = exactly the -10 rung's target.
    const s = perStockLadderStatus(-12, 50, 100, L);
    expect(s.alreadyComplies).toBe(true);
    expect(s.severity).toBe('ok'); // satisfied, and -15 is 3pp away (not near)
  });

  it('trimmed to target BUT the next rung looms → near, not ok', () => {
    // down 14% (1pp from -15), trimmed to the -10 target of 50% → satisfied here but -15 is close.
    const s = perStockLadderStatus(-14, 50, 100, L);
    expect(s.alreadyComplies).toBe(true);
    expect(s.severity).toBe('near');
  });

  it('over-trimmed below target still complies (severity not breach)', () => {
    const s = perStockLadderStatus(-12, 30, 100, L); // holding 30% < 50% target
    expect(s.alreadyComplies).toBe(true);
    expect(s.severity).toBe('ok');
  });

  it('unknown peak (incomplete history) with an active rung → breach, compliance null', () => {
    const s = perStockLadderStatus(-12, 100, 0, L); // peakQty 0 = unknown
    expect(s.currentHoldPct).toBeNull();
    expect(s.alreadyComplies).toBeNull();
    expect(s.severity).toBe('breach'); // can't confirm a trim → surface it
  });

  it('deepest rung (exit) breached → target 0%, no next rung', () => {
    const s = perStockLadderStatus(-25, 100, 100, L);
    expect(s.activeRung).toEqual({ drawdownPct: -20, holdFractionPct: 0 });
    expect(s.targetHoldPct).toBe(0);
    expect(s.nextRung).toBeNull();
    expect(s.severity).toBe('breach');
  });

  it('a fully-exited name at the exit rung complies (hold 0% ≤ 0%)', () => {
    const s = perStockLadderStatus(-25, 0, 100, L);
    expect(s.alreadyComplies).toBe(true);
    expect(s.severity).toBe('ok');
  });
});

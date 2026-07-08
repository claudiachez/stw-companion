import { describe, it, expect } from 'vitest';
import { squarify } from './treemap';

const W = 100;
const H = 60;
const AREA = W * H;

function totalArea(rects: { w: number; h: number }[]): number {
  return rects.reduce((s, r) => s + r.w * r.h, 0);
}

describe('squarify', () => {
  it('returns nothing for empty input or a zero-size container', () => {
    expect(squarify([], W, H)).toEqual([]);
    expect(squarify([1, 2, 3], 0, H)).toEqual([]);
    expect(squarify([1, 2, 3], W, 0)).toEqual([]);
  });

  it('drops non-positive weights (they have no area)', () => {
    const rects = squarify([5, 0, -3, 5], W, H);
    // only the two positive weights (indices 0 and 3) survive
    expect(rects.map((r) => r.index).sort()).toEqual([0, 3]);
  });

  it('fills the whole container with a single item', () => {
    const rects = squarify([42], W, H);
    expect(rects).toHaveLength(1);
    expect(rects[0]).toMatchObject({ index: 0, x: 0, y: 0, w: W, h: H });
  });

  it('conserves total area regardless of item count', () => {
    const rects = squarify([10, 7, 5, 3, 2, 1, 0.5], W, H);
    expect(totalArea(rects)).toBeCloseTo(AREA, 5);
  });

  it('makes each rectangle area proportional to its weight', () => {
    const values = [8, 4, 2, 1];
    const rects = squarify(values, W, H);
    const total = values.reduce((s, v) => s + v, 0);
    for (let i = 0; i < values.length; i++) {
      const r = rects.find((rr) => rr.index === i)!;
      expect(r.w * r.h).toBeCloseTo((values[i] / total) * AREA, 5);
    }
  });

  it('keeps every rectangle inside the container bounds', () => {
    const rects = squarify([9, 6, 6, 4, 3, 3, 2, 2, 1, 1], W, H);
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(-1e-9);
      expect(r.y).toBeGreaterThanOrEqual(-1e-9);
      expect(r.x + r.w).toBeLessThanOrEqual(W + 1e-9);
      expect(r.y + r.h).toBeLessThanOrEqual(H + 1e-9);
    }
  });

  it('preserves original indices under the largest-first internal ordering', () => {
    // Input is deliberately out of order; index must map back to input position.
    const rects = squarify([1, 9, 3], W, H);
    const byIndex = new Map(rects.map((r) => [r.index, r]));
    // index 1 (value 9) must be the largest rectangle
    const areas = [0, 1, 2].map((i) => byIndex.get(i)!.w * byIndex.get(i)!.h);
    expect(areas[1]).toBeGreaterThan(areas[2]);
    expect(areas[2]).toBeGreaterThan(areas[0]);
  });
});

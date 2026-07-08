// Squarified treemap layout (Bruls, Huizing & van Wijk, 2000).
//
// Pure geometry: given a set of positive weights and a container size, return one
// rectangle per weight whose AREA is proportional to its weight, packed to keep each
// rectangle's aspect ratio as close to square as possible. Used by the Portfolio
// Heatmap (Stock Picks + My Portfolio) — box size ∝ weight, no external charting lib.
//
// The returned rects carry the ORIGINAL index into the input array (input order is
// preserved via `index`), so callers map a rect back to its own datum regardless of the
// internal largest-first ordering. Non-positive weights are dropped (they have no area).

export interface TreemapRect {
  index: number; // index into the original `values` array
  x: number;
  y: number;
  w: number;
  h: number;
}

// Aspect-ratio cost of a row laid along a side of length `side`: the worst (largest)
// aspect ratio among the row's rectangles. Lower is better (closer to square).
function worstRatio(rowAreas: number[], side: number): number {
  let sum = 0;
  let max = -Infinity;
  let min = Infinity;
  for (const a of rowAreas) {
    sum += a;
    if (a > max) max = a;
    if (a < min) min = a;
  }
  const side2 = side * side;
  const sum2 = sum * sum;
  return Math.max((side2 * max) / sum2, sum2 / (side2 * min));
}

export function squarify(values: number[], width: number, height: number): TreemapRect[] {
  if (values.length === 0 || width <= 0 || height <= 0) return [];

  // Pair each value with its original index, drop non-positive, sort largest-first.
  const items = values
    .map((value, index) => ({ value, index }))
    .filter((it) => it.value > 0)
    .sort((a, b) => b.value - a.value);
  if (items.length === 0) return [];

  // Scale weights so their total equals the container area — then a rectangle's area
  // directly equals its scaled weight.
  const total = items.reduce((s, it) => s + it.value, 0);
  const scale = (width * height) / total;
  const areas = items.map((it) => ({ area: it.value * scale, index: it.index }));

  const rects: TreemapRect[] = [];
  // The remaining free rectangle that still needs to be filled.
  let x = 0;
  let y = 0;
  let w = width;
  let h = height;

  // Place a finished row of rectangles along the SHORTER side of the free rect, then
  // shrink the free rect by the strip the row consumed.
  const placeRow = (row: { area: number; index: number }[]) => {
    const rowSum = row.reduce((s, it) => s + it.area, 0);
    if (rowSum <= 0) return;
    if (w <= h) {
      // Horizontal strip across the top; its height is fixed, widths vary.
      const stripH = rowSum / w;
      let cx = x;
      for (const it of row) {
        const rw = it.area / stripH;
        rects.push({ index: it.index, x: cx, y, w: rw, h: stripH });
        cx += rw;
      }
      y += stripH;
      h -= stripH;
    } else {
      // Vertical strip down the left; its width is fixed, heights vary.
      const stripW = rowSum / h;
      let cy = y;
      for (const it of row) {
        const rh = it.area / stripW;
        rects.push({ index: it.index, x, y: cy, w: stripW, h: rh });
        cy += rh;
      }
      x += stripW;
      w -= stripW;
    }
  };

  let row: { area: number; index: number }[] = [];
  let i = 0;
  while (i < areas.length) {
    const side = Math.min(w, h);
    const next = areas[i];
    if (row.length === 0) {
      row.push(next);
      i++;
      continue;
    }
    const current = worstRatio(row.map((r) => r.area), side);
    const withNext = worstRatio([...row.map((r) => r.area), next.area], side);
    if (withNext <= current) {
      // Adding `next` keeps rectangles at least as square → keep filling the row.
      row.push(next);
      i++;
    } else {
      // Adding `next` would make the row worse → close it and start fresh.
      placeRow(row);
      row = [];
    }
  }
  if (row.length) placeRow(row);

  return rects;
}

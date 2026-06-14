/**
 * _position_detail_parse.ts — position_detail parsers for the one-off legs backfill ONLY.
 *
 * WHY THIS EXISTS: `@stw/shared` deliberately dropped all `position_detail` parsing in the
 * Phase-2 rework (commit 091c76d deleted utils/options.ts and the parse fns in utils/positions.ts)
 * — the app now reads structured `legs`, never the text blob. But `scripts/backfill_legs.ts` still
 * needs to parse the legacy `holdings.position_detail` to SEED `legs`. Rather than resurrect dead
 * code in shared, these parsers live here, scoped to the backfill. Recovered verbatim from commit
 * 70ab338 (the parent of the deletion); only the unused IBKR-pricing helpers (mergeLegs /
 * legPriceReason / PricedLeg) were left out. Once the backfill has run on the real book, this
 * module — like the backfill itself — is disposable.
 */

export interface OptionLeg {
  symbol: string;
  strike: number;
  right: 'C' | 'P';
  expiry: string;
  entry: number;
}

export type Direction = 'long' | 'short';

const MONTH: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

function toExpiry(monthStr: string, dayStr: string | null, yearStr: string | null): string | null {
  const m = MONTH[(monthStr || '').toLowerCase().slice(0, 3)];
  if (!m) return null;
  let day = dayStr ?? '';
  let yr = '2026';
  if (yearStr) {
    const n = parseInt(yearStr.replace(/'/g, ''));
    if (n >= 25) {
      yr = `20${String(n).padStart(2, '0')}`;
    } else {
      day = day || String(n);
      yr = '2026';
    }
  }
  return day ? `${yr}${m}${day.padStart(2, '0')}` : `${yr}${m}`;
}

// Normalize freeform position-detail quirks before parsing:
//   • collapse "@@" typos → a single "@"
//   • distribute a shared leading expiry — "Aug '26 $4C @ $0.90 and $5C @ $0.60" —
//     onto each bare leg, so both inherit the Aug '26 expiry.
function normalizeLegs(pd: string): string {
  const s = pd.replace(/@@+/g, '@');

  // Leading "MON 'YY" (optionally "MON DD 'YY") followed by bare "$strike C @ price"
  // legs joined by and / , / + / &.
  const lead = s.match(/^\s*([A-Za-z]{3,9})\s+(?:(\d{1,2})\s+)?'?(\d{2})\s+(\$?\d.*)$/);
  if (lead && MONTH[lead[1].toLowerCase().slice(0, 3)]) {
    const [, mon, day, yy, rest] = lead;
    const bare = /^\$?\d+\.?\d*\s*[CP]\s*@\s*\$?\d+\.?\d*$/i;
    const segs = rest.split(/\s+(?:and|,|\+|&)\s+/i).map((x) => x.trim());
    if (segs.some((seg) => bare.test(seg))) {
      const tail = day ? `${mon} ${day} '${yy}` : `${mon} '${yy}`;
      return segs
        .map((seg) => {
          const mm = seg.match(/^\$?(\d+\.?\d*)\s*([CP])\s*@\s*\$?(\d+\.?\d*)$/i);
          return mm ? `$${mm[1]}${mm[2].toUpperCase()} ${tail} @ $${mm[3]}` : seg;
        })
        .join(' + ');
    }
  }
  return s;
}

export function parseOptionLegs(positionDetail: string, ticker: string): OptionLeg[] {
  if (!positionDetail || ticker === 'CASH') return [];
  const detail = normalizeLegs(positionDetail);
  const legs: OptionLeg[] = [];

  const reA = /\$?(\d+\.?\d*)\s*([CP])\s+([A-Za-z]+)\s+(?:(\d{1,2})\s+'?(\d{2})|'?(\d{2}))\s*@\s*\$?(\d+\.?\d*)/gi;
  let m: RegExpExecArray | null;
  while ((m = reA.exec(detail)) !== null) {
    const expiry = toExpiry(m[3], m[4] || null, m[5] || m[6]);
    if (expiry) legs.push({ symbol: ticker, strike: parseFloat(m[1]), right: m[2].toUpperCase() as 'C' | 'P', expiry, entry: parseFloat(m[7]) });
  }

  const reB = /([A-Za-z]+)\s+'?(\d{2})\s+\$?(\d+\.?\d*)\s*([CP])\s*@\$?(\d+\.?\d*)/gi;
  while ((m = reB.exec(detail)) !== null) {
    const expiry = toExpiry(m[1], null, m[2]);
    if (expiry) legs.push({ symbol: ticker, strike: parseFloat(m[3]), right: m[4].toUpperCase() as 'C' | 'P', expiry, entry: parseFloat(m[5]) });
  }

  // Pattern C: month-only, no year/day — "$120C Sep @ $8.68". toExpiry defaults the
  // year, giving a YYYYMM expiry. Requires MONTH immediately before "@", so it never
  // collides with the dated forms above (those have a day/'YY between month and @).
  const reC = /\$?(\d+\.?\d*)\s*([CP])\s+([A-Za-z]+)\s*@\s*\$?(\d+\.?\d*)/gi;
  while ((m = reC.exec(detail)) !== null) {
    const expiry = toExpiry(m[3], null, null);
    if (expiry) legs.push({ symbol: ticker, strike: parseFloat(m[1]), right: m[2].toUpperCase() as 'C' | 'P', expiry, entry: parseFloat(m[4]) });
  }

  const seen = new Set<string>();
  return legs.filter((l) => {
    const key = `${l.strike}${l.right}${l.expiry}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Infer trade direction from a free-form `position_detail`. Conservative: only an explicit
// "short" reads as short; everything else (plain shares, calls, puts) is treated as long.
export function inferDirection(positionDetail: string | null): Direction {
  return /\bshort\b/i.test(positionDetail ?? '') ? 'short' : 'long';
}

// Extract the equity cost basis ("Common @ $X") from a position_detail string.
export function parseCostBasis(positionDetail: string | null): number | null {
  const m = (positionDetail ?? '').match(/Common\s*@\s*\$([0-9]+\.?[0-9]*)/i);
  return m ? parseFloat(m[1]) : null;
}

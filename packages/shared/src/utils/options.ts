export interface OptionLeg {
  symbol: string;
  strike: number;
  right: 'C' | 'P';
  expiry: string;
  entry: number;
}

const MONTH: Record<string, string> = {
  jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06',
  jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12',
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

export function parseOptionLegs(positionDetail: string, ticker: string): OptionLeg[] {
  if (!positionDetail || ticker === 'CASH') return [];
  const legs: OptionLeg[] = [];

  const reA = /\$?(\d+\.?\d*)\s*([CP])\s+([A-Za-z]+)\s+(?:(\d{1,2})\s+'?(\d{2})|'?(\d{2}))\s*@\s*\$?(\d+\.?\d*)/gi;
  let m: RegExpExecArray | null;
  while ((m = reA.exec(positionDetail)) !== null) {
    const expiry = toExpiry(m[3], m[4] || null, m[5] || m[6]);
    if (expiry) legs.push({ symbol: ticker, strike: parseFloat(m[1]), right: m[2].toUpperCase() as 'C' | 'P', expiry, entry: parseFloat(m[7]) });
  }

  const reB = /([A-Za-z]+)\s+'?(\d{2})\s+\$?(\d+\.?\d*)\s*([CP])\s*@\$?(\d+\.?\d*)/gi;
  while ((m = reB.exec(positionDetail)) !== null) {
    const expiry = toExpiry(m[1], null, m[2]);
    if (expiry) legs.push({ symbol: ticker, strike: parseFloat(m[3]), right: m[4].toUpperCase() as 'C' | 'P', expiry, entry: parseFloat(m[5]) });
  }

  // Pattern C: month-only, no year/day — "$120C Sep @ $8.68". toExpiry defaults the
  // year, giving a YYYYMM expiry. Requires MONTH immediately before "@", so it never
  // collides with the dated forms above (those have a day/'YY between month and @).
  const reC = /\$?(\d+\.?\d*)\s*([CP])\s+([A-Za-z]+)\s*@\s*\$?(\d+\.?\d*)/gi;
  while ((m = reC.exec(positionDetail)) !== null) {
    const expiry = toExpiry(m[3], null, null);
    if (expiry) legs.push({ symbol: ticker, strike: parseFloat(m[1]), right: m[2].toUpperCase() as 'C' | 'P', expiry, entry: parseFloat(m[4]) });
  }

  const seen = new Set<string>();
  return legs.filter(l => {
    const key = `${l.strike}${l.right}${l.expiry}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

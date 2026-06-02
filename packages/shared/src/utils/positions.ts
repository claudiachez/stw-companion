export type PositionType = 'shares' | 'options' | 'mixed';

// Classify a free-form `position_detail` string into shares / options / mixed.
// Mirrors the admin dashboard's parser exactly so both apps agree.
export function positionType(positionDetail: string | null): PositionType | null {
  const d = positionDetail ?? '';
  if (!d) return null;
  const hasShares  = /Common\s*@/i.test(d);
  const hasOptions = /\$[\d.]+[CP]\b|\b(options\s+only)\b|\d+[CP]\s+[@$]/i.test(d);
  if (hasShares && hasOptions) return 'mixed';
  if (hasOptions) return 'options';
  if (hasShares)  return 'shares';
  return null;
}

// Extract the equity cost basis ("Common @ $X") from a position_detail string.
export function parseCostBasis(positionDetail: string | null): number | null {
  const m = (positionDetail ?? '').match(/Common\s*@\s*\$([0-9]+\.?[0-9]*)/i);
  return m ? parseFloat(m[1]) : null;
}

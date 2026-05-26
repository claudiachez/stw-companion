export function formatPct(value: number, decimals = 1): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

export function formatDate(iso: string | null): string {
  if (!iso) return '–';
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

export function formatWeight(w: number | null): string {
  if (w == null) return '–';
  return `${w.toFixed(1)}%`;
}

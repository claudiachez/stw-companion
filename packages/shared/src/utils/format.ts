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

const ET_TZ = { timeZone: 'America/New_York' };

// Canonical timestamp format used across all surfaces: "Jun 4 · 7:46 PM ET"
export function fmtDateTime(val: Date | string | null): string {
  if (!val) return '—';
  const d = val instanceof Date ? val : new Date(val);
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...ET_TZ });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', ...ET_TZ });
  return `${date} · ${time} ET`;
}

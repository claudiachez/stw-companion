const LEVELS: Record<number, { label: string; color: string }> = {
  5: { label: 'HIGHEST', color: '#22c55e' },
  4: { label: 'HIGH', color: '#3b82f6' },
  3: { label: 'MODERATE', color: '#f59e0b' },
  2: { label: 'WANING', color: '#6b7280' },
  1: { label: 'CONCERN', color: '#ef4444' },
  0: { label: 'LEGACY', color: '#52525b' },
};

export function ConvictionBadge({ level }: { level: number }) {
  const { label, color } = LEVELS[level] ?? LEVELS[0];
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide"
      style={{ color, border: `1px solid ${color}22`, background: `${color}15` }}
    >
      {label}
    </span>
  );
}

const BIAS_COLORS: Record<string, { bg: string; text: string }> = {
  Bullish: { bg: '#22c55e22', text: '#22c55e' },
  Bearish: { bg: '#ef444422', text: '#ef4444' },
  Neutral: { bg: '#6b728022', text: '#9ca3af' },
};

export function BiasChip({ bias }: { bias: string }) {
  const style = BIAS_COLORS[bias] ?? BIAS_COLORS['Neutral'];
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-xs font-semibold"
      style={{ background: style.bg, color: style.text }}
    >
      {bias}
    </span>
  );
}

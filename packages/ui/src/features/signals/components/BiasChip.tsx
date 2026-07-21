import { FONT_SIZE, FONT_WEIGHT, gexBiasLabel } from '@stw/shared';

// Session-verdict bias pill. The label is the shared `gexBiasLabel` scorer's canonical
// word (Bullish / Bearish / Flat / Conflicted) — no re-derivation here — and the tone
// follows the redesign spec: bull → positive, bear → negative, flat/conflicted → warning,
// anything unreadable → neutral. Consumes only `status.*` CSS variables (theme-aware,
// no literal colors). Deliberately NOT a StatusPill: those variants carry fixed
// evaluation meanings ("breach" = a real limit exceeded), which would misread a
// directional market bias.
type Tone = 'positive' | 'negative' | 'warning' | 'neutral';

const TONE: Record<string, { tone: Tone; arrow: string }> = {
  Bullish:    { tone: 'positive', arrow: '↑' },
  Bearish:    { tone: 'negative', arrow: '↓' },
  Flat:       { tone: 'warning',  arrow: '→' },
  Conflicted: { tone: 'warning',  arrow: '⇅' },
};

export function BiasChip({ bias }: { bias: string }) {
  if (!bias) return null;
  const label = gexBiasLabel(bias); // Bullish | Bearish | Flat | Conflicted | —
  const { tone, arrow } = TONE[label] ?? { tone: 'neutral' as Tone, arrow: '' };
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold,
        padding: '3px 10px', borderRadius: 9999,
        whiteSpace: 'nowrap', flexShrink: 0,
        background: `var(--status-${tone}-bg)`,
        color: `var(--status-${tone}-text)`,
      }}
    >
      {arrow && <span aria-hidden style={{ fontWeight: FONT_WEIGHT.bold }}>{arrow}</span>}
      {label}
    </span>
  );
}

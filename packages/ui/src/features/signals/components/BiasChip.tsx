import { FONT_SIZE, FONT_WEIGHT, LETTER_SPACING, gexBiasLabel } from '@stw/shared';

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
        fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, letterSpacing: LETTER_SPACING.label,
        textTransform: 'uppercase', padding: '3px 10px', borderRadius: 6,
        whiteSpace: 'nowrap', flexShrink: 0,
        background: `var(--status-${tone}-bg)`,
        color: `var(--status-${tone}-text)`,
        border: `1px solid var(--status-${tone}-border)`,
      }}
    >
      {arrow && <span aria-hidden style={{ fontWeight: FONT_WEIGHT.bold }}>{arrow}</span>}
      {label}
    </span>
  );
}

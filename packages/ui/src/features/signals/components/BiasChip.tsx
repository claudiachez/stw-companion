import { FONT_SIZE, FONT_WEIGHT } from '@stw/shared';

// Exact port of the legacy admin bias chip: known bias keys get an arrow + color,
// anything else (e.g. "conflicted") falls back to a neutral gray chip showing the
// raw label.
//
// Deliberately NOT a StatusPill (design-system Phase 5 migration pass): bullish/bearish/
// flat-to-up/flat-to-down are directional market signals, not evaluation-status verdicts —
// forcing bullish→'ok' or bearish→'breach' would misuse those variants' fixed meanings
// ("breach" = a limit was actually exceeded, not "bearish"). This chip already consumes
// only CSS variables (var(--c3)/var(--acc)/var(--c1)/var(--t2), etc.) for its colors, so
// there's no literal-color bug to fix here — only the one raw fontSize below.
type BiasStyle = { bg: string; color: string };

// Theme-aware via CSS vars (tier backgrounds adapt for dark/light).
const BIAS: Record<string, { label: string; style: BiasStyle }> = {
  'flat-to-down': { label: '⬇ Flat-to-Down', style: { bg: 'var(--c3bg)', color: 'var(--c3)' } },
  'flat-to-up':   { label: '↑ Flat-to-Up',   style: { bg: 'var(--c5bg)', color: 'var(--acc)' } },
  'bullish':      { label: '↑ Bullish',       style: { bg: 'var(--c5bg)', color: 'var(--acc)' } },
  'bearish':      { label: '↓ Bearish',       style: { bg: 'var(--c1bg)', color: 'var(--c1)' } },
  'flat':         { label: '→ Flat',          style: { bg: 'var(--s2)', color: 'var(--t2)' } },
};

const FALLBACK: BiasStyle = { bg: 'var(--s2)', color: 'var(--t2)' };

export function BiasChip({ bias }: { bias: string }) {
  if (!bias) return null;
  const hit = BIAS[bias.toLowerCase()];
  const label = hit?.label ?? bias;
  const style = hit?.style ?? FALLBACK;
  return (
    <span
      style={{
        fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, padding: '2px 8px', borderRadius: 4,
        letterSpacing: '0.02em', flexShrink: 0, whiteSpace: 'nowrap',
        background: style.bg, color: style.color,
      }}
    >
      {label}
    </span>
  );
}

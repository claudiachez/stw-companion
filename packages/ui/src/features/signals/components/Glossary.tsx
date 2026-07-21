import { useState } from 'react';
import { FONT_SIZE, FONT_WEIGHT, LETTER_SPACING } from '@stw/shared';

// Collapsible plain-English glossary for the GEX terms on this page. Display-only.
const TERMS: { term: string; def: string }[] = [
  { term: 'GEX', def: 'Gamma exposure — dealer option positioning that shapes where intraday support and resistance tend to form.' },
  { term: 'Gamma flat (GEX1)', def: 'The pivot where dealer gamma flips: above it dealers dampen moves (grind), below it they amplify moves (breaks accelerate).' },
  { term: 'Put support / Call resistance', def: 'Dealer-heavy strikes that tend to slow or reverse price — support below spot, resistance above.' },
  { term: 'Key target / Downside risk', def: "The read's upside objective and the level that would invalidate it." },
  { term: 'Verdicts', def: 'All ✓ — Enter = full entry · Half size = reduced size · Skip today = stand aside.' },
];

export function Glossary() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 13px', background: 'var(--s2)', border: 'none', borderBottom: open ? '1px solid var(--bsub)' : 'none',
          cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
        }}
      >
        <span style={{ fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.bold, textTransform: 'uppercase', letterSpacing: LETTER_SPACING.label, color: 'var(--t2)' }}>📖 Glossary</span>
        <span style={{ marginLeft: 'auto', fontSize: FONT_SIZE['2xs'], color: 'var(--t3)' }}>{open ? 'Hide ▲' : 'Show ▼'}</span>
      </button>
      {open && (
        <div style={{ padding: '4px 0' }}>
          {TERMS.map((t) => (
            <div key={t.term} style={{ padding: '8px 13px', display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: FONT_SIZE.sms, fontWeight: FONT_WEIGHT.bold, color: 'var(--text)' }}>{t.term}</span>
              <span style={{ fontSize: FONT_SIZE.xs, color: 'var(--t2)', lineHeight: 1.5 }}>{t.def}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

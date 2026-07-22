import { useState } from 'react';
import { FONT_SIZE, FONT_WEIGHT } from '@stw/shared';

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
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow)', padding: '12px 16px' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)',
          fontSize: FONT_SIZE.xs, padding: 0, textDecoration: 'underline', fontFamily: 'inherit',
        }}
      >
        {open ? 'Hide the plain-English glossary' : '? What do these terms mean'}
      </button>
      {open && (
        <div style={{ marginTop: 8, fontSize: FONT_SIZE.xs, color: 'var(--t2)', lineHeight: 1.7 }}>
          {TERMS.map((t, i) => (
            <span key={t.term}>
              <b style={{ color: 'var(--text)', fontWeight: FONT_WEIGHT.bold }}>{t.term}</b> — {t.def}
              {i < TERMS.length - 1 && <br />}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

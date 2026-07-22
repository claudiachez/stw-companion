import { useState, type ReactNode } from 'react';
import { FONT_SIZE, FONT_WEIGHT } from '@stw/shared';

/**
 * A small ⓘ toggle that reveals a "what / why / how" help blurb in a popover —
 * the same collapsible-help pattern the Macro modules use (macroVisuals'
 * ModuleHeader), promoted to a shared primitive so the Risk page can reuse it
 * without importing across features. Drop it next to any section title:
 *
 *   <span>Gross exposure <HelpToggle ariaLabel="About gross exposure">…</HelpToggle></span>
 *
 * Author the content with block spans (e.g. `<span className="block">…</span>`)
 * — the popover is a span, so nested <div> would be invalid markup.
 */
export function HelpToggle({ children, ariaLabel = 'What is this?' }: { children: ReactNode; ariaLabel?: string }) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  // Ref style: an 18px circle with a bold "i", muted --s2 by default, filling to accent on
  // hover/open. (The glossary "?" text link is a separate affordance and stays as-is.)
  const active = open || hover;
  return (
    <span style={{ position: 'relative', display: 'inline-flex', verticalAlign: 'middle' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        aria-label={open ? 'Hide explanation' : ariaLabel}
        aria-expanded={open}
        style={{
          width: 18, height: 18, borderRadius: '50%',
          border: `1px solid ${active ? 'var(--acc)' : 'var(--border)'}`,
          background: active ? 'var(--acc)' : 'var(--s2)',
          color: active ? 'var(--text-inverse)' : 'var(--t3)',
          fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.bold, lineHeight: 1,
          cursor: 'pointer', padding: 0, flexShrink: 0,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        i
      </button>
      {open && (
        <>
          {/* click-away catcher */}
          <span onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <span
            role="tooltip"
            style={{
              position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 41,
              display: 'block', width: 280, maxWidth: '78vw',
              fontSize: FONT_SIZE.sm, color: 'var(--t2)', lineHeight: 1.5,
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
              padding: '10px 12px', boxShadow: 'var(--shadow)',
              textTransform: 'none', letterSpacing: 'normal', fontWeight: 400,
            }}
          >
            {children}
          </span>
        </>
      )}
    </span>
  );
}

import type { Config } from 'tailwindcss';
import { FONT_SIZE, RADIUS, BREAKPOINT } from '@stw/shared';

export default {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg:      'var(--bg)',
        surface: 'var(--surface)',
        s2:      'var(--s2)',
        border:  'var(--border)',
        bsub:    'var(--bsub)',
        text:    'var(--text)',
        t2:      'var(--t2)',
        t3:      'var(--t3)',
        acc:     'var(--acc)',
        // Semantic additions (docs/design-system/tokens.md) — new roles, existing
        // color values still come from packages/ui/src/styles/tokens.css.
        'surface-hover':  'var(--surface-hover)',
        'surface-inset':  'var(--surface-inset)',
        'border-strong':  'var(--border-strong)',
        'text-inverse':   'var(--text-inverse)',
        'pnl-gain':       'var(--pnl-gain)',
        'pnl-loss':       'var(--pnl-loss)',
      },
      fontFamily: {
        display: ['"Barlow Condensed"', 'sans-serif'],
        sans:    ['system-ui', 'sans-serif'],
      },
      // Only the two sizes Tailwind's default scale doesn't already have a name
      // for. Deliberately NOT overriding xs/sm/base/lg here — Tailwind's own
      // defaults for those (12/14/16/18px) differ slightly from
      // packages/shared/src/constants/tokens.ts's FONT_SIZE (11/12/14/18px), and
      // existing `text-xs`/`text-sm`/`text-lg` call sites already render with
      // Tailwind's defaults — remapping those keys would silently change already-
      // shipped pages, which this phase explicitly must not do. FONT_SIZE remains
      // the source of truth for new inline-style code; Tailwind's own scale stays
      // authoritative for existing Tailwind-class call sites until a deliberate
      // Phase 4 migration reconciles the two.
      fontSize: {
        '2xs':    `${FONT_SIZE['2xs']}px`,
        display:  `${FONT_SIZE.display}px`,
      },
      borderRadius: {
        sm: `${RADIUS.sm}px`,
        DEFAULT: `${RADIUS.DEFAULT}px`,
        md: `${RADIUS.md}px`,
        lg: `${RADIUS.lg}px`,
        xl: `${RADIUS.xl}px`,
        full: `${RADIUS.full}px`,
      },
      screens: {
        mobile: `${BREAKPOINT.mobile}px`,
      },
    },
  },
  plugins: [],
} satisfies Config;

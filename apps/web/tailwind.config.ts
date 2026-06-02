import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
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
      },
      fontFamily: {
        display: ['"Barlow Condensed"', 'sans-serif'],
        sans:    ['system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;

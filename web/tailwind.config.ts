import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0a0a0a',
        surface: '#111111',
        s2: '#1a1a1a',
        border: '#2a2a2a',
        bsub: '#1f1f1f',
        text: '#f0f0f0',
        t2: '#a0a0a0',
        t3: '#525252',
        acc: '#22c55e',
        c5: '#22c55e',
        c4: '#3b82f6',
        c3: '#f59e0b',
        c2: '#6b7280',
        c1: '#ef4444',
        c0: '#52525b',
      },
      fontFamily: {
        display: ['"Barlow Condensed"', 'sans-serif'],
        sans: ['system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;

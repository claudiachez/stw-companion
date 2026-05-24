/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        bg: '#0a0a0a',
        surface: '#111111',
        s2: '#1a1a1a',
        border: '#2a2a2a',
        bsub: '#1f1f1f',
        primary: '#f0f0f0',
        t2: '#a0a0a0',
        t3: '#525252',
        acc: '#22c55e',
      },
    },
  },
  plugins: [],
}

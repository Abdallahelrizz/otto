/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', 'system-ui', 'sans-serif'],
        mono: ['Geist Mono', 'monospace'],
      },
      animation: {
        'pulse-fast': 'pulse 1s cubic-bezier(0.4,0,0.6,1) infinite',
      },
    },
  },
  plugins: [],
};

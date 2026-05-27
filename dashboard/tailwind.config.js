/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          accent: '#a13c3f',
          success: '#22c55e',
          error: '#ef4444',
          warning: '#f59e0b',
        },
      },
      fontFamily: {
        sans: ['Geist', 'system-ui', 'sans-serif'],
        mono: ['Geist Mono', 'Consolas', 'monospace'],
      },
      borderRadius: {
        '2': '0.125rem',
        '4': '0.25rem',
        '8': '0.5rem',
      },
    },
  },
  plugins: [],
};

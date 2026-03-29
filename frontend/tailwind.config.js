/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // Override gray → warm walnut/coffee tones so every bg-gray-* / text-gray-* adopts the warm theme
      colors: {
        gray: {
          950: '#0e0b08',   // near-black walnut
          900: '#181210',   // dark espresso
          850: '#1c1510',   // between 900 and 800
          800: '#2a1f1a',   // walnut card
          750: '#2e2420',   // slightly lighter card
          700: '#3d2e27',   // border / elevated
          600: '#5c443a',   // subtle border
          500: '#7a5c4e',   // muted text
          400: '#9e7b68',   // secondary text
          300: '#c4a48e',   // subdued text
          200: '#ddc8b5',   // body text
          100: '#ede0d3',   // heading
          50:  '#f7f0e8',   // near-white cream
        },
        // Override blue → warm amber (primary actions, highlights, focus rings)
        blue: {
          950: '#1a0e00',
          900: '#3d2200',
          800: '#6b3a00',
          700: '#8f5100',
          600: '#b36800',   // btn-primary
          500: '#d48200',   // hover, active, focus
          400: '#f0a030',   // accent text
          300: '#f7bf6a',   // light accent
          200: '#fbd89a',   // very light accent
          100: '#fdf0d5',   // near-white amber
          50:  '#fffbf0',
        },
        // Warm green for positive/investments (moss)
        emerald: {
          950: '#021a08',
          900: '#053d15',
          800: '#0a5c20',
          700: '#156b2a',
          600: '#2a7a35',
          500: '#3d9048',
          400: '#55ab60',
          300: '#78c080',
          200: '#a8d8ae',
          100: '#d4ecd7',
          50:  '#eef8ef',
        },
        // Warm red for debt/negative (embers/rust)
        red: {
          950: '#1a0504',
          900: '#3d0e08',
          800: '#6b1a10',
          700: '#8b2a1a',
          600: '#b03520',
          500: '#cc4432',
          400: '#e06050',
          300: '#e88878',
          200: '#f0b0a5',
          100: '#f8d8d2',
          50:  '#fdf0ee',
        },
        // Purple → warm ink/violet (PSLF, special)
        purple: {
          900: '#1e1535',
          800: '#2d2050',
          700: '#3d2d6b',
          600: '#5245a0',
          500: '#6b5fb5',
          400: '#8b7fd4',
          300: '#aea5e0',
          200: '#d0caf0',
          100: '#eae8f8',
          50:  '#f5f4fc',
        },
        // Teal → warm sage (giving, accumulated)
        teal: {
          900: '#0a1f1c',
          800: '#123830',
          700: '#1e5045',
          600: '#2d6b5e',
          500: '#3d8a79',
          400: '#56a897',
          300: '#7ec5b5',
          200: '#aaddd3',
          100: '#d2eeea',
          50:  '#eef8f6',
        },
        // Cyan → cooler sage accent
        cyan: {
          600: '#1e7a72',
          500: '#28988e',
          400: '#40b8ae',
          300: '#68cfc7',
          200: '#a0e4de',
          100: '#d0f4f1',
          50:  '#ecfaf9',
        },
        // Orange → warm spice (home equity, secondary accent)
        orange: {
          900: '#2a1200',
          800: '#5a2800',
          700: '#8a4000',
          600: '#b35a00',
          500: '#d47520',
          400: '#e89548',
          300: '#f0b878',
          200: '#f8d8ae',
          100: '#fdf0d8',
          50:  '#fffbf0',
        },
        // Amber — kept as warm accent
        amber: {
          950: '#1a0f00',
          900: '#3d2200',
          800: '#6b3a00',
          700: '#8f5100',
          600: '#b36800',
          500: '#d48200',
          400: '#f0a030',
          300: '#f7bf6a',
          200: '#fbd89a',
          100: '#fdf0d5',
          50:  '#fffbf0',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
        serif: ['Georgia', 'serif'],
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}

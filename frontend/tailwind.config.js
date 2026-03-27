/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Solomon brand palette — deep navy with gold accent
        solomon: {
          50:  '#f0f4ff',
          100: '#dce5ff',
          200: '#b9ccff',
          300: '#86a8ff',
          400: '#4d7eff',
          500: '#1a54ff',
          600: '#0033f5',
          700: '#0028e0',
          800: '#0021b5',
          900: '#00188e',
          950: '#000d5c',
        },
        gold: {
          50:  '#fefce8',
          100: '#fef9c3',
          200: '#fef08a',
          300: '#fde047',
          400: '#facc15',
          500: '#eab308',
          600: '#ca8a04',
          700: '#a16207',
          800: '#854d0e',
          900: '#713f12',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}

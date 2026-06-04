/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        parchment: {
          50: '#fdf8f0',
          100: '#f5e6c8',
          200: '#e8c97a',
          300: '#d4a843',
        },
        ember: {
          400: '#c0392b',
          500: '#922b21',
          600: '#641e16',
        },
        slate: {
          850: '#1a2332',
          900: '#0f1923',
          950: '#070d14',
        },
        forest: {
          600: '#1a4731',
          700: '#0f3320',
          800: '#081a10',
        },
      },
      fontFamily: {
        serif: ['Georgia', 'Cambria', '"Times New Roman"', 'serif'],
        fantasy: ['"Palatino Linotype"', 'Palatino', 'Georgia', 'serif'],
      },
      backgroundImage: {
        'dark-texture': "url('/textures/dark-stone.jpg')",
      },
      animation: {
        'dice-roll': 'spin 0.5s ease-out',
        'fade-in': 'fadeIn 0.5s ease-in',
        'flicker': 'flicker 3s infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        flicker: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.85' },
          '75%': { opacity: '0.95' },
        },
      },
    },
  },
  plugins: [],
}

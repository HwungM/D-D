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
        serif: ['"EB Garamond"', 'Georgia', 'Cambria', '"Times New Roman"', 'serif'],
        fantasy: ['Cinzel', '"Palatino Linotype"', 'Palatino', 'Georgia', 'serif'],
      },
      backgroundImage: {
        'dark-texture': "url('/textures/dark-stone.jpg')",
      },
      animation: {
        'dice-roll': 'spin 0.5s ease-out',
        'fade-in': 'fadeIn 0.5s ease-in',
        'flicker': 'flicker 3s infinite',
        'ember': 'emberFloat 8s ease-in infinite',
        'pulse-glow': 'pulseGlow 3s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        flicker: {
          '0%, 100%': { opacity: '1' },
          '20%': { opacity: '0.88' },
          '40%': { opacity: '0.96' },
          '50%': { opacity: '0.82' },
          '60%': { opacity: '0.98' },
          '75%': { opacity: '0.9' },
          '90%': { opacity: '0.95' },
        },
        emberFloat: {
          '0%': { transform: 'translateY(0) translateX(0)', opacity: '0.9' },
          '25%': { transform: 'translateY(-25vh) translateX(8px)', opacity: '0.7' },
          '50%': { transform: 'translateY(-50vh) translateX(-6px)', opacity: '0.4' },
          '75%': { transform: 'translateY(-75vh) translateX(4px)', opacity: '0.15' },
          '100%': { transform: 'translateY(-100vh) translateX(-2px)', opacity: '0' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 20px #c0392b44, 0 0 40px #c0392b22' },
          '50%': { boxShadow: '0 0 40px #c0392b88, 0 0 80px #c0392b44' },
        },
      },
    },
  },
  plugins: [],
}

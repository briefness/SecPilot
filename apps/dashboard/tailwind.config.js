/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#07070a',
        foreground: '#fafafa',
        muted: {
          DEFAULT: '#18181b',
          foreground: '#71717a',
        },
        accent: {
          DEFAULT: '#18181b',
          foreground: '#fafafa',
        },
        popover: {
          DEFAULT: '#0c0c10',
          foreground: '#fafafa',
        },
        card: {
          DEFAULT: '#0c0c10',
          foreground: '#fafafa',
        },
        border: '#1f1f23',
        input: '#1f1f23',
        ring: '#e4e4e7',
        primary: {
          DEFAULT: '#fafafa',
          foreground: '#0a0a0f',
        },
        secondary: {
          DEFAULT: '#18181b',
          foreground: '#fafafa',
        },
        destructive: {
          DEFAULT: '#ef4444',
          foreground: '#fafafa',
        },
        risk: {
          critical: '#f87171',
          high: '#fb923c',
          medium: '#facc15',
          low: '#4ade80',
          info: '#60a5fa',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in': {
          '0%': { opacity: '0', transform: 'translateX(-8px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-in': 'slide-in 0.2s ease-out',
      },
    },
  },
  plugins: [],
}

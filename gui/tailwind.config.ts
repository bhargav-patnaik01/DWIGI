import type { Config } from 'tailwindcss';
// Static ESM import, not `require`. This file is an ES module (`import` above,
// `export default` below), so `require` is not in scope when the loader
// evaluates it as one. `tailwindcss-animate` is CommonJS with `export =`, which
// a default import resolves correctly under esModuleInterop.
import animate from 'tailwindcss-animate';

/**
 * Colour is defined once, as CSS variables in globals.css, and referenced here
 * by name. Themes therefore swap variables rather than class names, so no
 * component ever contains `dark:` branching for colour.
 */
const config: Config = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'hsl(var(--canvas))',
        surface: 'hsl(var(--surface))',
        elevated: 'hsl(var(--elevated))',
        line: 'hsl(var(--line))',
        ink: 'hsl(var(--ink))',
        muted: 'hsl(var(--muted))',
        faint: 'hsl(var(--faint))',
        accent: 'hsl(var(--accent))',
        'accent-ink': 'hsl(var(--accent-ink))',
        positive: 'hsl(var(--positive))',
        caution: 'hsl(var(--caution))',
        critical: 'hsl(var(--critical))',
      },
      borderRadius: {
        lg: '0.75rem',
        xl: '1rem',
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.02em' }],
      },
      maxWidth: {
        reading: '46rem',
      },
      transitionTimingFunction: {
        // Slightly overshoot-free ease used for every interactive transition,
        // so motion across the app feels like one system.
        quiet: 'cubic-bezier(0.32, 0.72, 0, 1)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        breathe: {
          '0%, 100%': { opacity: '0.35' },
          '50%': { opacity: '1' },
        },
      },
      animation: {
        'fade-up': 'fade-up 220ms cubic-bezier(0.32, 0.72, 0, 1) both',
        breathe: 'breathe 1.8s ease-in-out infinite',
      },
    },
  },
  plugins: [animate],
};

export default config;

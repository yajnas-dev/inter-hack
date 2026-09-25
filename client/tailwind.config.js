/** Tailwind is used only by the animated sign-in blocks in src/components/ui. Preflight stays off so the
 *  hand-written Cobalt CSS is not reset; the blocks get a scoped reset in styles/anim-auth.css instead. */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // Follows the app's own theme switch: data-theme="dark", or the OS setting when no choice was saved.
  darkMode: [
    'variant',
    [
      '@media (prefers-color-scheme: dark) { &:not(:where([data-theme="light"], [data-theme="light"] *)) }',
      '&:where([data-theme="dark"], [data-theme="dark"] *)'
    ]
  ],
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background) / <alpha-value>)',
        foreground: 'hsl(var(--foreground) / <alpha-value>)',
        skeleton: 'hsl(var(--skeleton) / <alpha-value>)',
        border: 'hsl(var(--btn-border) / <alpha-value>)',
        input: 'hsl(var(--input) / <alpha-value>)'
      },
      borderRadius: { DEFAULT: '0.5rem' },
      boxShadow: {
        input: [
          '0px 2px 3px -1px rgba(0, 0, 0, 0.1)',
          '0px 1px 0px 0px rgba(25, 28, 33, 0.02)',
          '0px 0px 0px 1px rgba(25, 28, 33, 0.08)'
        ].join(', ')
      },
      animation: {
        ripple: 'ripple 2s ease calc(var(--i, 0) * 0.2s) infinite',
        orbit: 'orbit calc(var(--duration) * 1s) linear infinite'
      },
      keyframes: {
        ripple: {
          '0%, 100%': { transform: 'translate(-50%, -50%) scale(1)' },
          '50%': { transform: 'translate(-50%, -50%) scale(0.9)' }
        },
        orbit: {
          '0%': { transform: 'rotate(0deg) translateY(calc(var(--radius) * 1px)) rotate(0deg)' },
          '100%': { transform: 'rotate(360deg) translateY(calc(var(--radius) * 1px)) rotate(-360deg)' }
        }
      }
    }
  }
};

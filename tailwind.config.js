/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/renderer/**/*.html',
    './src/renderer/**/*.js',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: 'var(--color-bg)',
        surface: 'var(--color-surface)',
        'surface-2': 'var(--color-surface-2)',
        'surface-3': 'var(--color-surface-3)',
        control: 'var(--color-control)',
        border: 'var(--color-border)',
        'border-strong': 'var(--color-border-strong)',
        fg: 'var(--color-fg)',
        'fg-muted': 'var(--color-fg-muted)',
        accent: 'var(--color-accent)',
        'accent-fg': 'var(--color-accent-fg)',
        'accent-soft': 'var(--color-accent-soft)',
        'accent-line': 'var(--color-accent-line)',
        danger: 'var(--color-danger)',
        success: 'var(--color-success)',
      },
      spacing: {
        card: 'var(--space-card-gap)',
      },
      borderRadius: {
        card: 'var(--radius-card)',
        control: 'var(--radius-control)',
        'control-sm': 'var(--radius-control-sm)',
        xs: 'var(--radius-xs)',
        pill: 'var(--radius-pill)',
      },
      boxShadow: {
        popover: 'var(--shadow-popover)',
      },
      fontFamily: {
        sans: 'var(--font-sans)',
        mono: 'var(--font-mono)',
      },
    },
  },
  plugins: [],
};

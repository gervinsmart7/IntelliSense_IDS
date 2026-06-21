/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'bg-primary': '#0F1117',
        'bg-card': '#1A1D27',
        'bg-elevated': '#22263A',
        'accent': '#6366F1',
        'accent-hover': '#4F46E5',
        'success': '#34D399',
        'warning': '#FBBF24',
        'danger': '#F87171',
        'info': '#60A5FA',
        'text-primary': '#E2E8F0',
        'text-muted': '#64748B',
      },
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
        display: ['Syne', 'sans-serif']
      }
    },
  },
  plugins: [
    require('@tailwindcss/forms')
  ],
}

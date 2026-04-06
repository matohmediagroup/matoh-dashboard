import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: '#191919',
        surface: '#202020',
        surface2: '#252525',
        border: '#2e2e2e',
        text: '#e8e8e8',
        muted: '#888888',
        accent: '#4f8ef7',
        'accent-hover': '#3a7de8',
        // Status colors
        filmed: '#10b981',
        'not-filmed': '#6b7280',
        'in-progress': '#4f8ef7',
        revisions: '#f59e0b',
        done: '#10b981',
        overdue: '#ef4444',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '8px',
        chip: '4px',
      },
    },
  },
  plugins: [],
}

export default config

// Tailwind setup. Includes our dark color palette and Inter font defaults.
export default {
  content: ['./src/**/*.{js,jsx,ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        bg: '#1a1a2e',
        bgSoft: '#22223b',
        accent: '#6c63ff',
        accentSoft: '#8a82ff',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl2: '16px',
      },
    },
  },
  plugins: [],
};

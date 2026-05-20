/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg:         '#0f0f1a',
        accent:     '#7c6af7',
        accentSoft: '#a89dfc',
      },
    },
  },
  plugins: [],
};

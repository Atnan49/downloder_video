/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bgPrimary: '#000000',
        bgCard: 'rgba(255, 255, 255, 0.03)',
      },
    },
  },
  plugins: [],
}

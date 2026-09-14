/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "var(--brand)",
          dark: "var(--brand-dark)",
        },
      },
      fontFamily: {
        sans: ["IBM Plex Sans", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
};

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#ECF6F4",
          100: "#D3EBE7",
          200: "#A6D6CE",
          400: "#2FB49A",
          500: "#12A58A",
          600: "#0F8A78",
          700: "#0F6E6A",
          800: "#0D5552",
          900: "#12302E",
        },
        canvas: "#F4F7F7",
        ink: "#12302E",
      },
      fontFamily: {
        sans: ['"DM Sans"', "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl: "12px",
      },
    },
  },
  plugins: [],
};

import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        govNavy: "#0f172a",
        govBlue: "#1d4ed8",
        govBlueHover: "#1e40af",
        govBg: "#f8fafc",
        govBorder: "#cbd5e1",
      },
      fontFamily: {
        sans: ["Inter", "Noto Sans Sinhala", "Noto Sans Tamil", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;

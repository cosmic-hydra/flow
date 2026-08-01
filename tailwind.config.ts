import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#061018",
          900: "#0a1a24",
          800: "#122836",
          700: "#1a384c",
          600: "#24506a",
        },
        tide: {
          50: "#eef9f8",
          100: "#d5f0ee",
          200: "#a9e0dc",
          300: "#6ec9c4",
          400: "#3aada8",
          500: "#20918e",
          600: "#187473",
          700: "#165d5d",
        },
        ember: {
          300: "#ffc089",
          400: "#ff9a4d",
          500: "#f07316",
          600: "#d1550c",
        },
        sand: {
          50: "#f7f4ef",
          100: "#ebe4d8",
          200: "#d9ccb8",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 0 60px rgba(58, 173, 168, 0.18)",
        panel: "0 24px 80px rgba(6, 16, 24, 0.45)",
      },
      backgroundImage: {
        aurora:
          "radial-gradient(ellipse 80% 60% at 20% 10%, rgba(58,173,168,0.28), transparent 55%), radial-gradient(ellipse 70% 50% at 85% 20%, rgba(240,115,22,0.18), transparent 50%), radial-gradient(ellipse 60% 40% at 50% 100%, rgba(32,145,142,0.22), transparent 60%)",
        mesh: "linear-gradient(145deg, #061018 0%, #0a1a24 40%, #122836 100%)",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-8px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: " -200% 0" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "0.55" },
          "50%": { opacity: "1" },
        },
      },
      animation: {
        float: "float 6s ease-in-out infinite",
        shimmer: "shimmer 3.5s linear infinite",
        "pulse-soft": "pulseSoft 2.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;

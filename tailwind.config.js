/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Tokens Fluent Win11 — accent escurecido para contraste WCAG AA com texto branco
        accent: {
          DEFAULT: "#0078D4",
          hover: "#006CBD",
          pressed: "#005A9E",
        },
        background: {
          DEFAULT: "rgba(243, 243, 243, 0.6)",
          dark: "rgba(32, 32, 32, 0.6)",
        },
        card: {
          DEFAULT: "rgba(255, 255, 255, 0.7)",
          hover: "rgba(255, 255, 255, 0.85)",
          dark: "rgba(44, 44, 44, 0.7)",
          darkHover: "rgba(59, 59, 59, 0.85)",
        },
        stroke: {
          DEFAULT: "rgba(0, 0, 0, 0.08)",
          dark: "rgba(255, 255, 255, 0.08)",
        },
        text: {
          primary: "#1A1A1A",
          secondary: "#5F5F5F",
          darkPrimary: "#FFFFFF",
          darkSecondary: "#C5C5C5",
        },
        danger: {
          DEFAULT: "#C42B1C",
          hover: "#D8332C",
          soft: "rgba(196, 43, 28, 0.1)",
        },
        success: "#6FB700",
        warning: "#F7630C",
      },
      borderRadius: {
        fluent: "8px",
        fluentLg: "12px",
        fluentXl: "16px",
      },
      boxShadow: {
        fluent: "0 2px 8px rgba(0, 0, 0, 0.08)",
        fluentLg: "0 8px 24px rgba(0, 0, 0, 0.12)",
      },
      fontFamily: {
        sans: ['"Segoe UI Variable"', '"Segoe UI"', "system-ui", "sans-serif"],
      },
      animation: {
        "fade-in": "fadeIn 200ms ease-out",
        "slide-up": "slideUp 200ms ease-out",
        "scale-in": "scaleIn 150ms ease-out",
      },
      keyframes: {
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp: { from: { opacity: 0, transform: "translateY(8px)" }, to: { opacity: 1, transform: "translateY(0)" } },
        scaleIn: { from: { opacity: 0, transform: "scale(0.96)" }, to: { opacity: 1, transform: "scale(1)" } },
      },
    },
  },
  plugins: [],
};

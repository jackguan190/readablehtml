import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: [
          "var(--font-serif)",
          '"Iowan Old Style"',
          "Baskerville",
          '"Source Serif Pro"',
          "Georgia",
          "serif",
        ],
        sans: [
          "var(--font-sans)",
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      colors: {
        ink: {
          DEFAULT: "rgb(var(--ink) / <alpha-value>)",
          muted: "rgb(var(--ink-muted) / <alpha-value>)",
          subtle: "rgb(var(--ink-subtle) / <alpha-value>)",
          faint: "rgb(var(--ink-faint) / <alpha-value>)",
        },
        paper: {
          DEFAULT: "rgb(var(--paper) / <alpha-value>)",
          raised: "rgb(var(--paper-raised) / <alpha-value>)",
          sunken: "rgb(var(--paper-sunken) / <alpha-value>)",
          deep: "rgb(var(--paper-deep) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          soft: "rgb(var(--accent-soft) / <alpha-value>)",
          ink: "rgb(var(--accent-ink) / <alpha-value>)",
        },
        line: {
          DEFAULT: "rgb(var(--line) / <alpha-value>)",
          strong: "rgb(var(--line-strong) / <alpha-value>)",
        },
        highlight: "rgb(var(--highlight) / <alpha-value>)",
        good: "rgb(var(--good) / <alpha-value>)",
      },
      boxShadow: {
        soft: "0 1px 2px rgba(15, 12, 8, 0.04), 0 4px 12px rgba(15, 12, 8, 0.04)",
        lift: "0 1px 2px rgba(15, 12, 8, 0.04), 0 8px 24px rgba(15, 12, 8, 0.06), 0 24px 48px rgba(15, 12, 8, 0.08)",
        glow: "0 0 0 1px rgb(var(--accent) / 0.25), 0 8px 24px rgb(var(--accent) / 0.15)",
        inset: "inset 0 1px 0 rgb(255 255 255 / 0.04)",
      },
      letterSpacing: {
        tightish: "-0.012em",
        eyebrow: "0.14em",
      },
      maxWidth: {
        reading: "64ch",
        page: "1480px",
      },
      animation: {
        "fade-in": "fade-in 240ms ease-out both",
        "slide-up": "slide-up 280ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "slide-in-right": "slide-in-right 280ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "slide-in-left": "slide-in-left 280ms cubic-bezier(0.16, 1, 0.3, 1) both",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          "0%": { transform: "translateX(100%)" },
          "100%": { transform: "translateX(0)" },
        },
        "slide-in-left": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;

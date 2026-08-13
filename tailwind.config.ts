import type { Config } from "tailwindcss";

/**
 * The original four colours (ivory, espresso, amber, muted) are kept so that no existing screen breaks,
 * but they are now aliases onto the token scale rather than the whole vocabulary. New work should use the
 * semantic names: surface/raised for backgrounds, line for borders, ink for text.
 */
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // legacy names, mapped to the tokens so old and new markup agree
        ivory: "var(--canvas)",
        espresso: "var(--ink)",
        amber: "var(--warn)",
        muted: "var(--ink-soft)",

        canvas: "var(--canvas)",
        raised: "var(--raised)",
        sunken: "var(--sunken)",
        line: { DEFAULT: "var(--line)", strong: "var(--line-strong)" },
        ink: { DEFAULT: "var(--ink)", soft: "var(--ink-soft)", faint: "var(--ink-faint)" },
        accent: { DEFAULT: "var(--accent)", soft: "var(--accent-soft)", ink: "var(--accent-ink)" },
        ok: { DEFAULT: "var(--ok)", soft: "var(--ok-soft)" },
        warn: { DEFAULT: "var(--warn)", soft: "var(--warn-soft)" },
        danger: { DEFAULT: "var(--danger)", soft: "var(--danger-soft)" },
      },
      borderRadius: { DEFAULT: "var(--radius)", lg: "var(--radius-lg)" },
      boxShadow: {
        sm: "var(--shadow-sm)",
        DEFAULT: "var(--shadow)",
        lg: "var(--shadow-lg)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
} satisfies Config;

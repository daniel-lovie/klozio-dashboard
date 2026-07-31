import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ivory: "#FAF5EC",
        espresso: "#3E2E23",
        amber: "#E08A1E",
        muted: "#8C7D70",
      },
    },
  },
} satisfies Config;

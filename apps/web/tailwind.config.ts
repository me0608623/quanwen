import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/features/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // shadcn / app 既有語意色（app navbar、dashboard、globals @apply 依賴，勿刪）
        primary: { DEFAULT: "#2563eb", foreground: "#ffffff" },
        secondary: { DEFAULT: "#f1f5f9", foreground: "#0f172a" },
        destructive: { DEFAULT: "#dc2626", foreground: "#ffffff" },
        muted: { DEFAULT: "#f8fafc", foreground: "#64748b" },
        accent: { DEFAULT: "#f1f5f9", foreground: "#0f172a" },
        border: "#e2e8f0",
        input: "#e2e8f0",
        ring: "#2563eb",
        background: "#ffffff",
        foreground: "#0f172a",
        // QuanWen 行銷頁設計 token（對應 globals.css 的 --q-*）
        q: {
          canvas: "var(--q-canvas)",
          coral: "var(--q-primary)",
          ink: "var(--q-ink)",
          dark: "var(--q-surface-dark)",
          card: "var(--q-surface-card)",
          soft: "var(--q-surface-soft)",
        },
      },
      borderRadius: {
        lg: "0.5rem",
        md: "calc(0.5rem - 2px)",
        sm: "calc(0.5rem - 4px)",
      },
      fontFamily: {
        serif: ["var(--font-serif-latin)", "var(--font-serif-cjk)", "serif"],
        sans: [
          "var(--font-sans-latin)",
          "var(--font-sans-cjk)",
          "-apple-system",
          "PingFang TC",
          "Microsoft JhengHei",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;

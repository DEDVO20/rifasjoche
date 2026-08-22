import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "primary-fixed": "#dae2fd",
        "on-error-container": "#93000a",
        "surface-bright": "#f8f9ff",
        "on-background": "#0b1c30",
        "outline": "#76777d",
        "on-secondary-fixed": "#251a00",
        "on-tertiary-fixed-variant": "#005321",
        "inverse-primary": "#bec6e0",
        "error": "#ba1a1a",
        "surface-dim": "#cbdbf5",
        "inverse-surface": "#213145",
        "on-primary-container": "#7c839b",
        "surface": "#f8f9ff",
        "primary": "#000000",
        "on-tertiary-container": "#009844",
        "on-tertiary-fixed": "#002109",
        "on-primary-fixed": "#131b2e",
        "secondary-fixed-dim": "#f7be1d",
        "surface-container-highest": "#d3e4fe",
        "primary-container": "#131b2e",
        "primary-fixed-dim": "#bec6e0",
        "on-primary-fixed-variant": "#3f465c",
        "tertiary-fixed-dim": "#4ae176",
        "on-surface": "#0b1c30",
        "tertiary-fixed": "#6bff8f",
        "surface-container-lowest": "#ffffff",
        "background": "#f8f9ff",
        "tertiary-container": "#002109",
        "surface-tint": "#565e74",
        "secondary-container": "#fdc425",
        "surface-variant": "#d3e4fe",
        "on-error": "#ffffff",
        "surface-container-high": "#dce9ff",
        "secondary-fixed": "#ffdf9a",
        "on-secondary-fixed-variant": "#5a4300",
        "surface-container": "#e5eeff",
        "secondary": "#785a00",
        "surface-container-low": "#eff4ff",
        "on-secondary-container": "#6d5200",
        "inverse-on-surface": "#eaf1ff",
        "error-container": "#ffdad6",
        "on-secondary": "#ffffff",
        "tertiary": "#000000",
        "on-surface-variant": "#45464d",
        "on-tertiary": "#ffffff",
        "outline-variant": "#c6c6cd",
        "on-primary": "#ffffff"
      },
      borderRadius: {
        "DEFAULT": "0.25rem",
        "lg": "0.5rem",
        "xl": "0.75rem",
        "full": "9999px"
      },
      spacing: {
        "margin-mobile": "16px",
        "margin-desktop": "40px",
        "gutter": "24px",
        "container-max": "1280px",
        "base": "8px"
      },
      fontFamily: {
        "raffle-number": ["var(--font-jetbrains)", "JetBrains Mono", "monospace"],
        "body-lg": ["var(--font-inter)", "Inter", "sans-serif"],
        "label-caps": ["var(--font-jetbrains)", "JetBrains Mono", "monospace"],
        "headline-md": ["var(--font-hanken)", "Hanken Grotesk", "sans-serif"],
        "body-md": ["var(--font-inter)", "Inter", "sans-serif"],
        "display-lg-mobile": ["var(--font-hanken)", "Hanken Grotesk", "sans-serif"],
        "body-sm": ["var(--font-inter)", "Inter", "sans-serif"],
        "display-lg": ["var(--font-hanken)", "Hanken Grotesk", "sans-serif"]
      },
      fontSize: {
        "raffle-number": ["20px", { "lineHeight": "24px", "fontWeight": "700" }],
        "body-lg": ["18px", { "lineHeight": "28px", "fontWeight": "400" }],
        "label-caps": ["12px", { "lineHeight": "16px", "letterSpacing": "0.05em", "fontWeight": "600" }],
        "headline-md": ["24px", { "lineHeight": "32px", "fontWeight": "700" }],
        "body-md": ["16px", { "lineHeight": "24px", "fontWeight": "400" }],
        "display-lg-mobile": ["36px", { "lineHeight": "42px", "letterSpacing": "-0.02em", "fontWeight": "800" }],
        "body-sm": ["14px", { "lineHeight": "20px", "fontWeight": "400" }],
        "display-lg": ["48px", { "lineHeight": "56px", "letterSpacing": "-0.02em", "fontWeight": "800" }]
      }
    },
  },
  plugins: [],
};

export default config;

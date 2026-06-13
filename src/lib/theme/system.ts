"use client";

import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";

/**
 * Nova GCS theme.
 *
 * Encodes the design language from UI_DESIGN.md:
 *  - Two themes. Dark is default (bunker/night). In LIGHT mode the content
 *    area goes paper-bright while the nav rail + top bar stay dark — so the
 *    chrome uses fixed dark tokens (chrome.*) that do NOT follow color mode,
 *    while content surfaces use semantic tokens that DO.
 *  - Colour language: blue accent; green=nominal, amber=warn, orange=error,
 *    red=fault. The same palette doubles as P&ID system-group colours.
 *  - Role colours: viewer=slate, pad=green, operator=blue, admin=amber.
 *  - Typography: Inter for labels/prose, JetBrains Mono for every value.
 *  - Radii: cards md, buttons/inputs sm, chips full.
 */

const config = defineConfig({
  theme: {
    tokens: {
      fonts: {
        heading: { value: "var(--font-inter), sans-serif" },
        body: { value: "var(--font-inter), sans-serif" },
        mono: { value: "var(--font-jetbrains-mono), monospace" },
      },
      colors: {
        // Brand / accent (blue)
        accent: {
          50: { value: "#e8f1ff" },
          100: { value: "#c5dbff" },
          200: { value: "#9bc0ff" },
          300: { value: "#6fa3ff" },
          400: { value: "#4d8bff" },
          500: { value: "#2f74ff" },
          600: { value: "#1f5fe6" },
          700: { value: "#1849b4" },
          800: { value: "#123685" },
          900: { value: "#0d2659" },
        },
        // Status palette — consistent meaning everywhere.
        nominal: { value: "#22c55e" }, // green: nominal / safe
        warn: { value: "#f59e0b" }, // amber: warning
        error: { value: "#fb7185" }, // orange-ish: error  (kept distinct from fault)
        fault: { value: "#ef4444" }, // red: fault / danger
        info: { value: "#3b82f6" }, // blue: info
        // Role colours
        role: {
          viewer: { value: "#64748b" }, // slate grey
          pad: { value: "#22c55e" }, // green
          operator: { value: "#2f74ff" }, // blue
          admin: { value: "#f59e0b" }, // amber
        },
        // Fixed dark chrome (nav rail + top bar) — does not follow color mode.
        chrome: {
          bg: { value: "#0b0f17" },
          surface: { value: "#121826" },
          surfaceHover: { value: "#1b2334" },
          border: { value: "#1f2937" },
          text: { value: "#e5e9f0" },
          textMuted: { value: "#8b95a7" },
        },
        // Dark-theme content surfaces
        darkbg: {
          canvas: { value: "#0e131d" },
          surface: { value: "#151c29" },
          surfaceRaised: { value: "#1b2433" },
          border: { value: "#26303f" },
          text: { value: "#e5e9f0" },
          textMuted: { value: "#94a0b3" },
        },
        // Light-theme content surfaces (paper-like)
        lightbg: {
          canvas: { value: "#f4f6fa" },
          surface: { value: "#ffffff" },
          surfaceRaised: { value: "#f9fafc" },
          border: { value: "#dde3ec" },
          text: { value: "#16202e" },
          textMuted: { value: "#5a6679" },
        },
      },
      radii: {
        card: { value: "0.625rem" },
        control: { value: "0.375rem" },
        chip: { value: "9999px" },
      },
    },
    semanticTokens: {
      colors: {
        // Content surfaces: switch with color mode.
        "bg.canvas": {
          value: { base: "{colors.lightbg.canvas}", _dark: "{colors.darkbg.canvas}" },
        },
        "bg.surface": {
          value: { base: "{colors.lightbg.surface}", _dark: "{colors.darkbg.surface}" },
        },
        "bg.surfaceRaised": {
          value: {
            base: "{colors.lightbg.surfaceRaised}",
            _dark: "{colors.darkbg.surfaceRaised}",
          },
        },
        "border.default": {
          value: { base: "{colors.lightbg.border}", _dark: "{colors.darkbg.border}" },
        },
        "text.primary": {
          value: { base: "{colors.lightbg.text}", _dark: "{colors.darkbg.text}" },
        },
        "text.muted": {
          value: { base: "{colors.lightbg.textMuted}", _dark: "{colors.darkbg.textMuted}" },
        },
        // Accent that stays usable in both modes.
        "accent.solid": { value: { base: "{colors.accent.500}", _dark: "{colors.accent.400}" } },
      },
    },
  },
  globalCss: {
    "html, body": {
      bg: "bg.canvas",
      color: "text.primary",
      fontFamily: "body",
    },
    // Material Symbols base styling (font loaded in layout).
    ".material-symbols-rounded": {
      fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24",
      userSelect: "none",
    },
  },
});

export const system = createSystem(defaultConfig, config);

import type { CSSProperties } from "react";

/**
 * Shared styling for native <select> dropdowns across the Console tabs.
 * Uses the darker canvas fill + inset shadow so controls read as recessed and
 * stand out against the lighter card surface they sit on.
 */
export const SELECT_STYLE: CSSProperties = {
  width: "100%",
  background: "var(--chakra-colors-bg\\.canvas)",
  border: "1px solid var(--chakra-colors-border\\.default)",
  borderRadius: "var(--chakra-radii-control)",
  color: "var(--chakra-colors-text-primary)",
  padding: "7px 9px",
  fontSize: "0.875rem",
  fontWeight: 500,
  boxShadow: "inset 0 1px 2px rgba(0,0,0,0.28)",
  outline: "none",
  cursor: "pointer",
} as const;

/**
 * Shared Chakra <Input> props matching the select treatment: recessed canvas
 * fill, visible border, accent border on hover/focus.
 */
export const INPUT_PROPS = {
  bg: "bg.canvas",
  borderColor: "border.default",
  boxShadow: "inset 0 1px 2px rgba(0,0,0,0.28)",
  _hover: { borderColor: "accent.solid" },
  _focusVisible: {
    borderColor: "accent.solid",
    boxShadow: "0 0 0 1px var(--chakra-colors-accent-solid)",
  },
} as const;

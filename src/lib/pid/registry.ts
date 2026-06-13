/**
 * System colour registry.
 *
 * Maps systemId → { label, colorToken } where colorToken is a Chakra theme
 * token name. The token is resolved to a CSS variable for JointJS stroke/fill.
 */

export interface SystemDef {
  label: string;
  /** Chakra color token (e.g. "info", "nominal", "fault", "warn", "accent.500"). */
  colorToken: string;
}

export type SystemRegistry = Record<string, SystemDef>;

// ---------------------------------------------------------------------------
// Central colour palette — the ONE place to add P&ID colours.
//
// To add a new colour option (for shapes AND pipes), add a single entry here.
// `token` is the stable id stored on cells; `hex` is used directly in SVG
// attributes (CSS vars don't resolve inside SVG attrs in this dark-only app).
// ---------------------------------------------------------------------------

export interface PidColor {
  token: string;
  label: string;
  hex: string;
}

export const PID_COLORS: PidColor[] = [
  { token: "neutral", label: "Grey",   hex: "#94a0b3" },
  { token: "info",    label: "Blue",   hex: "#3b82f6" },
  { token: "nominal", label: "Green",  hex: "#22c55e" },
  { token: "fault",   label: "Red",    hex: "#ef4444" },
  { token: "warn",    label: "Orange", hex: "#f59e0b" },
  { token: "accent",  label: "Accent", hex: "#4d8bff" },
  { token: "purple",  label: "Purple", hex: "#a855f7" },
  { token: "cyan",    label: "Cyan",   hex: "#06b6d4" },
  { token: "pink",    label: "Pink",   hex: "#ec4899" },
];

/** Well-known system IDs shipped with the default layout. */
export const DEFAULT_SYSTEMS: SystemRegistry = {
  pressurant: { label: "Pressurant",  colorToken: "info" },
  fuel:       { label: "Fuel",        colorToken: "fault" },
  oxidizer:   { label: "Oxidizer",    colorToken: "nominal" },
  misc:       { label: "Misc",        colorToken: "warn" },
};

// Dark-theme hex lookup, derived from PID_COLORS (plus accent aliases).
// CSS custom properties (var(--chakra-colors-*)) do not reliably resolve
// inside SVG presentation attributes when Chakra scopes them to
// [data-theme="dark"] on the body. GCS is always dark — we pin hex.
export const TOKEN_HEX: Record<string, string> = {
  ...Object.fromEntries(PID_COLORS.map((c) => [c.token, c.hex])),
  "accent.400": "#4d8bff",
  "accent.500": "#4d8bff",
};

/** Fallback border colour used for unknown/unregistered systems. */
const FALLBACK_COLOUR = "#26303f";

/**
 * Resolve a Chakra color token name to a hex colour string.
 * Falls back to the token → CSS var path for any token not in TOKEN_HEX
 * (non-SVG contexts can still use CSS vars).
 */
export function resolveColour(token: string): string {
  return TOKEN_HEX[token] ?? `var(--chakra-colors-${token.replace(/\./g, "-")})`;
}

/**
 * Resolve a systemId to a hex colour string suitable for SVG stroke/fill.
 * Falls back to the border colour for unknown systems.
 */
export function systemColour(registry: SystemRegistry, systemId: string): string {
  const def = registry[systemId];
  if (!def) return FALLBACK_COLOUR;
  return TOKEN_HEX[def.colorToken] ?? FALLBACK_COLOUR;
}

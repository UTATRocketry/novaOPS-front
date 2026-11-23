import { describe, expect, it } from "vitest";

import { DEFAULT_SYSTEMS, PID_COLORS, TOKEN_HEX, resolveColour, systemColour } from "./registry";

describe("PID colour palette", () => {
  it("has unique tokens and valid hex values", () => {
    const tokens = PID_COLORS.map((c) => c.token);
    expect(new Set(tokens).size).toBe(tokens.length);
    for (const c of PID_COLORS) expect(c.hex).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("exposes every palette token through TOKEN_HEX, plus the accent aliases", () => {
    for (const c of PID_COLORS) expect(TOKEN_HEX[c.token]).toBe(c.hex);
    expect(TOKEN_HEX["accent.500"]).toBe(TOKEN_HEX["accent"]);
  });

  it("only uses palette tokens for the default systems", () => {
    for (const def of Object.values(DEFAULT_SYSTEMS)) expect(TOKEN_HEX).toHaveProperty(def.colorToken);
  });
});

describe("resolveColour", () => {
  it("returns the hex for a known token", () => {
    expect(resolveColour("fault")).toBe("#ef4444");
  });

  it("falls back to a Chakra CSS variable for an unknown token", () => {
    expect(resolveColour("teal.500")).toBe("var(--chakra-colors-teal-500)");
  });
});

describe("systemColour", () => {
  it("resolves a registered system to its token's hex", () => {
    expect(systemColour(DEFAULT_SYSTEMS, "fuel")).toBe("#ef4444");
    expect(systemColour(DEFAULT_SYSTEMS, "oxidizer")).toBe("#22c55e");
  });

  it("uses the neutral border colour for an unknown system", () => {
    expect(systemColour(DEFAULT_SYSTEMS, "plasma")).toBe("#26303f");
  });

  it("uses the neutral border colour when a system's token has no hex", () => {
    expect(systemColour({ x: { label: "X", colorToken: "teal.500" } }, "x")).toBe("#26303f");
  });
});

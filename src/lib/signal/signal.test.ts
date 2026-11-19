import { afterEach, describe, expect, it, vi } from "vitest";

import { cssVar } from "../helpers";
import { adaptSignal, dBmToBars } from "./index";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("dBmToBars", () => {
  it.each([
    [-30, 5],
    [-50, 5],
    [-51, 4],
    [-65, 4],
    [-66, 3],
    [-75, 3],
    [-76, 2],
    [-85, 2],
    [-86, 1],
    [-95, 1],
    [-96, 0],
    [-140, 0],
  ])("%d dBm -> %d bars", (dBm, bars) => {
    expect(dBmToBars(dBm)).toBe(bars);
  });

  it("never gives more bars for a weaker signal", () => {
    let last = Infinity;
    for (let dBm = 0; dBm >= -130; dBm--) {
      const bars = dBmToBars(dBm);
      expect(bars).toBeLessThanOrEqual(last);
      last = bars;
    }
  });
});

describe("adaptSignal", () => {
  it("reports unknown, not zero, until the backend exposes a signal field", () => {
    expect(adaptSignal(null)).toEqual({ dBm: null, bars: null });
    expect(adaptSignal({ rssi: -40 })).toEqual({ dBm: null, bars: null });
  });

  it("returns fake data only when the dev flag is exactly 'true'", () => {
    vi.stubEnv("NEXT_PUBLIC_NOVA_FAKE_SIGNAL", "true");
    expect(adaptSignal(null)).toEqual({ dBm: -65, bars: 4 });
    vi.stubEnv("NEXT_PUBLIC_NOVA_FAKE_SIGNAL", "1");
    expect(adaptSignal(null)).toEqual({ dBm: null, bars: null });
  });
});

describe("cssVar", () => {
  it("turns a dotted token into a Chakra CSS variable", () => {
    expect(cssVar("accent.500")).toBe("var(--chakra-colors-accent-500)");
    expect(cssVar("fault")).toBe("var(--chakra-colors-fault)");
  });
});

import { describe, expect, it } from "vitest";

import { toPlotSeries } from "./plotData";

describe("toPlotSeries", () => {
  it("passes finite values through unchanged", () => {
    expect(toPlotSeries(Float64Array.of(1, -2.5, 0))).toEqual([1, -2.5, 0]);
  });

  it("turns NaN gaps into null, which uPlot treats as no data", () => {
    expect(toPlotSeries(Float64Array.of(NaN, 1, NaN, 2))).toEqual([null, 1, null, 2]);
  });

  it("turns infinities into null as well", () => {
    expect(toPlotSeries(Float64Array.of(Infinity, -Infinity, 3))).toEqual([null, null, 3]);
  });

  it("keeps a real zero distinct from a gap", () => {
    const out = toPlotSeries(Float64Array.of(0, NaN));
    expect(out[0]).toBe(0);
    expect(out[1]).toBeNull();
  });

  it("returns an empty series for an empty buffer", () => {
    expect(toPlotSeries(new Float64Array(0))).toEqual([]);
  });

  it("returns the cached series for the same buffer", () => {
    const buf = Float64Array.of(1, NaN);
    expect(toPlotSeries(buf)).toBe(toPlotSeries(buf));
  });

  it("converts again for a new buffer, even with the same contents", () => {
    const a = Float64Array.of(1, 2);
    const b = Float64Array.of(1, 2);
    expect(toPlotSeries(a)).not.toBe(toPlotSeries(b));
  });

  it("reflects a replaced buffer, not the stale cache", () => {
    const first = Float64Array.of(1);
    const second = Float64Array.of(NaN);
    toPlotSeries(first);
    expect(toPlotSeries(second)).toEqual([null]);
  });
});

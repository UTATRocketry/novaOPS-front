import { describe, expect, it } from "vitest";

import { toPlotSeries } from "@/components/analysis/plotData";

describe("@/ path alias", () => {
  it("resolves from tsconfig paths", () => {
    expect(toPlotSeries(Float64Array.of(1))).toEqual([1]);
  });
});

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { normalizeSavgolWindow, savgolFilter, solveLinear } from "./filters";

const f64 = (...v: number[]) => Float64Array.of(...v);

function expectClose(actual: ArrayLike<number>, expected: ArrayLike<number>, digits = 8) {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < expected.length; i++) {
    expect(actual[i]).toBeCloseTo(expected[i], digits);
  }
}

describe("solveLinear", () => {
  it("solves a 2x2 system", () => {
    // 2x + y = 5, x - y = 1  ->  x = 2, y = 1
    const x = solveLinear([[2, 1], [1, -1]], [5, 1]);
    expectClose(x!, [2, 1]);
  });

  it("pivots when the leading entry is zero", () => {
    const x = solveLinear([[0, 1], [1, 0]], [3, 4]);
    expectClose(x!, [4, 3]);
  });

  it("returns null for a singular matrix", () => {
    expect(solveLinear([[1, 2], [2, 4]], [1, 2])).toBeNull();
  });

  it("does not modify its inputs", () => {
    const A = [[2, 1], [1, -1]];
    const b = [5, 1];
    solveLinear(A, b);
    expect(A).toEqual([[2, 1], [1, -1]]);
    expect(b).toEqual([5, 1]);
  });
});

describe("normalizeSavgolWindow", () => {
  it.each([
    [5, 2, 5],
    [4, 2, 5], // even -> next odd
    [4.6, 2, 5], // rounded first
    [0, 0, 1], // clamped to 1
    [3, 3, 5], // must exceed polyorder
    [2, 3, 5],
    [1, 4, 7], // polyorder + 2 = 6 -> odd 7
  ])("window %d, polyorder %d -> %d", (window, order, expected) => {
    expect(normalizeSavgolWindow(window, order)).toBe(expected);
  });

  it("always returns an odd window larger than polyorder", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -10, max: 500, noNaN: true }),
        fc.integer({ min: 0, max: 6 }),
        (w, p) => {
          const out = normalizeSavgolWindow(w, p);
          expect(out % 2).toBe(1);
          expect(out).toBeGreaterThan(p);
        },
      ),
    );
  });
});

describe("savgolFilter", () => {
  it("uses the textbook 5-point quadratic weights in the interior", () => {
    // Interior weights for window 5, order 2 are [-3, 12, 17, 12, -3] / 35.
    const data = f64(1, 5, 2, 8, 3, 9, 4);
    const out = savgolFilter(data, 5, 2);
    const w = [-3, 12, 17, 12, -3];
    for (let i = 2; i < data.length - 2; i++) {
      let s = 0;
      for (let k = 0; k < 5; k++) s += (w[k] * data[i - 2 + k]) / 35;
      expect(out[i]).toBeCloseTo(s, 10);
    }
  });

  it("reproduces a polynomial of degree <= polyorder exactly, edges included", () => {
    const data = Float64Array.from({ length: 30 }, (_, t) => 0.5 * t * t - 3 * t + 7);
    expectClose(savgolFilter(data, 9, 2), data, 6);
  });

  it("leaves a constant series constant", () => {
    const data = new Float64Array(20).fill(4.2);
    expectClose(savgolFilter(data, 7, 3), data, 10);
  });

  it("returns the input untouched when shorter than the window", () => {
    const data = f64(1, 2, 3);
    expect(savgolFilter(data, 11, 3)).toBe(data);
  });

  it("returns the input when it holds no finite samples", () => {
    const data = f64(NaN, NaN);
    expect(savgolFilter(data, 5, 2)).toBe(data);
  });

  it("keeps NaN gaps in place and never fills them", () => {
    const data = Float64Array.from({ length: 20 }, (_, i) => (i === 7 || i === 8 ? NaN : i * 2));
    const out = savgolFilter(data, 5, 2);
    expect(out[7]).toBeNaN();
    expect(out[8]).toBeNaN();
    for (let i = 0; i < data.length; i++) {
      if (i !== 7 && i !== 8) expect(Number.isFinite(out[i])).toBe(true);
    }
  });

  it("filters only the valid subset, as if the gaps were not there", () => {
    const data = Float64Array.from({ length: 20 }, (_, i) => Math.sin(i) * 10);
    const gapped = Float64Array.from(data);
    gapped[4] = NaN;
    gapped[11] = NaN;
    const compact = Float64Array.from(Array.from(data).filter((_, i) => i !== 4 && i !== 11));

    const expected = savgolFilter(compact, 5, 2);
    const out = savgolFilter(gapped, 5, 2);
    expect(Array.from(out).filter((v) => !Number.isNaN(v))).toEqual(Array.from(expected));
  });

  it("does not modify its input when gaps are present", () => {
    const data = f64(1, NaN, 3, 4, 5, 6, 7, 8);
    const copy = Array.from(data);
    savgolFilter(data, 3, 1);
    expect(Array.from(data)).toEqual(copy);
  });

  it("returns a series the same length as its input, never throwing", () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: -1e6, max: 1e6, noNaN: true }), { maxLength: 80 }),
        fc.integer({ min: 1, max: 31 }),
        fc.integer({ min: 0, max: 4 }),
        (values, w, p) => {
          const out = savgolFilter(Float64Array.from(values), w, p);
          expect(out.length).toBe(values.length);
        },
      ),
    );
  });
});

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { SensorEntry } from "@/lib/types";
import {
  CalibrationError,
  applyCalibration,
  bindingColumnKey,
  calibrationFor,
  hasCalibration,
  validateCalibrationTable,
} from "./calibrate";

const f64 = (...v: number[]) => Float64Array.of(...v);
const table = (pairs: Array<[number, number]>) => validateCalibrationTable(pairs);

describe("validateCalibrationTable", () => {
  it("sorts by raw value", () => {
    const t = table([[10, 100], [0, 0], [5, 40]]);
    expect(Array.from(t.xs)).toEqual([0, 5, 10]);
    expect(Array.from(t.ys)).toEqual([0, 40, 100]);
  });

  it("keeps the first entry for a duplicated raw value", () => {
    const t = table([[1, 10], [1, 99], [2, 20]]);
    expect(Array.from(t.xs)).toEqual([1, 2]);
    expect(Array.from(t.ys)).toEqual([10, 20]);
  });

  it.each([
    ["empty", []],
    ["a non-pair row", [[1, 2, 3]]],
    ["a non-numeric entry", [[1, "x"]]],
    ["an infinite entry", [[1, Infinity]]],
  ])("rejects %s", (_name, bad) => {
    expect(() => validateCalibrationTable(bad as never)).toThrow(CalibrationError);
  });

  it("rejects a non-array table", () => {
    expect(() => validateCalibrationTable(null as never)).toThrow(CalibrationError);
  });
});

describe("applyCalibration", () => {
  const t = table([[0, 0], [10, 100], [20, 150]]);

  it("passes through breakpoints exactly", () => {
    expect(Array.from(applyCalibration(f64(0, 10, 20), t))).toEqual([0, 100, 150]);
  });

  it("interpolates linearly between breakpoints", () => {
    expect(Array.from(applyCalibration(f64(5, 15), t))).toEqual([50, 125]);
  });

  it("extrapolates with the end segments' slopes instead of clamping", () => {
    // left slope 10/unit, right slope 5/unit
    expect(Array.from(applyCalibration(f64(-2, 24), t))).toEqual([-20, 170]);
  });

  it("maps non-finite input to NaN", () => {
    const out = applyCalibration(f64(NaN, Infinity, -Infinity, 10), t);
    expect(Array.from(out.slice(0, 3)).every(Number.isNaN)).toBe(true);
    expect(out[3]).toBe(100);
  });

  it("maps everything finite to the single point of a one-entry table", () => {
    const out = applyCalibration(f64(-5, 0, 99, NaN), table([[3, 7]]));
    expect(Array.from(out.slice(0, 3))).toEqual([7, 7, 7]);
    expect(out[3]).toBeNaN();
  });

  it("returns NaN throughout for a table with no points", () => {
    const out = applyCalibration(f64(1, 2), { xs: new Float64Array(0), ys: new Float64Array(0) });
    expect(Array.from(out).every(Number.isNaN)).toBe(true);
  });

  it("returns an empty series for empty input", () => {
    expect(applyCalibration(new Float64Array(0), t).length).toBe(0);
  });

  it("does not modify the raw series", () => {
    const raw = f64(1, 2, 3);
    applyCalibration(raw, t);
    expect(Array.from(raw)).toEqual([1, 2, 3]);
  });

  it("is monotonic for a monotonic table", () => {
    const mono = table([[0, 0], [1, 2], [4, 3], [9, 10]]);
    fc.assert(
      fc.property(
        fc.double({ min: -50, max: 50, noNaN: true }),
        fc.double({ min: -50, max: 50, noNaN: true }),
        (a, b) => {
          const [lo, hi] = a <= b ? [a, b] : [b, a];
          const out = applyCalibration(f64(lo, hi), mono);
          expect(out[0]).toBeLessThanOrEqual(out[1] + 1e-9);
        },
      ),
    );
  });

  it("matches a straight line for a two-point table anywhere", () => {
    const line = table([[0, 1], [2, 5]]); // y = 2x + 1
    fc.assert(
      fc.property(fc.double({ min: -1e4, max: 1e4, noNaN: true }), (x) => {
        expect(applyCalibration(f64(x), line)[0]).toBeCloseTo(2 * x + 1, 6);
      }),
    );
  });
});

describe("bindingColumnKey", () => {
  it("builds hat/channel headers for GCS and TCS", () => {
    expect(bindingColumnKey({ source: "GCS", hat_id: 1, channel_id: 3 })).toEqual({
      source: "GCS",
      colKey: "hat1_ch3",
    });
    expect(bindingColumnKey({ source: "TCS", hat_id: 1, channel_id: 3 })).toEqual({
      source: "TCS",
      colKey: "hat1_ch3",
    });
  });

  it("builds node/channel headers for FAS", () => {
    expect(bindingColumnKey({ source: "FAS", node: "EPB_0", channel: 2 })).toEqual({
      source: "FAS",
      colKey: "EPB_0_ch2",
    });
  });
});

describe("calibrationFor / hasCalibration", () => {
  const cal: Array<[number, number]> = [[0, 0], [1, 2]];
  const sensor = (convert: SensorEntry["convert"]): SensorEntry => ({
    name: "PT1",
    type: "PT",
    binding: { source: "GCS", hat_id: 0, channel_id: 0 },
    convert,
  });

  it("honours a table with no explicit method", () => {
    expect(calibrationFor({ calibration: cal })).not.toBeNull();
    expect(hasCalibration(sensor({ calibration: cal }))).toBe(true);
  });

  it("honours method linear", () => {
    expect(calibrationFor({ method: "linear", calibration: cal })).not.toBeNull();
  });

  it("passes raw through for method none, even with a table", () => {
    expect(calibrationFor({ method: "none", calibration: cal })).toBeNull();
    expect(hasCalibration(sensor({ method: "none", calibration: cal }))).toBe(false);
  });

  it("returns null when there is no table", () => {
    expect(calibrationFor(undefined)).toBeNull();
    expect(calibrationFor({ calibration: [] })).toBeNull();
    expect(calibrationFor({ calibration: null })).toBeNull();
    expect(hasCalibration(sensor(undefined))).toBe(false);
  });

  it("throws on a malformed table rather than ignoring it", () => {
    expect(() => calibrationFor({ calibration: [[1, NaN]] })).toThrow(CalibrationError);
  });
});

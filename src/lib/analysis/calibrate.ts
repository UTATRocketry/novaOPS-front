/**
 * Sensor calibration — the piecewise-linear map from raw counts to engineering
 * units, ported from the offline analysis script.
 *
 * The table lives in the system config as `SensorEntry.convert.calibration`:
 * a list of `[raw, value]` breakpoints. Inside the table's span the mapping is
 * linear interpolation between breakpoints; outside it, the end segment's slope
 * is extended rather than clamped, so an over-range reading stays visibly
 * over-range instead of flat-topping at the last calibrated point.
 */

import type { ConvertSpec, SensorBinding, SensorEntry } from "@/lib/types";
import type { ChannelBinding } from "./types";

export interface CalibrationTable {
  /** Raw breakpoints, sorted ascending and de-duplicated. */
  xs: Float64Array;
  /** Engineering values at each breakpoint. */
  ys: Float64Array;
}

export class CalibrationError extends Error {}

/**
 * Validate and normalise a `[raw, value][]` table: sorts by raw and keeps the
 * first entry for any duplicated raw value (a stable sort, as in the script).
 */
export function validateCalibrationTable(
  table: Array<[number, number]> | ReadonlyArray<readonly number[]>,
): CalibrationTable {
  if (!Array.isArray(table) || table.length === 0) {
    throw new CalibrationError("Calibration table is empty.");
  }
  const pairs: Array<[number, number]> = [];
  for (const row of table) {
    if (!Array.isArray(row) || row.length !== 2) {
      throw new CalibrationError("Calibration must be a list of [raw, value] pairs.");
    }
    const x = Number(row[0]);
    const y = Number(row[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new CalibrationError("Calibration contains a non-numeric entry.");
    }
    pairs.push([x, y]);
  }

  pairs.sort((a, b) => a[0] - b[0]);

  const xs: number[] = [];
  const ys: number[] = [];
  for (const [x, y] of pairs) {
    if (xs.length && xs[xs.length - 1] === x) continue; // keep first of duplicates
    xs.push(x);
    ys.push(y);
  }
  return { xs: Float64Array.from(xs), ys: Float64Array.from(ys) };
}

/**
 * Apply a calibration table to a raw series.
 *
 * A single-point table maps everything to that point's value (no slope is
 * knowable). Beyond either end the nearest segment's slope is extrapolated.
 */
export function applyCalibration(
  raw: Float64Array,
  { xs, ys }: CalibrationTable,
): Float64Array {
  const n = xs.length;
  const out = new Float64Array(raw.length);

  if (n === 0) return out.fill(NaN);
  if (n === 1) {
    for (let i = 0; i < raw.length; i++) {
      out[i] = Number.isFinite(raw[i]) ? ys[0] : NaN;
    }
    return out;
  }

  const mLeft = (ys[1] - ys[0]) / (xs[1] - xs[0]);
  const mRight = (ys[n - 1] - ys[n - 2]) / (xs[n - 1] - xs[n - 2]);

  for (let i = 0; i < raw.length; i++) {
    const v = raw[i];
    if (!Number.isFinite(v)) {
      out[i] = NaN;
      continue;
    }
    if (v < xs[0]) {
      out[i] = ys[0] + mLeft * (v - xs[0]);
      continue;
    }
    if (v > xs[n - 1]) {
      out[i] = ys[n - 1] + mRight * (v - xs[n - 1]);
      continue;
    }
    // Binary search for the bracketing segment.
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid] <= v) lo = mid;
      else hi = mid;
    }
    const span = xs[hi] - xs[lo];
    out[i] = span === 0 ? ys[lo] : ys[lo] + ((ys[hi] - ys[lo]) * (v - xs[lo])) / span;
  }
  return out;
}

/**
 * The CSV column header a sensor's binding maps to, together with the
 * subsystem whose file that header lives in.
 *   GCS / TCS -> `hat{hat_id}_ch{channel_id}`
 *   FAS       -> `{node}_ch{channel}`
 *
 * GCS and TCS deliberately produce the *same* `colKey` for the same hat and
 * channel numbers — that is what the raw files contain. The source is what
 * separates them, so callers must resolve columns through `qualify()` rather
 * than on `colKey` alone.
 */
export function bindingColumnKey(binding: SensorBinding): ChannelBinding {
  if (binding.source === "FAS") {
    return { source: "FAS", colKey: `${binding.node}_ch${binding.channel}` };
  }
  return {
    source: binding.source,
    colKey: `hat${binding.hat_id}_ch${binding.channel_id}`,
  };
}

/**
 * Read the calibration out of a sensor's `convert` block.
 *
 * A table is honoured whenever one is present: newer config exports omit the
 * explicit `method: linear` and just carry `calibration:`. Only an explicit
 * `method: "none"` means "pass the raw value through unchanged".
 */
export function calibrationFor(convert: ConvertSpec | undefined): CalibrationTable | null {
  const table = convert?.calibration;
  if (!table || table.length === 0) return null;
  if (convert?.method === "none") return null;
  return validateCalibrationTable(table);
}

/** True when the sensor declares a usable calibration table. */
export function hasCalibration(sensor: SensorEntry): boolean {
  const table = sensor.convert?.calibration;
  return Boolean(table && table.length > 0 && sensor.convert?.method !== "none");
}

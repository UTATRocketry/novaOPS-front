/**
 * The analysis pipeline: raw CSV table + system config -> plottable dataset.
 *
 * Order of operations:
 *   1. bind each configured sensor to its CSV column
 *   2. apply the piecewise-linear calibration (or pass raw through)
 *   3. smooth mass (`kg`) channels with Savitzky-Golay
 *
 * Decimation happens up front, before calibration, so filter windows are
 * expressed in the samples the operator actually sees.
 */

import type { SensorEntry } from "@/lib/types";
import { applyCalibration, bindingColumnKey, calibrationFor } from "./calibrate";
import { qualify, timestampToSeconds, unqualify } from "./csv";
import { normalizeSavgolWindow, savgolFilter } from "./filters";
import type {
  ActuationEvent,
  AssembledTable,
  Channel,
  ChannelStats,
  DataSource,
  Dataset,
  ProcessingOptions,
  RawColumn,
  RawTable,
  SkippedChannel,
  TimeWindow,
} from "./types";

/** Mass channels are the ones the Savitzky-Golay smoother acts on. */
const MASS_UNIT = "kg";

function isMassUnit(unit: string): boolean {
  return unit.trim().toLowerCase() === MASS_UNIT;
}

/** Decimate every array in the table, keeping every Nth row. */
function decimateTable(table: AssembledTable, step: number): AssembledTable {
  if (step <= 1) return table;
  const keep = Math.ceil(table.rowCount / step);
  const pick = (src: Float64Array) => {
    const out = new Float64Array(keep);
    for (let i = 0, r = 0; r < table.rowCount; r += step, i++) out[i] = src[r];
    return out;
  };
  return {
    ...table,
    rowCount: keep,
    timestamp: table.timestamp ? pick(table.timestamp) : null,
    columns: table.columns.map((c) => ({ key: c.key, values: pick(c.values) })),
  };
}

/**
 * Elapsed seconds per row, plus epoch-ms when the file carried real wall-clock
 * timestamps. With no timestamp column the x-axis falls back to sample index —
 * labelled as such in the UI so it is never mistaken for seconds.
 */
function buildTimeBase(table: RawTable): {
  elapsed: Float64Array;
  epochMs: Float64Array | null;
  sampleRateHz: number | null;
} {
  const n = table.rowCount;
  if (!table.timestamp || table.unit === "none") {
    const elapsed = new Float64Array(n);
    for (let i = 0; i < n; i++) elapsed[i] = i;
    return { elapsed, epochMs: null, sampleRateHz: null };
  }

  const ts = table.timestamp;
  const t0 = ts[0];
  const elapsed = new Float64Array(n);
  for (let i = 0; i < n; i++) elapsed[i] = timestampToSeconds(ts[i] - t0, table.unit);

  const epochMs = new Float64Array(n);
  for (let i = 0; i < n; i++) epochMs[i] = timestampToSeconds(ts[i], table.unit) * 1000;

  const span = elapsed[n - 1] - elapsed[0];
  const sampleRateHz = n > 1 && span > 0 ? (n - 1) / span : null;
  return { elapsed, epochMs, sampleRateHz };
}

export interface BuildDatasetInput {
  table: AssembledTable;
  sensors: SensorEntry[];
  options: ProcessingOptions;
  /**
   * Actuation events in epoch ms. Placed onto the dataset's elapsed axis here,
   * where the time base is known.
   */
  events?: ActuationEvent[];
}

/** Run the full pipeline. Pure — same inputs always give the same dataset. */
export function buildDataset({
  table: rawTable,
  sensors,
  options,
  events = [],
}: BuildDatasetInput): Dataset {
  const table = decimateTable(rawTable, Math.max(1, Math.round(options.decimate)));
  const { elapsed, epochMs, sampleRateHz } = buildTimeBase(table);

  const byKey = new Map<string, RawColumn>();
  for (const col of table.columns) byKey.set(col.key, col);

  // Which subsystems actually contributed a log. A sensor bound to a source
  // that was never loaded is a different situation from one whose column is
  // genuinely absent, and the two are reported separately.
  const loadedSources = new Set<DataSource>([table.primarySource]);
  for (const a of table.alignments) loadedSources.add(a.source);

  const channels: Channel[] = [];
  const skipped: SkippedChannel[] = [];
  const bound = new Set<string>();

  /**
   * A trace resolves no faster than its own log, and cannot be represented
   * faster than the timeline it was resampled onto — so the effective rate is
   * the smaller of the two. That also makes decimation fall out correctly: it
   * lowers the timeline rate, which caps every channel.
   */
  const effectiveRate = (source: DataSource): number | null => {
    const native = table.sourceRates[source] ?? null;
    if (native == null) return sampleRateHz;
    if (sampleRateHz == null) return native;
    return Math.min(native, sampleRateHz);
  };

  for (const sensor of sensors) {
    const binding = bindingColumnKey(sensor.binding);
    // Resolve against the *qualified* key. `hat0_ch0` exists in both a
    // novaGround and a novaThermo log and means a different transducer in each,
    // so the source is part of the lookup, never a tiebreak after the fact.
    const qualifiedKey = qualify(binding.source, binding.colKey);
    const col = byKey.get(qualifiedKey);
    if (!col) {
      skipped.push({
        name: sensor.name,
        colKey: binding.colKey,
        source: binding.source,
        reason: loadedSources.has(binding.source)
          ? "missing-column"
          : "source-not-loaded",
      });
      continue;
    }
    bound.add(qualifiedKey);

    const unit = sensor.unit ?? "";
    let values: Float64Array;
    let origin: Channel["origin"];
    const applied: string[] = [];

    let calibration;
    try {
      calibration = calibrationFor(sensor.convert);
    } catch (err) {
      skipped.push({
        name: sensor.name,
        colKey: binding.colKey,
        source: binding.source,
        reason: "invalid-calibration",
        detail: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    if (calibration) {
      values = applyCalibration(col.values, calibration);
      origin = "calibrated";
      applied.push(`calibration (${calibration.xs.length} pts)`);
    } else {
      values = Float64Array.from(col.values);
      origin = "raw";
    }

    if (options.smoothMass && isMassUnit(unit)) {
      const window = normalizeSavgolWindow(options.savgolWindow, options.savgolPolyorder);
      const smoothed = savgolFilter(values, window, options.savgolPolyorder);
      if (smoothed !== values) {
        values = smoothed;
        applied.push(`Savitzky-Golay (w=${window}, p=${options.savgolPolyorder})`);
      }
    }

    channels.push({
      id: sensor.name,
      name: sensor.name,
      unit,
      type: sensor.type,
      origin,
      binding,
      values,
      applied,
      sampleRateHz: effectiveRate(binding.source),
    });
  }

  const unboundColumns = table.columns
    .map((c) => c.key)
    .filter((k) => !bound.has(k))
    .sort();

  // Decimation shortens the time base, so events are re-placed against the
  // final elapsed axis rather than whatever it was when they were derived.
  const span =
    elapsed.length > 0 ? { start: elapsed[0], end: elapsed[elapsed.length - 1] } : null;
  const placedEvents = events
    .map((e) => ({
      ...e,
      outsideCapture:
        span == null || e.elapsed < span.start || e.elapsed > span.end,
    }))
    .sort((a, b) => a.elapsed - b.elapsed);

  return {
    elapsed,
    epochMs,
    channels,
    skipped,
    rowCount: table.rowCount,
    unboundColumns,
    sampleRateHz,
    primarySource: table.primarySource,
    alignments: table.alignments,
    unalignedSources: table.unalignedSources,
    events: placedEvents,
  };
}

/**
 * Map an actuator log's wall-clock stamps onto a sensor table's elapsed axis.
 *
 * When both logs carry real epoch stamps the two share a wall clock and events
 * land exactly. Otherwise there is no defensible way to relate the two clocks,
 * and the caller is told so rather than being handed a plausible-looking guess.
 */
export function makeEventPlacer(
  table: AssembledTable,
): ((epochMs: number) => { elapsed: number; outside: boolean } | null) | null {
  const ts = table.timestamp;
  if (!ts || ts.length === 0 || table.unit === "none") return null;
  const startS = timestampToSeconds(ts[0], table.unit);
  const endS = timestampToSeconds(ts[ts.length - 1], table.unit);
  // A device uptime counter cannot be related to an actuator log's wall clock.
  if (!(startS > 1e9 && startS < 4e9)) return null;

  return (epochMs: number) => {
    if (!Number.isFinite(epochMs)) return null;
    const t = epochMs / 1000;
    return { elapsed: t - startS, outside: t < startS || t > endS };
  };
}

/** Human label for a qualified column key, e.g. `TCS:hat0_ch0` -> `TCS hat0_ch0`. */
export function describeColumnKey(key: string): string {
  const { source, colKey } = unqualify(key);
  return source ? `${source} ${colKey}` : colKey;
}

// ---------------------------------------------------------------------------
// Windowing + statistics
// ---------------------------------------------------------------------------

/** Index range `[lo, hi)` covering the elapsed-second window (inclusive ends). */
export function windowIndices(
  elapsed: Float64Array,
  window: TimeWindow | null,
): [number, number] {
  if (!window) return [0, elapsed.length];
  let lo = 0;
  let hi = elapsed.length;
  while (lo < hi && elapsed[lo] < window.start) lo++;
  while (hi > lo && elapsed[hi - 1] > window.end) hi--;
  return [lo, hi];
}

const EMPTY_STATS: ChannelStats = {
  count: 0,
  min: null,
  max: null,
  mean: null,
  stdev: null,
  delta: null,
  integral: null,
};

/**
 * Summary statistics over a window. Every field is null when the window holds
 * no finite samples — an empty selection reads as "—", never as 0. The
 * trapezoid rule is applied only between adjacent finite samples, so a gap in
 * the data is never bridged with an invented straight line.
 */
export function channelStats(
  channel: Channel,
  elapsed: Float64Array,
  window: TimeWindow | null,
): ChannelStats {
  const [lo, hi] = windowIndices(elapsed, window);
  const v = channel.values;

  let count = 0;
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let first: number | null = null;
  let last: number | null = null;
  let integral = 0;
  let prevIdx = -1;

  for (let i = lo; i < hi; i++) {
    const x = v[i];
    if (!Number.isFinite(x)) continue;
    count++;
    if (x < min) min = x;
    if (x > max) max = x;
    sum += x;
    if (first === null) first = x;
    last = x;
    // Trapezoidal area against the previous finite sample only — a gap in the
    // data must not be bridged with an invented straight line.
    if (prevIdx >= 0 && prevIdx === i - 1) {
      integral += ((v[prevIdx] + x) / 2) * (elapsed[i] - elapsed[prevIdx]);
    }
    prevIdx = i;
  }

  if (count === 0) return EMPTY_STATS;

  const mean = sum / count;
  let sq = 0;
  for (let i = lo; i < hi; i++) {
    const x = v[i];
    if (!Number.isFinite(x)) continue;
    sq += (x - mean) * (x - mean);
  }

  return {
    count,
    min,
    max,
    mean,
    stdev: count > 1 ? Math.sqrt(sq / (count - 1)) : 0,
    delta: first !== null && last !== null ? last - first : null,
    integral: count > 1 ? integral : null,
  };
}

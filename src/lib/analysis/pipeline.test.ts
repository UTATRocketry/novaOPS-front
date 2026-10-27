import { describe, expect, it } from "vitest";

import type { SensorEntry } from "@/lib/types";
import {
  buildDataset,
  channelStats,
  describeColumnKey,
  makeEventPlacer,
  windowIndices,
} from "./pipeline";
import { DEFAULT_PROCESSING } from "./types";
import type { ActuationEvent, AssembledTable, Channel, ProcessingOptions } from "./types";

const f64 = (...v: number[]) => Float64Array.of(...v);
const arr = (v: ArrayLike<number>) => Array.from(v);

function assembled(over: Partial<AssembledTable> = {}): AssembledTable {
  return {
    timestamp: f64(0, 1, 2, 3),
    unit: "s",
    columns: [{ key: "GCS:hat0_ch0", values: f64(0, 10, 20, 30) }],
    rowCount: 4,
    ignoredColumns: [],
    primarySource: "GCS",
    alignments: [],
    unalignedSources: [],
    sourceRates: { GCS: 1 },
    ...over,
  };
}

const sensor = (over: Partial<SensorEntry> = {}): SensorEntry => ({
  name: "PT1",
  type: "PT",
  unit: "psi",
  binding: { source: "GCS", hat_id: 0, channel_id: 0 },
  ...over,
});

const opts = (over: Partial<ProcessingOptions> = {}): ProcessingOptions => ({
  ...DEFAULT_PROCESSING,
  ...over,
});

describe("buildDataset", () => {
  it("passes a sensor with no calibration through as raw", () => {
    const ds = buildDataset({ table: assembled(), sensors: [sensor()], options: opts() });
    expect(ds.channels).toHaveLength(1);
    expect(ds.channels[0].origin).toBe("raw");
    expect(arr(ds.channels[0].values)).toEqual([0, 10, 20, 30]);
    expect(ds.channels[0].applied).toEqual([]);
  });

  it("applies a calibration table and records it in the provenance", () => {
    const ds = buildDataset({
      table: assembled(),
      sensors: [sensor({ convert: { calibration: [[0, 0], [10, 100]] } })],
      options: opts(),
    });
    expect(ds.channels[0].origin).toBe("calibrated");
    expect(arr(ds.channels[0].values)).toEqual([0, 100, 200, 300]);
    expect(ds.channels[0].applied).toEqual(["calibration (2 pts)"]);
  });

  it("does not modify the table's raw columns", () => {
    const table = assembled();
    buildDataset({
      table,
      sensors: [sensor({ convert: { calibration: [[0, 5], [10, 6]] } })],
      options: opts(),
    });
    expect(arr(table.columns[0].values)).toEqual([0, 10, 20, 30]);
  });

  it("builds elapsed seconds, epoch ms and the sample rate from the timestamps", () => {
    const ds = buildDataset({
      table: assembled({ timestamp: f64(1700000000, 1700000001, 1700000002, 1700000003) }),
      sensors: [],
      options: opts(),
    });
    expect(arr(ds.elapsed)).toEqual([0, 1, 2, 3]);
    expect(ds.epochMs![0]).toBe(1700000000 * 1000);
    expect(ds.sampleRateHz).toBe(1);
  });

  it("falls back to the sample index when there is no clock", () => {
    const ds = buildDataset({
      table: assembled({ timestamp: null, unit: "none" }),
      sensors: [],
      options: opts(),
    });
    expect(arr(ds.elapsed)).toEqual([0, 1, 2, 3]);
    expect(ds.epochMs).toBeNull();
    expect(ds.sampleRateHz).toBeNull();
  });

  describe("skipped sensors", () => {
    it("reports a missing column when the source is loaded", () => {
      const ds = buildDataset({
        table: assembled(),
        sensors: [sensor({ name: "PT9", binding: { source: "GCS", hat_id: 7, channel_id: 7 } })],
        options: opts(),
      });
      expect(ds.skipped).toEqual([
        { name: "PT9", colKey: "hat7_ch7", source: "GCS", reason: "missing-column" },
      ]);
    });

    it("reports source-not-loaded for a subsystem that was never loaded", () => {
      const ds = buildDataset({
        table: assembled(),
        sensors: [sensor({ name: "TC1", binding: { source: "TCS", hat_id: 0, channel_id: 0 } })],
        options: opts(),
      });
      expect(ds.skipped[0].reason).toBe("source-not-loaded");
    });

    it("treats a merged secondary source as loaded", () => {
      const ds = buildDataset({
        table: assembled({
          alignments: [{ source: "TCS", mode: "epoch", columns: [], worstSkewS: 0 }],
        }),
        sensors: [sensor({ binding: { source: "TCS", hat_id: 9, channel_id: 9 } })],
        options: opts(),
      });
      expect(ds.skipped[0].reason).toBe("missing-column");
    });

    it("reports an invalid calibration with its message, without dropping other sensors", () => {
      const ds = buildDataset({
        table: assembled(),
        sensors: [
          sensor({ name: "bad", convert: { calibration: [[1, NaN]] } }),
          sensor({ name: "good" }),
        ],
        options: opts(),
      });
      expect(ds.skipped).toHaveLength(1);
      expect(ds.skipped[0]).toMatchObject({ name: "bad", reason: "invalid-calibration" });
      expect(ds.skipped[0].detail).toMatch(/non-numeric/);
      expect(ds.channels.map((c) => c.id)).toEqual(["good"]);
    });
  });

  it("resolves GCS and TCS sensors with the same header to different columns", () => {
    const ds = buildDataset({
      table: assembled({
        columns: [
          { key: "GCS:hat0_ch0", values: f64(1, 1, 1, 1) },
          { key: "TCS:hat0_ch0", values: f64(2, 2, 2, 2) },
        ],
        alignments: [{ source: "TCS", mode: "epoch", columns: ["TCS:hat0_ch0"], worstSkewS: 0 }],
      }),
      sensors: [
        sensor({ name: "PT", binding: { source: "GCS", hat_id: 0, channel_id: 0 } }),
        sensor({ name: "TC", binding: { source: "TCS", hat_id: 0, channel_id: 0 } }),
      ],
      options: opts(),
    });
    expect(arr(ds.channels[0].values)).toEqual([1, 1, 1, 1]);
    expect(arr(ds.channels[1].values)).toEqual([2, 2, 2, 2]);
  });

  it("lists columns no sensor referenced, sorted", () => {
    const ds = buildDataset({
      table: assembled({
        columns: [
          { key: "GCS:hat0_ch0", values: f64(0, 0, 0, 0) },
          { key: "GCS:z", values: f64(0, 0, 0, 0) },
          { key: "GCS:a", values: f64(0, 0, 0, 0) },
        ],
      }),
      sensors: [sensor()],
      options: opts(),
    });
    expect(ds.unboundColumns).toEqual(["GCS:a", "GCS:z"]);
  });

  describe("mass smoothing", () => {
    const n = 21;
    const table = assembled({
      timestamp: Float64Array.from({ length: n }, (_, i) => i),
      columns: [{ key: "GCS:hat0_ch0", values: Float64Array.from({ length: n }, (_, i) => i + (i % 2 ? 1 : -1)) }],
      rowCount: n,
    });

    it("smooths kg channels only", () => {
      const kg = buildDataset({ table, sensors: [sensor({ unit: "kg" })], options: opts({ savgolWindow: 5, savgolPolyorder: 2 }) });
      const psi = buildDataset({ table, sensors: [sensor({ unit: "psi" })], options: opts({ savgolWindow: 5, savgolPolyorder: 2 }) });
      expect(kg.channels[0].applied).toEqual(["Savitzky-Golay (w=5, p=2)"]);
      expect(kg.channels[0].values).not.toEqual(psi.channels[0].values);
      expect(psi.channels[0].applied).toEqual([]);
    });

    it("matches the unit case- and space-insensitively", () => {
      const ds = buildDataset({ table, sensors: [sensor({ unit: " KG " })], options: opts({ savgolWindow: 5, savgolPolyorder: 2 }) });
      expect(ds.channels[0].applied).toHaveLength(1);
    });

    it("is skipped when smoothMass is off", () => {
      const ds = buildDataset({ table, sensors: [sensor({ unit: "kg" })], options: opts({ smoothMass: false }) });
      expect(ds.channels[0].applied).toEqual([]);
    });

    it("reports no filter when the capture is shorter than the window", () => {
      const ds = buildDataset({ table, sensors: [sensor({ unit: "kg" })], options: opts({ savgolWindow: 99, savgolPolyorder: 2 }) });
      expect(ds.channels[0].applied).toEqual([]);
    });

    it("records the window actually used after normalising it", () => {
      const ds = buildDataset({ table, sensors: [sensor({ unit: "kg" })], options: opts({ savgolWindow: 4, savgolPolyorder: 2 }) });
      expect(ds.channels[0].applied).toEqual(["Savitzky-Golay (w=5, p=2)"]);
    });
  });

  describe("decimation", () => {
    const table = assembled({
      timestamp: f64(0, 1, 2, 3, 4, 5, 6),
      columns: [{ key: "GCS:hat0_ch0", values: f64(0, 1, 2, 3, 4, 5, 6) }],
      rowCount: 7,
      sourceRates: { GCS: 1 },
    });

    it("keeps every Nth row", () => {
      const ds = buildDataset({ table, sensors: [sensor()], options: opts({ decimate: 3 }) });
      expect(ds.rowCount).toBe(3);
      expect(arr(ds.elapsed)).toEqual([0, 3, 6]);
      expect(arr(ds.channels[0].values)).toEqual([0, 3, 6]);
    });

    it("lowers the effective sample rate of every channel", () => {
      const ds = buildDataset({ table, sensors: [sensor()], options: opts({ decimate: 3 }) });
      expect(ds.sampleRateHz).toBeCloseTo(1 / 3);
      expect(ds.channels[0].sampleRateHz).toBeCloseTo(1 / 3);
    });

    it.each([0, 1, -4, 0.2])("treats decimate=%s as no decimation", (decimate) => {
      const ds = buildDataset({ table, sensors: [sensor()], options: opts({ decimate }) });
      expect(ds.rowCount).toBe(7);
    });
  });

  it("caps a slow source's channel rate at its native rate", () => {
    const ds = buildDataset({
      table: assembled({
        timestamp: f64(0, 0.1, 0.2, 0.3),
        sourceRates: { GCS: 10, TCS: 2 },
        columns: [{ key: "TCS:hat0_ch0", values: f64(1, 1, 1, 1) }],
        alignments: [{ source: "TCS", mode: "elapsed", columns: ["TCS:hat0_ch0"], worstSkewS: 0 }],
      }),
      sensors: [sensor({ binding: { source: "TCS", hat_id: 0, channel_id: 0 } })],
      options: opts(),
    });
    expect(ds.sampleRateHz).toBeCloseTo(10);
    expect(ds.channels[0].sampleRateHz).toBe(2);
  });

  describe("events", () => {
    const ev = (id: string, elapsed: number): ActuationEvent => ({
      id,
      epochMs: 0,
      elapsed,
      kind: "relay",
      channel: "relay_1",
      actuator: null,
      actuatorType: null,
      state: "on",
      previousState: null,
      value: 1,
      previousValue: null,
      typeId: "",
      outsideCapture: false,
    });

    it("sorts events by time and flags those outside the capture", () => {
      const ds = buildDataset({
        table: assembled(),
        sensors: [],
        options: opts(),
        events: [ev("late", 99), ev("mid", 1.5), ev("early", -2)],
      });
      expect(ds.events.map((e) => [e.id, e.outsideCapture])).toEqual([
        ["early", true],
        ["mid", false],
        ["late", true],
      ]);
    });

    it("treats the capture's endpoints as inside", () => {
      const ds = buildDataset({ table: assembled(), sensors: [], options: opts(), events: [ev("a", 0), ev("b", 3)] });
      expect(ds.events.every((e) => !e.outsideCapture)).toBe(true);
    });
  });

  it("is deterministic", () => {
    const input = {
      table: assembled(),
      sensors: [sensor({ convert: { calibration: [[0, 1], [30, 7]] } })],
      options: opts(),
    };
    expect(buildDataset(input)).toEqual(buildDataset(input));
  });
});

describe("makeEventPlacer", () => {
  it("places wall-clock events on the elapsed axis", () => {
    const place = makeEventPlacer(assembled({ timestamp: f64(1.7e9, 1.7e9 + 1, 1.7e9 + 2, 1.7e9 + 3) }))!;
    expect(place((1.7e9 + 1.5) * 1000)).toEqual({ elapsed: 1.5, outside: false });
    expect(place((1.7e9 - 1) * 1000)).toEqual({ elapsed: -1, outside: true });
    expect(place((1.7e9 + 10) * 1000)!.outside).toBe(true);
  });

  it("returns null for a non-finite event time", () => {
    const place = makeEventPlacer(assembled({ timestamp: f64(1.7e9, 1.7e9 + 1) }))!;
    expect(place(NaN)).toBeNull();
  });

  it.each([
    ["an uptime counter", assembled({ timestamp: f64(0, 1000), unit: "ms" })],
    ["no timestamps", assembled({ timestamp: null, unit: "none" })],
    ["an empty timestamp column", assembled({ timestamp: new Float64Array(0) })],
  ])("returns null for %s, rather than guessing", (_n, table) => {
    expect(makeEventPlacer(table)).toBeNull();
  });
});

describe("describeColumnKey", () => {
  it("separates the source from the header", () => {
    expect(describeColumnKey("TCS:hat0_ch0")).toBe("TCS hat0_ch0");
    expect(describeColumnKey("hat0_ch0")).toBe("hat0_ch0");
  });
});

describe("windowIndices", () => {
  const elapsed = f64(0, 1, 2, 3, 4);

  it("covers everything for a null window", () => {
    expect(windowIndices(elapsed, null)).toEqual([0, 5]);
  });

  it("includes both ends of the window", () => {
    expect(windowIndices(elapsed, { start: 1, end: 3 })).toEqual([1, 4]);
  });

  it("snaps to the samples inside a window between samples", () => {
    expect(windowIndices(elapsed, { start: 0.5, end: 3.5 })).toEqual([1, 4]);
  });

  it("gives an empty range when the window misses the data", () => {
    const [lo, hi] = windowIndices(elapsed, { start: 10, end: 20 });
    expect(hi - lo).toBe(0);
    const [lo2, hi2] = windowIndices(elapsed, { start: -9, end: -1 });
    expect(hi2 - lo2).toBe(0);
  });
});

describe("channelStats", () => {
  const channel = (values: number[]): Channel => ({
    id: "c",
    name: "c",
    unit: "psi",
    type: "PT",
    origin: "raw",
    binding: { source: "GCS", colKey: "x" },
    values: Float64Array.from(values),
    applied: [],
    sampleRateHz: null,
  });
  const t = f64(0, 1, 2, 3);

  it("computes the basics, with a sample standard deviation", () => {
    const s = channelStats(channel([2, 4, 4, 6]), t, null);
    expect(s).toMatchObject({ count: 4, min: 2, max: 6, mean: 4, delta: 4 });
    expect(s.stdev).toBeCloseTo(Math.sqrt(8 / 3));
  });

  it("integrates with the trapezoid rule", () => {
    // 0->2 over 1 s = 1, 2->2 over 1 s = 2, 2->0 over 1 s = 1
    expect(channelStats(channel([0, 2, 2, 0]), t, null).integral).toBe(4);
  });

  it("does not bridge a gap when integrating", () => {
    const s = channelStats(channel([1, NaN, 1, 1]), t, null);
    // Only the last pair is adjacent: 1 * 1 s.
    expect(s.integral).toBe(1);
    expect(s.count).toBe(3);
  });

  it("restricts to the window", () => {
    const s = channelStats(channel([10, 20, 30, 40]), t, { start: 1, end: 2 });
    expect(s).toMatchObject({ count: 2, min: 20, max: 30, delta: 10 });
  });

  it("reports a single sample with zero spread and no integral", () => {
    const s = channelStats(channel([5, NaN, NaN, NaN]), t, null);
    expect(s).toMatchObject({ count: 1, stdev: 0, delta: 0, integral: null });
  });

  it("returns all-null stats for an empty or all-NaN selection, never zero", () => {
    const empty = { count: 0, min: null, max: null, mean: null, stdev: null, delta: null, integral: null };
    expect(channelStats(channel([NaN, NaN, NaN, NaN]), t, null)).toEqual(empty);
    expect(channelStats(channel([1, 2, 3, 4]), t, { start: 50, end: 60 })).toEqual(empty);
  });
});

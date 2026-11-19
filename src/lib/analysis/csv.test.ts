import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  CsvFormatError,
  assembleTables,
  chooseAlignment,
  detectSourceFromName,
  inferTimestampUnit,
  looksLikeActuatorCsv,
  looksLikeFasCsv,
  parseFasCsv,
  parseWideCsv,
  qualify,
  tableSampleRate,
  timestampToSeconds,
  unqualify,
} from "./csv";
import type { RawTable, SourceTable } from "./types";

const arr = (v: ArrayLike<number>) => Array.from(v);

function table(over: Partial<RawTable> & Pick<RawTable, "columns" | "rowCount">): RawTable {
  return { timestamp: null, unit: "none", ignoredColumns: [], ...over };
}

describe("inferTimestampUnit", () => {
  it.each([
    [1.7e9, "s"],
    [1.7e12, "ms"],
    [1.7e15, "us"],
    [1.7e18, "ns"],
    [5000, "ms"], // uptime counter
    [-1.7e12, "ms"],
    [0, "none"],
    [NaN, "none"],
    [Infinity, "none"],
  ])("%s -> %s", (value, unit) => {
    expect(inferTimestampUnit(value)).toBe(unit);
  });
});

describe("timestampToSeconds", () => {
  it.each([
    [2, "s", 2],
    [2500, "ms", 2.5],
    [3_000_000, "us", 3],
    [4e9, "ns", 4],
    [7, "none", 7],
  ] as const)("%s %s -> %s s", (value, unit, expected) => {
    expect(timestampToSeconds(value, unit)).toBe(expected);
  });
});

describe("parseWideCsv", () => {
  it("parses numeric columns and splits out the timestamp", () => {
    const t = parseWideCsv("timestamp,hat0_ch0,hat0_ch1\n1700000000,1.5,2\n1700000001,3,4\n");
    expect(t.rowCount).toBe(2);
    expect(t.unit).toBe("s");
    expect(arr(t.timestamp!)).toEqual([1700000000, 1700000001]);
    expect(t.columns.map((c) => c.key)).toEqual(["hat0_ch0", "hat0_ch1"]);
    expect(arr(t.columns[0].values)).toEqual([1.5, 3]);
  });

  it("takes the unit from a timestamp_ms header", () => {
    const t = parseWideCsv("timestamp_ms,a\n10,1\n20,2");
    expect(t.unit).toBe("ms");
  });

  it("infers ms from a Unix-ms magnitude", () => {
    const t = parseWideCsv("timestamp,a\n1700000000000,1\n1700000000100,2");
    expect(t.unit).toBe("ms");
  });

  it("has no time base when there is no timestamp column", () => {
    const t = parseWideCsv("a,b\n1,2\n3,4");
    expect(t.timestamp).toBeNull();
    expect(t.unit).toBe("none");
  });

  it("drops a timestamp column that holds no numbers", () => {
    const t = parseWideCsv("timestamp,a\nx,1\ny,2");
    expect(t.timestamp).toBeNull();
  });

  it("reports columns with no numeric data instead of throwing", () => {
    const t = parseWideCsv("timestamp,label,a\n1,foo,1\n2,bar,2");
    expect(t.ignoredColumns).toEqual(["label"]);
    expect(t.columns.map((c) => c.key)).toEqual(["a"]);
  });

  it("reads blank and non-numeric cells as NaN", () => {
    const t = parseWideCsv("a\n1\n\n2\nzzz\n3");
    // The blank line is skipped as an empty line; "zzz" becomes NaN.
    expect(arr(t.columns[0].values).map((v) => (Number.isNaN(v) ? "nan" : v))).toEqual([1, 2, "nan", 3]);
  });

  it("pads short rows with NaN", () => {
    const t = parseWideCsv("a,b\n1,2\n3");
    expect(t.columns[1].values[1]).toBeNaN();
  });

  it("handles CRLF line endings, a BOM and padded headers", () => {
    const t = parseWideCsv("﻿ a , b \r\n1,2\r\n3,4\r\n");
    expect(t.columns.map((c) => c.key)).toEqual(["a", "b"]);
    expect(t.rowCount).toBe(2);
  });

  it("honours quoted headers containing commas and escaped quotes", () => {
    const t = parseWideCsv('"a,b","c""d"\n1,2');
    expect(t.columns.map((c) => c.key)).toEqual(["a,b", 'c"d']);
  });

  it.each([[""], ["header only"], ["\n\n"]])("rejects %j as having no data rows", (text) => {
    expect(() => parseWideCsv(text)).toThrow(CsvFormatError);
  });

  it("round-trips arbitrary numeric tables", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }).chain((cols) =>
          fc.array(fc.array(fc.double({ noNaN: true, noDefaultInfinity: true }), { minLength: cols, maxLength: cols }), {
            minLength: 1,
            maxLength: 20,
          }),
        ),
        (rows) => {
          const n = rows[0].length;
          const header = Array.from({ length: n }, (_, i) => `c${i}`).join(",");
          const text = [header, ...rows.map((r) => r.join(","))].join("\n");
          const parsed = parseWideCsv(text);
          expect(parsed.rowCount).toBe(rows.length);
          const kept = parsed.columns.map((c) => c.key);
          // Every column has finite numbers, so none is dropped.
          expect(kept).toEqual(Array.from({ length: n }, (_, i) => `c${i}`));
          parsed.columns.forEach((c, ci) => {
            // `-0` prints as "0", so compare with the sign of zero erased.
            expect(arr(c.values)).toEqual(rows.map((r) => r[ci] + 0));
          });
        },
      ),
    );
  });

  it("never throws anything but CsvFormatError on arbitrary text", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 300 }), (text) => {
        try {
          const t = parseWideCsv(text);
          expect(t.rowCount).toBeGreaterThan(0);
          for (const c of t.columns) expect(c.values.length).toBe(t.rowCount);
        } catch (e) {
          expect(e).toBeInstanceOf(CsvFormatError);
        }
      }),
    );
  });
});

describe("parseFasCsv", () => {
  const header = "timestamp_ms,node,channel,value";

  it("pivots long format into {node}_ch{channel} columns", () => {
    const t = parseFasCsv([header, "100,EPB_0,0,1", "100,EPB_0,1,2", "200,EPB_0,0,3"].join("\n"));
    expect(t.unit).toBe("ms");
    expect(arr(t.timestamp!)).toEqual([100, 200]);
    expect(t.columns.map((c) => c.key)).toEqual(["EPB_0_ch0", "EPB_0_ch1"]);
    expect(arr(t.columns[0].values)).toEqual([1, 3]);
    expect(arr(t.columns[1].values).map((v) => (Number.isNaN(v) ? "nan" : v))).toEqual([2, "nan"]);
  });

  it("averages duplicate (timestamp, column) pairs", () => {
    const t = parseFasCsv([header, "100,N,0,2", "100,N,0,4"].join("\n"));
    expect(arr(t.columns[0].values)).toEqual([3]);
  });

  it("sorts rows by timestamp", () => {
    const t = parseFasCsv([header, "300,N,0,3", "100,N,0,1", "200,N,0,2"].join("\n"));
    expect(arr(t.timestamp!)).toEqual([100, 200, 300]);
    expect(arr(t.columns[0].values)).toEqual([1, 2, 3]);
  });

  it("skips rows with a non-numeric timestamp", () => {
    const t = parseFasCsv([header, "bad,N,0,9", "100,N,0,1"].join("\n"));
    expect(t.rowCount).toBe(1);
  });

  it("keeps a column whose values are all non-numeric, as all NaN", () => {
    const t = parseFasCsv([header, "100,N,0,1", "100,N,1,oops"].join("\n"));
    expect(t.columns.map((c) => c.key)).toEqual(["N_ch0", "N_ch1"]);
    expect(t.columns[1].values[0]).toBeNaN();
  });

  it("matches headers case-insensitively and trims", () => {
    const t = parseFasCsv(" Timestamp_MS , Node , Channel , Value \n1,N,0,5");
    expect(arr(t.columns[0].values)).toEqual([5]);
  });

  it("names every missing column in the error", () => {
    expect(() => parseFasCsv("timestamp_ms,node\n1,N")).toThrow(/channel, value/);
  });

  it("rejects a file with no data rows or no usable rows", () => {
    expect(() => parseFasCsv(header)).toThrow(CsvFormatError);
    expect(() => parseFasCsv([header, "x,N,0,1"].join("\n"))).toThrow(/no usable rows/);
  });
});

describe("format sniffing", () => {
  it("recognises the FAS long format", () => {
    expect(looksLikeFasCsv("timestamp_ms,node,channel,value\n")).toBe(true);
    expect(looksLikeFasCsv("timestamp,hat0_ch0\n")).toBe(false);
    expect(looksLikeFasCsv("")).toBe(false);
  });

  it("recognises actuator logs by type_id or channel columns", () => {
    expect(looksLikeActuatorCsv("timestamp,type_id,x\n")).toBe(true);
    expect(looksLikeActuatorCsv("timestamp,relay_8,servo_9\n")).toBe(true);
    expect(looksLikeActuatorCsv("timestamp,gpio_17\n")).toBe(true);
    expect(looksLikeActuatorCsv("timestamp,hat0_ch0\n")).toBe(false);
    expect(looksLikeActuatorCsv("")).toBe(false);
  });
});

describe("detectSourceFromName", () => {
  it.each([
    ["novaGround_run1_sensors.csv", "GCS"],
    ["NOVAOPS-2026.csv", "GCS"],
    ["run_gcs.csv", "GCS"],
    ["novaThermo_run1_sensors.csv", "TCS"],
    ["run-tcs-1.csv", "TCS"],
    ["novaFAS_main.csv", "FAS"],
    ["fas.csv", "FAS"],
    ["mygcs.csv", null],
    ["sensors.csv", null],
    ["", null],
  ] as const)("%s -> %s", (name, source) => {
    expect(detectSourceFromName(name)).toBe(source);
  });
});

describe("qualify / unqualify", () => {
  it("round-trips a known source", () => {
    expect(qualify("TCS", "hat0_ch0")).toBe("TCS:hat0_ch0");
    expect(unqualify("TCS:hat0_ch0")).toEqual({ source: "TCS", colKey: "hat0_ch0" });
  });

  it("leaves a key with no known prefix whole", () => {
    expect(unqualify("hat0_ch0")).toEqual({ source: null, colKey: "hat0_ch0" });
    expect(unqualify("XYZ:hat0")).toEqual({ source: null, colKey: "XYZ:hat0" });
  });

  it("splits only at the first colon", () => {
    expect(unqualify("GCS:a:b")).toEqual({ source: "GCS", colKey: "a:b" });
  });
});

describe("tableSampleRate", () => {
  it("is the mean rate over the capture", () => {
    const t = table({ timestamp: Float64Array.of(0, 500, 1000, 1500, 2000), unit: "ms", columns: [], rowCount: 5 });
    expect(tableSampleRate(t)).toBe(2);
  });

  it.each([
    ["no timestamps", table({ columns: [], rowCount: 3 })],
    ["one sample", table({ timestamp: Float64Array.of(5), unit: "s", columns: [], rowCount: 1 })],
    ["zero span", table({ timestamp: Float64Array.of(5, 5), unit: "s", columns: [], rowCount: 2 })],
    ["unit none", table({ timestamp: Float64Array.of(1, 2), unit: "none", columns: [], rowCount: 2 })],
  ])("is null for %s", (_n, t) => {
    expect(tableSampleRate(t)).toBeNull();
  });
});

describe("chooseAlignment", () => {
  const clock = (start: number, n: number, unit: RawTable["unit"] = "s") =>
    table({ timestamp: Float64Array.from({ length: n }, (_, i) => start + i), unit, columns: [], rowCount: n });

  it("uses epoch when both are wall-clock and overlap", () => {
    expect(chooseAlignment(clock(1.7e9, 10), clock(1.7e9 + 5, 10))).toBe("epoch");
  });

  it("uses elapsed when the wall-clock spans do not overlap", () => {
    expect(chooseAlignment(clock(1.7e9, 10), clock(1.7e9 + 100, 10))).toBe("elapsed");
  });

  it("uses elapsed when either is an uptime counter", () => {
    expect(chooseAlignment(clock(1.7e9, 10), clock(0, 10))).toBe("elapsed");
    expect(chooseAlignment(clock(0, 10), clock(1.7e9, 10))).toBe("elapsed");
  });

  it("uses elapsed when either has no clock", () => {
    expect(chooseAlignment(clock(1.7e9, 10), table({ columns: [], rowCount: 3 }))).toBe("elapsed");
  });

  it("converts units before comparing", () => {
    const ms = table({
      timestamp: Float64Array.from({ length: 10 }, (_, i) => 1.7e12 + i * 1000),
      unit: "ms",
      columns: [],
      rowCount: 10,
    });
    // Same wall-clock instants in different units: overlap only after conversion.
    expect(chooseAlignment(ms, clock(1.7e9 + 3, 10, "s"))).toBe("epoch");
  });
});

describe("assembleTables", () => {
  const src = (source: SourceTable["source"], t: RawTable): SourceTable => ({ ...t, source });

  it("returns null when nothing usable is loaded", () => {
    expect(assembleTables([])).toBeNull();
    expect(assembleTables([src("GCS", table({ columns: [], rowCount: 0 }))])).toBeNull();
  });

  it("qualifies a single source's columns", () => {
    const out = assembleTables([
      src("GCS", table({ timestamp: Float64Array.of(0, 1), unit: "s", columns: [{ key: "hat0_ch0", values: Float64Array.of(1, 2) }], rowCount: 2 })),
    ])!;
    expect(out.primarySource).toBe("GCS");
    expect(out.columns.map((c) => c.key)).toEqual(["GCS:hat0_ch0"]);
    expect(out.alignments).toEqual([]);
  });

  it("keeps identical GCS and TCS headers as separate columns", () => {
    const mk = (v: number) =>
      table({ timestamp: Float64Array.of(0, 1), unit: "s", columns: [{ key: "hat0_ch0", values: Float64Array.of(v, v) }], rowCount: 2 });
    const out = assembleTables([src("TCS", mk(2)), src("GCS", mk(1))])!;
    expect(out.columns.map((c) => c.key)).toEqual(["GCS:hat0_ch0", "TCS:hat0_ch0"]);
    expect(arr(out.columns[1].values)).toEqual([2, 2]);
  });

  it("prefers GCS, then TCS, then FAS as the timeline", () => {
    const mk = () => table({ timestamp: Float64Array.of(0, 1), unit: "s", columns: [{ key: "a", values: Float64Array.of(1, 2) }], rowCount: 2 });
    expect(assembleTables([src("FAS", mk()), src("TCS", mk())])!.primarySource).toBe("TCS");
    expect(assembleTables([src("FAS", mk()), src("TCS", mk()), src("GCS", mk())])!.primarySource).toBe("GCS");
  });

  it("prefers a source that has a clock over a preferred one that has none", () => {
    const noClock = table({ columns: [{ key: "a", values: Float64Array.of(1, 2) }], rowCount: 2 });
    const clocked = table({ timestamp: Float64Array.of(0, 1), unit: "s", columns: [{ key: "a", values: Float64Array.of(1, 2) }], rowCount: 2 });
    const out = assembleTables([src("GCS", noClock), src("FAS", clocked)])!;
    expect(out.primarySource).toBe("FAS");
    expect(out.unalignedSources).toEqual(["GCS"]);
    expect(out.columns.map((c) => c.key)).toEqual(["FAS:a"]);
  });

  it("matches wall-clock logs on absolute time and reports the worst skew", () => {
    const base = 1.7e9;
    const gcs = table({ timestamp: Float64Array.of(base, base + 1, base + 2, base + 3), unit: "s", columns: [{ key: "g", values: Float64Array.of(0, 0, 0, 0) }], rowCount: 4 });
    const tcs = table({
      timestamp: Float64Array.of(base + 0.1, base + 1.1, base + 2.1, base + 3.1),
      unit: "s",
      columns: [{ key: "t", values: Float64Array.of(10, 11, 12, 13) }],
      rowCount: 4,
    });
    const out = assembleTables([src("GCS", gcs), src("TCS", tcs)])!;
    expect(out.alignments).toHaveLength(1);
    expect(out.alignments[0].mode).toBe("epoch");
    expect(out.alignments[0].columns).toEqual(["TCS:t"]);
    expect(out.alignments[0].worstSkewS).toBeCloseTo(0.1, 3);
    expect(arr(out.columns[1].values)).toEqual([10, 11, 12, 13]);
  });

  it("zeroes each log at its own start when the clocks are unrelated", () => {
    const gcs = table({ timestamp: Float64Array.of(0, 1000, 2000), unit: "ms", columns: [{ key: "g", values: Float64Array.of(0, 0, 0) }], rowCount: 3 });
    const fas = table({ timestamp: Float64Array.of(5000, 6000, 7000), unit: "ms", columns: [{ key: "f", values: Float64Array.of(1, 2, 3) }], rowCount: 3 });
    const out = assembleTables([src("GCS", gcs), src("FAS", fas)])!;
    expect(out.alignments[0].mode).toBe("elapsed");
    expect(arr(out.columns[1].values)).toEqual([1, 2, 3]);
    expect(out.alignments[0].worstSkewS).toBe(0);
  });

  it("matches per column against rows where that channel has a reading", () => {
    const gcs = table({ timestamp: Float64Array.of(0, 1, 2, 3), unit: "s", columns: [{ key: "g", values: Float64Array.of(0, 0, 0, 0) }], rowCount: 4 });
    const fas = table({
      timestamp: Float64Array.of(0, 1, 2, 3),
      unit: "s",
      columns: [{ key: "f", values: Float64Array.of(1, NaN, 3, NaN) }],
      rowCount: 4,
    });
    const out = assembleTables([src("GCS", gcs), src("FAS", fas)])!;
    // No blanks: each gap takes the nearest real reading (ties go earlier).
    expect(arr(out.columns[1].values)).toEqual([1, 1, 3, 3]);
  });

  it("leaves a secondary channel with no readings entirely NaN", () => {
    const gcs = table({ timestamp: Float64Array.of(0, 1), unit: "s", columns: [], rowCount: 2 });
    const fas = table({ timestamp: Float64Array.of(0, 1), unit: "s", columns: [{ key: "f", values: Float64Array.of(NaN, NaN) }], rowCount: 2 });
    const out = assembleTables([src("GCS", gcs), src("FAS", fas)])!;
    expect(arr(out.columns[0].values).every(Number.isNaN)).toBe(true);
  });

  it("records each source's native sample rate and qualifies ignored columns", () => {
    const gcs = table({ timestamp: Float64Array.of(0, 500, 1000), unit: "ms", columns: [], rowCount: 3, ignoredColumns: ["junk"] });
    const fas = table({ timestamp: Float64Array.of(0, 2000), unit: "ms", columns: [], rowCount: 2, ignoredColumns: ["other"] });
    const out = assembleTables([src("GCS", gcs), src("FAS", fas)])!;
    expect(out.sourceRates).toEqual({ GCS: 2, FAS: 0.5 });
    expect(out.ignoredColumns).toEqual(["GCS:junk", "FAS:other"]);
  });
});

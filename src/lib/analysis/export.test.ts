import { afterEach, describe, expect, it, vi } from "vitest";

import { buildCalibratedCsv, downloadCsv, exportColumnName } from "./export";
import type { Channel, Dataset } from "./types";

const f64 = (...v: number[]) => Float64Array.of(...v);

const channel = (name: string, unit: string, values: Float64Array): Channel => ({
  id: name,
  name,
  unit,
  type: "PT",
  origin: "calibrated",
  binding: { source: "GCS", colKey: "x" },
  values,
  applied: [],
  sampleRateHz: null,
});

function dataset(over: Partial<Dataset> = {}): Dataset {
  return {
    elapsed: f64(0, 1, 2),
    epochMs: null,
    channels: [],
    skipped: [],
    rowCount: 3,
    unboundColumns: [],
    sampleRateHz: null,
    primarySource: "GCS",
    alignments: [],
    unalignedSources: [],
    events: [],
    ...over,
  };
}

describe("exportColumnName", () => {
  it("follows the offline script's cal_<name>[<unit>] naming", () => {
    expect(exportColumnName(channel("MFT", "kg", f64()))).toBe("cal_MFT[kg]");
  });

  it("omits the brackets when there is no unit", () => {
    expect(exportColumnName(channel("X", "", f64()))).toBe("cal_X");
  });
});

describe("buildCalibratedCsv", () => {
  it("uses a sample index column when the data has no wall clock", () => {
    const csv = buildCalibratedCsv(dataset(), [channel("PT1", "psi", f64(10, 20, 30))]);
    expect(csv.split("\n")).toEqual(["sample,elapsed_s,cal_PT1[psi]", "0,0,10", "1,1,20", "2,2,30"]);
  });

  it("writes epoch and ISO time columns when the data has a wall clock", () => {
    const csv = buildCalibratedCsv(
      dataset({ epochMs: f64(1700000000000, 1700000001000, 1700000002000) }),
      [channel("PT1", "psi", f64(1, 2, 3))],
    );
    const lines = csv.split("\n");
    expect(lines[0]).toBe("timestamp,time,elapsed_s,cal_PT1[psi]");
    expect(lines[1]).toBe("1700000000000,2023-11-14T22:13:20.000,0,1");
  });

  it("leaves gaps and non-finite values as empty cells", () => {
    const csv = buildCalibratedCsv(dataset(), [channel("PT1", "psi", f64(1, NaN, Infinity))]);
    expect(csv.split("\n").slice(1)).toEqual(["0,0,1", "1,1,", "2,2,"]);
  });

  it("restricts rows to the window", () => {
    const csv = buildCalibratedCsv(dataset(), [channel("PT1", "psi", f64(1, 2, 3))], { window: { start: 1, end: 1 } });
    expect(csv.split("\n")).toEqual(["sample,elapsed_s,cal_PT1[psi]", "1,1,2"]);
  });

  it("carries raw columns through only with keepRaw", () => {
    const raw = [{ key: "GCS:hat0_ch0", values: f64(7, 8, 9) }];
    const ch = [channel("PT1", "psi", f64(1, 2, 3))];
    expect(buildCalibratedCsv(dataset(), ch, { rawColumns: raw })).not.toContain("hat0_ch0");
    const withRaw = buildCalibratedCsv(dataset(), ch, { keepRaw: true, rawColumns: raw }).split("\n");
    expect(withRaw[0]).toBe("sample,elapsed_s,GCS:hat0_ch0,cal_PT1[psi]");
    expect(withRaw[1]).toBe("0,0,7,1");
  });

  it("quotes a header containing a comma or a quote", () => {
    const csv = buildCalibratedCsv(dataset(), [channel('a,"b"', "", f64(1, 2, 3))]);
    expect(csv.split("\n")[0]).toBe('sample,elapsed_s,"cal_a,""b"""');
  });

  it("writes only the header for an empty window", () => {
    const csv = buildCalibratedCsv(dataset(), [], { window: { start: 50, end: 60 } });
    expect(csv).toBe("sample,elapsed_s");
  });

  it("blanks the ISO time for a non-finite epoch", () => {
    const csv = buildCalibratedCsv(dataset({ epochMs: f64(NaN, 1000, 2000) }), []);
    expect(csv.split("\n")[1]).toBe(",,0");
  });
});

describe("downloadCsv", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("clicks a temporary download link and releases the object URL", () => {
    const create = vi.fn(() => "blob:fake");
    const revoke = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe("out.csv");
      expect(this.href).toBe("blob:fake");
    });

    downloadCsv("a,b\n1,2", "out.csv");

    expect(click).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith("blob:fake");
    expect(document.querySelector("a")).toBeNull();
  });

  it("still releases the object URL if the click throws", () => {
    const revoke = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: () => "blob:fake", revokeObjectURL: revoke });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => downloadCsv("x", "f.csv")).toThrow("blocked");
    expect(revoke).toHaveBeenCalledWith("blob:fake");
  });
});

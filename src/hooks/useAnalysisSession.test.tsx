import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { downloadDataFile } from "@/lib/api";
import type { ActuatorEntry, SensorEntry } from "@/lib/types";
import { useAnalysisSession } from "./useAnalysisSession";

vi.mock("@/lib/api", () => ({ downloadDataFile: vi.fn() }));

const T0 = 1_700_000_000;

const sensors: SensorEntry[] = [
  { name: "PT1", type: "PT", unit: "psi", binding: { source: "GCS", hat_id: 0, channel_id: 0 } },
  { name: "TC1", type: "TC", unit: "C", binding: { source: "TCS", hat_id: 0, channel_id: 0 } },
];
const actuators: ActuatorEntry[] = [
  { name: "Fill", type: "solenoid", binding: { target: "GCS", relay_channel: 0 }, actions: { solenoid_type: "nominally_closed" } },
];

const gcsCsv = `timestamp,hat0_ch0\n${T0},1\n${T0 + 1},2\n${T0 + 2},3`;
const tcsCsv = `timestamp,hat0_ch0\n${T0},10\n${T0 + 1},20\n${T0 + 2},30`;
const actuatorCsv = `timestamp,relay_0,type_id\n${T0 * 1000},0,start\n${(T0 + 1) * 1000},1,relay`;

const file = (name: string, text: string) => new File([text], name, { type: "text/csv" });

function setup() {
  return renderHook(() => useAnalysisSession(sensors, actuators));
}

async function load(view: ReturnType<typeof setup>, name: string, text: string, source?: "GCS" | "TCS" | "FAS") {
  await act(() => view.result.current.loadLocalFile(file(name, text), source));
}

beforeEach(() => {
  vi.mocked(downloadDataFile).mockReset();
});

describe("useAnalysisSession: loading", () => {
  it("starts empty", () => {
    const { result } = setup();
    expect(result.current).toMatchObject({ files: [], dataset: null, window: null, fullRange: null, loading: false, error: null });
  });

  it("builds a calibrated-ready dataset from one local sensor file", async () => {
    const view = setup();
    await load(view, "novaGround_run1_sensors.csv", gcsCsv);
    const s = view.result.current;
    expect(s.files).toHaveLength(1);
    expect(s.files[0]).toMatchObject({ origin: "local", slot: "sensors", source: "GCS", sourceInferred: false, rowCount: 3 });
    expect(s.dataset?.channels.map((c) => c.id)).toEqual(["PT1"]);
    expect(s.fullRange).toEqual({ start: 0, end: 2 });
    expect(s.loading).toBe(false);
  });

  it("flags a source that was only guessed because the file name said nothing", async () => {
    const view = setup();
    await load(view, "run.csv", gcsCsv);
    expect(view.result.current.files[0]).toMatchObject({ source: "GCS", sourceInferred: true });
  });

  it("lets the caller's explicit source win over the file name", async () => {
    const view = setup();
    await load(view, "novaGround_run.csv", tcsCsv, "TCS");
    expect(view.result.current.files[0]).toMatchObject({ source: "TCS", sourceInferred: false });
  });

  it("recognises a long-format FAS log by its header, whatever it is called", async () => {
    const view = setup();
    await load(view, "run.csv", "timestamp_ms,node,channel,value\n1000,EPB_0,0,5\n2000,EPB_0,0,6");
    expect(view.result.current.files[0]).toMatchObject({ source: "FAS", sourceInferred: false });
  });

  it("keeps GCS and TCS logs with identical headers as separate channels", async () => {
    const view = setup();
    await load(view, "novaGround_a.csv", gcsCsv);
    await load(view, "novaThermo_a.csv", tcsCsv);
    const channels = view.result.current.dataset!.channels;
    expect(channels.map((c) => [c.id, Array.from(c.values)])).toEqual([
      ["PT1", [1, 2, 3]],
      ["TC1", [10, 20, 30]],
    ]);
  });

  it("replaces an earlier log from the same subsystem", async () => {
    const view = setup();
    await load(view, "novaGround_a.csv", gcsCsv);
    await load(view, "novaGround_b.csv", gcsCsv);
    expect(view.result.current.files.map((f) => f.name)).toEqual(["novaGround_b.csv"]);
  });

  it("puts an actuator log in the actuator slot and derives events from it", async () => {
    const view = setup();
    await load(view, "novaGround_a.csv", gcsCsv);
    await load(view, "novaGround_actuators.csv", actuatorCsv);
    expect(view.result.current.actuatorFiles).toHaveLength(1);
    expect(view.result.current.sensorFiles).toHaveLength(1);
    expect(view.result.current.eventsUnplaceable).toBe(false);
    expect(view.result.current.dataset?.events.map((e) => e.actuator)).toContain("Fill");
  });

  it("says events are unplaceable when there is no sensor log to anchor them", async () => {
    const view = setup();
    await load(view, "novaGround_actuators.csv", actuatorCsv);
    expect(view.result.current.eventsUnplaceable).toBe(true);
    expect(view.result.current.dataset).toBeNull();
  });

  it("says events are unplaceable when the sensor clock is an uptime counter", async () => {
    const view = setup();
    await load(view, "novaGround_a.csv", "timestamp,hat0_ch0\n0,1\n1000,2");
    await load(view, "novaGround_actuators.csv", actuatorCsv);
    expect(view.result.current.eventsUnplaceable).toBe(true);
  });

  it("downloads a backend file and tags it as such", async () => {
    vi.mocked(downloadDataFile).mockResolvedValue(new Blob([gcsCsv]));
    const view = setup();
    await act(() => view.result.current.loadBackendFile("novaGround_x.csv"));
    expect(downloadDataFile).toHaveBeenCalledWith("novaGround_x.csv");
    expect(view.result.current.files[0]).toMatchObject({ origin: "backend", name: "novaGround_x.csv" });
  });
});

describe("useAnalysisSession: errors and races", () => {
  it("reports a malformed CSV as an error and loads nothing", async () => {
    const view = setup();
    await load(view, "bad.csv", "just a header");
    expect(view.result.current.error).toMatch(/no data rows/i);
    expect(view.result.current.files).toEqual([]);
    expect(view.result.current.loading).toBe(false);
  });

  it("reports a failed download and can clear the error", async () => {
    vi.mocked(downloadDataFile).mockRejectedValue(new Error("NovaOps API error 404"));
    const view = setup();
    await act(() => view.result.current.loadBackendFile("gone.csv"));
    expect(view.result.current.error).toBe("NovaOps API error 404");
    act(() => view.result.current.clearError());
    expect(view.result.current.error).toBeNull();
  });

  it("clears an earlier error when the next load starts", async () => {
    const view = setup();
    await load(view, "bad.csv", "x");
    expect(view.result.current.error).not.toBeNull();
    await load(view, "novaGround_a.csv", gcsCsv);
    expect(view.result.current.error).toBeNull();
  });

  it("is loading while a download is in flight", async () => {
    let finish!: (b: Blob) => void;
    vi.mocked(downloadDataFile).mockReturnValue(new Promise((r) => (finish = r)));
    const view = setup();
    let pending!: Promise<void>;
    act(() => {
      pending = view.result.current.loadBackendFile("a.csv");
    });
    expect(view.result.current.loading).toBe(true);
    await act(async () => {
      finish(new Blob([gcsCsv]));
      await pending;
    });
    expect(view.result.current.loading).toBe(false);
  });

  it("drops a slow earlier load that finishes after a newer one", async () => {
    let finishSlow!: (b: Blob) => void;
    vi.mocked(downloadDataFile).mockReturnValueOnce(new Promise((r) => (finishSlow = r)));
    const view = setup();
    let slow!: Promise<void>;
    act(() => {
      slow = view.result.current.loadBackendFile("novaGround_slow.csv");
    });
    await load(view, "novaGround_fast.csv", gcsCsv);
    await act(async () => {
      finishSlow(new Blob([gcsCsv]));
      await slow;
    });
    expect(view.result.current.files.map((f) => f.name)).toEqual(["novaGround_fast.csv"]);
    expect(view.result.current.loading).toBe(false);
  });
});

describe("useAnalysisSession: editing the session", () => {
  it("removes one file", async () => {
    const view = setup();
    await load(view, "novaGround_a.csv", gcsCsv);
    await load(view, "novaThermo_a.csv", tcsCsv);
    const id = view.result.current.files[0].id;
    act(() => view.result.current.removeFile(id));
    expect(view.result.current.files).toHaveLength(1);
  });

  it("clear removes everything, resets the window and the error", async () => {
    const view = setup();
    await load(view, "novaGround_a.csv", gcsCsv);
    act(() => view.result.current.setWindow({ start: 0, end: 1 }));
    act(() => view.result.current.clear());
    expect(view.result.current).toMatchObject({ files: [], dataset: null, window: null, error: null });
  });

  it("clear also cancels a load that is still in flight", async () => {
    let finish!: (b: Blob) => void;
    vi.mocked(downloadDataFile).mockReturnValue(new Promise((r) => (finish = r)));
    const view = setup();
    let pending!: Promise<void>;
    act(() => {
      pending = view.result.current.loadBackendFile("a.csv");
    });
    act(() => view.result.current.clear());
    await act(async () => {
      finish(new Blob([gcsCsv]));
      await pending;
    });
    expect(view.result.current.files).toEqual([]);
  });

  it("loading a new sensor log resets the time window", async () => {
    const view = setup();
    await load(view, "novaGround_a.csv", gcsCsv);
    act(() => view.result.current.setWindow({ start: 0, end: 1 }));
    await load(view, "novaThermo_a.csv", tcsCsv);
    expect(view.result.current.window).toBeNull();
  });

  it("merges processing option changes and resets them", async () => {
    const view = setup();
    act(() => view.result.current.setOptions({ decimate: 4 }));
    act(() => view.result.current.setOptions({ smoothMass: false }));
    expect(view.result.current.options).toMatchObject({ decimate: 4, smoothMass: false, savgolWindow: 51 });
    act(() => view.result.current.resetOptions());
    expect(view.result.current.options).toMatchObject({ decimate: 1, smoothMass: true });
  });

  it("re-processes the dataset when an option changes", async () => {
    const view = setup();
    await load(view, "novaGround_a.csv", gcsCsv);
    act(() => view.result.current.setOptions({ decimate: 2 }));
    await waitFor(() => expect(view.result.current.dataset?.rowCount).toBe(2));
  });

  describe("setFileSource", () => {
    it("re-tags a file, and the pipeline re-resolves its columns against the right sensors", async () => {
      const view = setup();
      await load(view, "mystery.csv", tcsCsv); // guessed GCS
      expect(view.result.current.dataset!.channels.map((c) => c.id)).toEqual(["PT1"]);
      act(() => view.result.current.setFileSource(view.result.current.files[0].id, "TCS"));
      expect(view.result.current.files[0]).toMatchObject({ source: "TCS", sourceInferred: false });
      expect(view.result.current.dataset!.channels.map((c) => c.id)).toEqual(["TC1"]);
    });

    it("pushes aside whatever already occupied that subsystem's slot", async () => {
      const view = setup();
      await load(view, "novaGround_a.csv", gcsCsv);
      await load(view, "novaThermo_a.csv", tcsCsv);
      act(() => view.result.current.setFileSource(view.result.current.files.find((f) => f.source === "TCS")!.id, "GCS"));
      expect(view.result.current.files).toHaveLength(1);
      expect(view.result.current.files[0].name).toBe("novaThermo_a.csv");
    });

    it("does nothing for the same source or an unknown id", async () => {
      const view = setup();
      await load(view, "novaGround_a.csv", gcsCsv);
      const before = view.result.current.files;
      act(() => view.result.current.setFileSource(before[0].id, "GCS"));
      act(() => view.result.current.setFileSource("nope", "TCS"));
      expect(view.result.current.files).toBe(before);
    });
  });
});

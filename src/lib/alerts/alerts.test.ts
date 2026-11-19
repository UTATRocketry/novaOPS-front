import { describe, expect, it, vi } from "vitest";

import type { FlightTelemetry } from "@/lib/store";
import { emitAlertEvent, onAlertEvent } from "./bus";
import { CONDITION_SOURCES } from "./sources";
import { batterySource } from "./sources/battery";
import { sdCardSource } from "./sources/sdCard";
import { streamHealthSource } from "./sources/streamHealth";
import { SEVERITIES_DESC, SEVERITY_RANK } from "./types";
import type { AlertSourceContext } from "./types";

function ctx(over: Partial<AlertSourceContext> = {}): AlertSourceContext {
  return {
    flightData: null,
    flightDataStatus: "live",
    engineDataStatus: "live",
    actuatorStatesStatus: "live",
    lockoutStatus: "live",
    socketStatus: "open",
    now: 0,
    ...over,
  };
}

const flight = (v: unknown) => v as FlightTelemetry;

describe("batterySource", () => {
  const pmb = (vmon: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    ctx({ flightData: flight({ pmb: { PMB_0: { vmon, ...extra } } }) });

  it("is silent with no PMB data", () => {
    expect(batterySource.evaluate(ctx())).toEqual([]);
    expect(batterySource.evaluate(ctx({ flightData: flight({}) }))).toEqual([]);
  });

  it("is silent for a healthy pack", () => {
    expect(batterySource.evaluate(pmb({ vBatt: 16.8 }, { charger: { cells: 4 } }))).toEqual([]);
  });

  it("raises a fault when battery protect is engaged", () => {
    const [a] = batterySource.evaluate(pmb({ protect: true }));
    expect(a).toMatchObject({ id: "battery:PMB_0:protect", severity: "fault" });
  });

  it.each([
    [14.0, 4, "warn", "battery low"], // 3.50 V/cell: at the warn threshold
    [13.4, 4, "warn", "battery low"],
    [13.2, 4, "fault", "battery critical"], // 3.30 V/cell: at the critical threshold
    [10, 4, "fault", "battery critical"],
  ])("%s V on %d cells -> %s", (v, cells, severity, title) => {
    const [a] = batterySource.evaluate(pmb({ vBatt: v }, { charger: { cells } }));
    expect(a).toMatchObject({ id: "battery:PMB_0:low", severity, title: `PMB_0 ${title}` });
  });

  it("describes the reading in volts and volts per cell", () => {
    const [a] = batterySource.evaluate(pmb({ vBatt: 13.2 }, { charger: { cells: 4 } }));
    expect(a.detail).toBe("13.20 V (3.30 V/cell across 4 cells).");
  });

  it("takes the cell count from the charger config when the charger omits it", () => {
    const [a] = batterySource.evaluate(pmb({ vBatt: 13.2 }, { chgCfg: { cells: 4 } }));
    expect(a.severity).toBe("fault");
  });

  it("stays silent without a cell count, rather than inventing a threshold", () => {
    expect(batterySource.evaluate(pmb({ vBatt: 3 }))).toEqual([]);
  });

  it("does not judge a pack that is charging", () => {
    expect(batterySource.evaluate(pmb({ vBatt: 10 }, { charger: { cells: 4, charging: true } }))).toEqual([]);
  });

  it("reports protect and low together", () => {
    const alerts = batterySource.evaluate(pmb({ vBatt: 10, protect: true }, { charger: { cells: 4 } }));
    expect(alerts.map((a) => a.id)).toEqual(["battery:PMB_0:protect", "battery:PMB_0:low"]);
  });

  it("evaluates every board", () => {
    const alerts = batterySource.evaluate(
      ctx({ flightData: flight({ pmb: { A: { vmon: { protect: true } }, B: { vmon: { protect: true } } } }) }),
    );
    expect(alerts.map((a) => a.id)).toEqual(["battery:A:protect", "battery:B:protect"]);
  });
});

describe("sdCardSource", () => {
  const sd = (s: Record<string, unknown>) => ctx({ flightData: flight({ fmc: { FMC_0: { sd: s } } }) });
  const ids = (s: Record<string, unknown>) => sdCardSource.evaluate(sd(s)).map((a) => [a.id, a.severity]);

  it("is silent with no FMC or SD data", () => {
    expect(sdCardSource.evaluate(ctx())).toEqual([]);
    expect(sdCardSource.evaluate(ctx({ flightData: flight({ fmc: { FMC_0: {} } }) }))).toEqual([]);
  });

  it("is silent for a healthy card", () => {
    expect(ids({ stateName: "ok", pctUsed: 10 })).toEqual([]);
  });

  it("raises a fault when full, by flag or by state name in any case", () => {
    expect(ids({ full: true })).toEqual([["sd:FMC_0:full", "fault"]]);
    expect(ids({ stateName: "FULL" })).toEqual([["sd:FMC_0:full", "fault"]]);
  });

  it("warns when nearly full, with the percentage if known", () => {
    expect(ids({ nearFull: true })).toEqual([["sd:FMC_0:nearfull", "warn"]]);
    expect(sdCardSource.evaluate(sd({ nearFull: true, pctUsed: 92 }))[0].detail).toBe("92% used.");
    expect(sdCardSource.evaluate(sd({ nearFull: true }))[0].detail).toBeUndefined();
  });

  it("reports full instead of nearly full, not both", () => {
    expect(ids({ full: true, nearFull: true })).toEqual([["sd:FMC_0:full", "fault"]]);
  });

  it("faults on a stalled logger and warns on a reduced rate, not both", () => {
    expect(ids({ stalled: true })).toEqual([["sd:FMC_0:stalled", "fault"]]);
    expect(ids({ rateReduced: true })).toEqual([["sd:FMC_0:ratereduced", "warn"]]);
    expect(ids({ stalled: true, rateReduced: true })).toEqual([["sd:FMC_0:stalled", "fault"]]);
  });

  it("reports an error code", () => {
    const [a] = sdCardSource.evaluate(sd({ err: 7 }));
    expect(a).toMatchObject({ id: "sd:FMC_0:error", severity: "error", detail: "Error code 7." });
  });

  it("can report several problems at once", () => {
    expect(ids({ full: true, stalled: true, err: 1 }).map(([id]) => id)).toEqual([
      "sd:FMC_0:full",
      "sd:FMC_0:stalled",
      "sd:FMC_0:error",
    ]);
  });
});

describe("streamHealthSource", () => {
  const ids = (c: AlertSourceContext) => streamHealthSource.evaluate(c).map((a) => a.id);

  it("is silent when everything is live", () => {
    expect(ids(ctx())).toEqual([]);
  });

  it("raises an error on a socket transport error", () => {
    expect(streamHealthSource.evaluate(ctx({ socketStatus: "error" }))[0]).toMatchObject({
      id: "stream:link:error",
      severity: "error",
    });
  });

  it("warns when the engine or flight stream is stale", () => {
    expect(ids(ctx({ engineDataStatus: "stale" }))).toEqual(["stream:engine:stale"]);
    expect(ids(ctx({ flightDataStatus: "stale" }))).toEqual(["stream:flight:stale"]);
  });

  it("does not alert on a quiet actuator stream (it only changes on commands)", () => {
    expect(ids(ctx({ actuatorStatesStatus: "stale" }))).toEqual([]);
  });

  it("does not alert on a plain disconnect, which the connection dot already shows", () => {
    expect(
      ids(ctx({ socketStatus: "disconnected", engineDataStatus: "disconnected", flightDataStatus: "disconnected" })),
    ).toEqual([]);
  });
});

describe("condition source registry", () => {
  it("registers the three sources with unique ids", () => {
    expect(CONDITION_SOURCES.map((s) => s.id)).toEqual(["battery", "sd", "stream"]);
  });

  it("every source tolerates an empty context", () => {
    for (const s of CONDITION_SOURCES) expect(() => s.evaluate(ctx())).not.toThrow();
  });
});

describe("alert bus", () => {
  const alert = { severity: "error", title: "API down", source: "api" } as const;

  it("delivers to every listener until unsubscribed", () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = onAlertEvent(a);
    const offB = onAlertEvent(b);
    emitAlertEvent(alert);
    expect(a).toHaveBeenCalledWith(alert);
    expect(b).toHaveBeenCalledWith(alert);
    offA();
    emitAlertEvent(alert);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
    offB();
  });

  it("is a no-op when nobody is listening", () => {
    expect(() => emitAlertEvent(alert)).not.toThrow();
  });

  it("isolates a throwing listener from the emitter and from other listeners", () => {
    const bad = vi.fn(() => {
      throw new Error("bad listener");
    });
    const good = vi.fn();
    const offBad = onAlertEvent(bad);
    const offGood = onAlertEvent(good);
    expect(() => emitAlertEvent(alert)).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
    offBad();
    offGood();
  });
});

describe("severity tables", () => {
  it("lists severities from most to least severe", () => {
    const ranks = SEVERITIES_DESC.map((s) => SEVERITY_RANK[s]);
    expect(ranks).toEqual([...ranks].sort((a, b) => b - a));
    expect(SEVERITIES_DESC).toEqual(["fault", "error", "warn", "info"]);
  });
});

import { describe, expect, it } from "vitest";

import type { ActuatorEntry } from "@/lib/types";
import { buildChannelOwners, deriveActuationEvents, parseActuatorCsv } from "./actuators";
import { CsvFormatError } from "./csv";
import type { ActuatorLog } from "./types";

const arr = (v: ArrayLike<number>) => Array.from(v);

const solenoid = (name: string, relay: number, type = "nominally_closed", target: "GCS" | "FAS" = "GCS"): ActuatorEntry => ({
  name,
  type: "solenoid",
  binding: { target, relay_channel: relay },
  actions: { solenoid_type: type },
});

const servo: ActuatorEntry = {
  name: "MainValve",
  type: "servo",
  binding: { target: "GCS", servo_channel: 9, relay_channel: 4 },
  actions: { positions: [900, 1900], position_aliases: ["closed", "open"] },
};

describe("parseActuatorCsv", () => {
  const csv = [
    "timestamp,relay_0,servo_9,gpio_17,type_id",
    "1000,0,0,0,start_data_saving",
    "2000,1,0,0,relay",
    "3000,1,1900,,servo",
  ].join("\n");

  it("reads channels, timestamps and type ids", () => {
    const log = parseActuatorCsv(csv, "GCS");
    expect(log.source).toBe("GCS");
    expect(log.rowCount).toBe(3);
    expect(arr(log.timestamp)).toEqual([1000, 2000, 3000]);
    expect(log.channels.map((c) => c.key)).toEqual(["relay_0", "servo_9", "gpio_17"]);
    expect(arr(log.channels[1].values)).toEqual([0, 0, 1900]);
    expect(log.typeIds).toEqual(["start_data_saving", "relay", "servo"]);
  });

  it("reads a blank cell as NaN", () => {
    expect(parseActuatorCsv(csv, "GCS").channels[2].values[2]).toBeNaN();
  });

  it("leaves type ids empty when the column is absent", () => {
    const log = parseActuatorCsv("timestamp,relay_0\n1,0\n2,1", "FAS");
    expect(log.typeIds).toEqual(["", ""]);
  });

  it("accepts timestamp_ms and CRLF/BOM", () => {
    const log = parseActuatorCsv("﻿timestamp_ms,relay_0\r\n1,0\r\n2,1\r\n", "GCS");
    expect(arr(log.timestamp)).toEqual([1, 2]);
  });

  it("ignores columns that are not channels", () => {
    const log = parseActuatorCsv("timestamp,note,relay_0\n1,x,0\n2,y,1", "GCS");
    expect(log.channels.map((c) => c.key)).toEqual(["relay_0"]);
  });

  it.each([
    ["no data rows", "timestamp,relay_0"],
    ["no timestamp column", "time,relay_0\n1,0"],
    ["no channel columns", "timestamp,type_id\n1,x"],
  ])("rejects a file with %s", (_n, text) => {
    expect(() => parseActuatorCsv(text, "GCS")).toThrow(CsvFormatError);
  });
});

describe("buildChannelOwners", () => {
  it("maps a servo to its position channel and its power relay", () => {
    const owners = buildChannelOwners([servo], "GCS");
    expect(owners.get("servo_9")).toMatchObject({ role: "position" });
    expect(owners.get("relay_4")).toMatchObject({ role: "power" });
    expect(owners.get("servo_9")!.actuator).toBe(servo);
  });

  it("maps a solenoid's relay as its position channel", () => {
    expect(buildChannelOwners([solenoid("S1", 2)], "GCS").get("relay_2")).toMatchObject({ role: "position" });
  });

  it("only includes actuators on the log's own subsystem", () => {
    const owners = buildChannelOwners([solenoid("G", 0, "nominally_closed", "GCS"), solenoid("F", 0, "nominally_closed", "FAS")], "FAS");
    expect(owners.get("relay_0")!.actuator.name).toBe("F");
  });

  it("treats a missing target as GCS", () => {
    const a = { name: "A", type: "solenoid", binding: { relay_channel: 1 } } as unknown as ActuatorEntry;
    expect(buildChannelOwners([a], "GCS").has("relay_1")).toBe(true);
    expect(buildChannelOwners([a], "FAS").has("relay_1")).toBe(false);
  });

  it("does not let a servo's power relay displace a solenoid that owns the channel", () => {
    const sol = solenoid("Vent", 4);
    expect(buildChannelOwners([sol, servo], "GCS").get("relay_4")!.actuator.name).toBe("Vent");
    expect(buildChannelOwners([servo, sol], "GCS").get("relay_4")!.actuator.name).toBe("Vent");
  });
});

describe("deriveActuationEvents", () => {
  const toElapsed = (ms: number) => ({ elapsed: (ms - 1000) / 1000, outside: false });

  function log(rows: Array<{ t: number; id?: string; relay_0?: number; servo_9?: number; relay_4?: number }>): ActuatorLog {
    const keys = ["relay_0", "servo_9", "relay_4"] as const;
    return {
      source: "GCS",
      timestamp: Float64Array.from(rows.map((r) => r.t)),
      channels: keys.map((k) => ({ key: k, values: Float64Array.from(rows.map((r) => r[k] ?? 0)) })),
      typeIds: rows.map((r) => r.id ?? ""),
      rowCount: rows.length,
    };
  }

  it("emits the first row as a baseline recording marker", () => {
    const events = deriveActuationEvents(log([{ t: 1000, id: "start_data_saving" }]), { actuators: [], toElapsed });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "recording", state: "start_data_saving", elapsed: 0 });
  });

  it("labels a baseline with no type id as 'baseline'", () => {
    const events = deriveActuationEvents(log([{ t: 1000 }]), { actuators: [], toElapsed });
    expect(events[0].state).toBe("baseline");
  });

  it("derives a solenoid event with the flow state from solenoid_type", () => {
    const events = deriveActuationEvents(
      log([{ t: 1000 }, { t: 2000, relay_0: 1, id: "relay" }]),
      { actuators: [solenoid("Fill", 0)], toElapsed },
    ).filter((e) => e.kind === "relay");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actuator: "Fill",
      actuatorType: "solenoid",
      state: "on · open",
      previousState: "off · closed",
      value: 1,
      previousValue: 0,
      elapsed: 1,
    });
  });

  it("inverts the flow wording for a nominally open solenoid", () => {
    const events = deriveActuationEvents(
      log([{ t: 1000 }, { t: 2000, relay_0: 1 }]),
      { actuators: [solenoid("Vent", 0, "nominally_open")], toElapsed },
    ).filter((e) => e.kind === "relay");
    expect(events[0].state).toBe("on · closed");
  });

  it("names a servo position by its alias, and an unknown pulse by its width", () => {
    const events = deriveActuationEvents(
      log([{ t: 1000 }, { t: 2000, servo_9: 1900 }, { t: 3000, servo_9: 1234 }, { t: 4000, servo_9: 0 }]),
      { actuators: [servo], toElapsed },
    ).filter((e) => e.kind === "servo");
    expect(events.map((e) => e.state)).toEqual(["open", "1234 µs", "released"]);
    expect(events[0].previousState).toBe("released");
  });

  it("marks a servo's power relay as power, not as the servo's position", () => {
    const events = deriveActuationEvents(
      log([{ t: 1000 }, { t: 2000, relay_4: 1 }]),
      { actuators: [servo], toElapsed },
    ).filter((e) => e.kind === "relay");
    expect(events[0].state).toBe("power on");
    expect(events[0].actuator).toBe("MainValve");
  });

  it("reports an unclaimed channel unless includeUnmapped is off", () => {
    const rows = [{ t: 1000 }, { t: 2000, relay_0: 1 }];
    const withUnmapped = deriveActuationEvents(log(rows), { actuators: [], toElapsed }).filter((e) => e.kind === "relay");
    expect(withUnmapped[0]).toMatchObject({ actuator: null, state: "on" });
    const without = deriveActuationEvents(log(rows), { actuators: [], toElapsed, includeUnmapped: false });
    expect(without.filter((e) => e.kind === "relay")).toEqual([]);
  });

  it("emits a marker for a row with no change but a new type id", () => {
    const events = deriveActuationEvents(
      log([{ t: 1000, id: "start" }, { t: 2000, id: "stop_data_saving" }, { t: 3000, id: "stop_data_saving" }]),
      { actuators: [], toElapsed },
    );
    expect(events.map((e) => e.state)).toEqual(["start", "stop_data_saving"]);
  });

  it("emits one event per channel that changed in a row", () => {
    const events = deriveActuationEvents(
      log([{ t: 1000 }, { t: 2000, relay_0: 1, servo_9: 900 }]),
      { actuators: [], toElapsed },
    ).filter((e) => e.kind !== "recording");
    expect(events.map((e) => e.channel).sort()).toEqual(["relay_0", "servo_9"]);
  });

  it("does not treat NaN -> NaN as a change", () => {
    const l = log([{ t: 1000 }, { t: 2000 }]);
    l.channels[0].values.fill(NaN);
    expect(deriveActuationEvents(l, { actuators: [], toElapsed })).toHaveLength(1);
  });

  it("skips rows the capture cannot place or with a bad timestamp", () => {
    const l = log([{ t: 1000 }, { t: NaN, relay_0: 1 }, { t: 3000, relay_0: 0 }]);
    const events = deriveActuationEvents(l, { actuators: [], toElapsed: (ms) => (ms > 2500 ? null : toElapsed(ms)) });
    expect(events).toHaveLength(1);
  });

  it("carries the placement's outside flag and sorts by elapsed time", () => {
    const events = deriveActuationEvents(
      log([{ t: 1000 }, { t: 2000, relay_0: 1 }, { t: 3000, relay_0: 0 }]),
      { actuators: [], toElapsed: (ms) => ({ elapsed: -ms, outside: ms > 2500 }) },
    );
    expect(events.map((e) => e.elapsed)).toEqual([-3000, -2000, -1000]);
    expect(events[0].outsideCapture).toBe(true);
  });

  it("gives every event a unique id", () => {
    const events = deriveActuationEvents(
      log([{ t: 1000 }, { t: 2000, relay_0: 1, servo_9: 900 }, { t: 3000, relay_0: 0 }]),
      { actuators: [], toElapsed },
    );
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
  });
});

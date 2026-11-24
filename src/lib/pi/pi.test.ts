import { describe, expect, it } from "vitest";

import {
  actuatorTrip,
  actuatorTripText,
  mismatchText,
  outputLabel,
  parsePiConfigStatus,
  parsePiConfigStatusMessage,
  piHealth,
  sensorFault,
  sensorFaultLabel,
  sensorFaultReadout,
  tripReasonLabel,
} from "./index";

// The status view from the backend contract (issue #40).
const STATUS = {
  node: "novaThermo",
  target: "TCS",
  expected_hash: "3f9a1c0be27d4a55",
  received: true,
  config_hash: "3f9a1c0be27d4a55",
  applied_ms: 1795110000000,
  rejected: [{ item: "gpio.outputs.8", reason: "reserved (SPI0 CE0)" }],
  reserved_pins: [0, 1, 2, 3, 7, 8, 9, 10, 11, 12, 13, 16, 20, 21, 26],
  thermocouples: { "1": { "0": "K", "1": "T" } },
  tripped: [{ output: "gpio:17", reason: "comms_loss", time_ms: 1795110123456, actuators: ["TANK-HTR-PWR"] }],
  mismatch: true,
  mismatch_reasons: ["rejected"],
};

describe("sensor faults", () => {
  it("reads the fault, treating null, absent and empty as a good reading", () => {
    expect(sensorFault({ fault: "open" })).toBe("open");
    expect(sensorFault({ fault: null })).toBeNull();
    expect(sensorFault({})).toBeNull();
    expect(sensorFault({ fault: "" })).toBeNull();
    expect(sensorFault(undefined)).toBeNull();
  });

  it.each([
    ["open", "open", "TC OPEN"],
    ["common_mode", "common mode", "TC COMMON MODE"],
    ["overrange", "overrange", "TC OVERRANGE"],
    ["new_fault", "new fault", "TC NEW FAULT"],
  ])("labels %s", (fault, label, readout) => {
    expect(sensorFaultLabel(fault)).toBe(label);
    expect(sensorFaultReadout(fault)).toBe(readout);
  });
});

describe("trips", () => {
  it("reads a trip from the actuator state's flat keys", () => {
    const trip = actuatorTrip({ arming: "disarmed", tripped: "comms_loss", tripped_output: "gpio:17", tripped_ms: 5 });
    expect(trip).toEqual({ reason: "comms_loss", output: "gpio:17", timeMs: 5 });
    expect(actuatorTripText(trip!)).toBe("Tripped: comms loss (GPIO 17)");
  });

  it("is null without a trip", () => {
    expect(actuatorTrip({ arming: "armed" })).toBeNull();
    expect(actuatorTrip(null)).toBeNull();
  });

  it("copes with a trip that names no output", () => {
    const trip = actuatorTrip({ tripped: "max_on_time" })!;
    expect(trip).toEqual({ reason: "max_on_time", output: null, timeMs: null });
    expect(actuatorTripText(trip)).toBe("Tripped: max on-time");
  });

  it("labels outputs and reasons", () => {
    expect(outputLabel("gpio:27")).toBe("GPIO 27");
    expect(outputLabel("relay:3")).toBe("relay 3");
    expect(outputLabel("servo:1")).toBe("servo:1");
    expect(tripReasonLabel("max_on_time")).toBe("max on-time");
    expect(tripReasonLabel("comms_loss")).toBe("comms loss");
    expect(tripReasonLabel("watch_dog")).toBe("watch dog");
  });
});

describe("parsePiConfigStatus", () => {
  it("keeps the contract's status view", () => {
    expect(parsePiConfigStatus(STATUS)).toEqual(STATUS);
  });

  it("parses the WS message, taking the node from the envelope if needed", () => {
    const { node: _n, ...noNode } = STATUS;
    expect(parsePiConfigStatusMessage({ type: "pi_config_status", node: "novaThermo", status: noNode })?.node).toBe("novaThermo");
  });

  it("rejects a status with no node, or no object", () => {
    expect(parsePiConfigStatus({ received: true })).toBeNull();
    expect(parsePiConfigStatus("nope")).toBeNull();
    expect(parsePiConfigStatusMessage({ type: "pi_config_status", node: "x", status: null })).toBeNull();
  });

  it("fills empty lists for a Pi that hasn't answered yet", () => {
    const s = parsePiConfigStatus({ node: "novaGround", target: "GCS", expected_hash: "ab", received: false })!;
    expect(s).toMatchObject({ received: false, rejected: [], tripped: [], thermocouples: {}, mismatch: false, config_hash: null });
    expect(piHealth(s)).toBe("unknown");
  });

  it("derives the mismatch only when the backend leaves it out", () => {
    const { mismatch: _m, mismatch_reasons: _r, ...rest } = STATUS;
    expect(parsePiConfigStatus({ ...rest, rejected: [], config_hash: "other" })!.mismatch).toBe(true);
    expect(parsePiConfigStatus({ ...rest, rejected: [] })!.mismatch).toBe(false);
    expect(parsePiConfigStatus({ ...STATUS, mismatch: false })!.mismatch).toBe(false);
  });

  it("drops malformed list entries' bad fields instead of throwing", () => {
    const s = parsePiConfigStatus({ ...STATUS, tripped: [{ output: "relay:2" }, 7], rejected: ["x", { item: "daq.9" }] })!;
    expect(s.tripped).toEqual([{ output: "relay:2", reason: "unknown", time_ms: null, actuators: [] }]);
    expect(s.rejected).toEqual([{ item: "daq.9", reason: "" }]);
  });
});

describe("piHealth and mismatchText", () => {
  const parsed = parsePiConfigStatus(STATUS)!;

  it("ranks trips over a mismatch over ok", () => {
    expect(piHealth(parsed)).toBe("tripped");
    expect(piHealth({ ...parsed, tripped: [] })).toBe("mismatch");
    expect(piHealth({ ...parsed, tripped: [], mismatch: false })).toBe("ok");
    expect(piHealth(undefined)).toBe("unknown");
  });

  it("explains a mismatch", () => {
    expect(mismatchText(parsed)).toEqual(["1 item rejected"]);
    expect(mismatchText({ ...parsed, rejected: [], config_hash: "0000", mismatch_reasons: ["config_hash"] })).toEqual([
      "Pi has config 0000, backend sent 3f9a1c0be27d4a55",
    ]);
  });
});

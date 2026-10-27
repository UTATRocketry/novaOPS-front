import { describe, expect, it } from "vitest";

import type { ActuatorEntry, SensorEntry, SystemConfig } from "../types";
import { validateConfig } from "./validate";

const sensor = (over: Partial<SensorEntry> = {}): SensorEntry => ({
  name: "PT1",
  type: "PT",
  binding: { source: "GCS", hat_id: 0, channel_id: 0 },
  ...over,
});

const actuator = (over: Partial<ActuatorEntry> = {}): ActuatorEntry => ({
  name: "V1",
  type: "solenoid",
  binding: { target: "GCS", relay_channel: 0 },
  ...over,
});

const motor = (binding: ActuatorEntry["binding"], actions?: ActuatorEntry["actions"]): ActuatorEntry => ({
  name: "M1",
  type: "motor",
  binding,
  actions,
});

describe("validateConfig", () => {
  it("accepts an empty config", () => {
    expect(validateConfig({})).toEqual([]);
  });

  it("accepts a well-formed config", () => {
    const config: SystemConfig = {
      Sensors: [
        sensor(),
        sensor({ name: "TC1", type: "TC", binding: { source: "TCS", hat_id: 1, channel_id: 2 } }),
        sensor({ name: "LC1", type: "LC", binding: { source: "FAS", node: "EPB_0", channel: 1 }, convert: { calibration: [[0, 0], [1, 2]] } }),
      ],
      Actuators: [actuator(), actuator({ name: "S1", type: "servo", binding: { target: "FAS", servo_channel: 1 }, actions: { positions: [1, 2], position_aliases: ["a", "b"] } })],
      Commands: { Abort: { binding: { target: "OPS" } } },
      safetyRules: { critical: [], hazardous: [] },
    };
    expect(validateConfig(config)).toEqual([]);
  });

  describe("sensors", () => {
    it("requires a name", () => {
      expect(validateConfig({ Sensors: [sensor({ name: "  " })] })).toEqual(["Sensor #1: name is required."]);
    });

    it("rejects duplicate names, pointing at the second", () => {
      expect(validateConfig({ Sensors: [sensor(), sensor()] })).toEqual(['Sensor #2: duplicate name "PT1".']);
    });

    it("rejects an unknown type", () => {
      const errors = validateConfig({ Sensors: [sensor({ type: "XX" as never })] });
      expect(errors).toEqual(["Sensor #1 (PT1): type must be one of PT, LC, TC."]);
    });

    it("requires a binding", () => {
      expect(validateConfig({ Sensors: [sensor({ binding: undefined as never })] })).toEqual([
        "Sensor #1 (PT1): binding is required.",
      ]);
    });

    it("requires node and numeric channel for FAS", () => {
      const errors = validateConfig({ Sensors: [sensor({ binding: { source: "FAS", node: " ", channel: "1" as never } })] });
      expect(errors).toEqual([
        "Sensor #1 (PT1): FAS binding requires node.",
        "Sensor #1 (PT1): FAS binding requires numeric channel.",
      ]);
    });

    it.each(["GCS", "TCS"] as const)("requires numeric hat_id and channel_id for %s", (source) => {
      const errors = validateConfig({ Sensors: [sensor({ binding: { source, hat_id: "0" as never, channel_id: undefined as never } })] });
      expect(errors).toEqual([
        `Sensor #1 (PT1): ${source} binding requires numeric hat_id.`,
        `Sensor #1 (PT1): ${source} binding requires numeric channel_id.`,
      ]);
    });

    it("rejects a binding source it does not know", () => {
      const errors = validateConfig({ Sensors: [sensor({ binding: { source: "OPS" } as never })] });
      expect(errors).toEqual(["Sensor #1 (PT1): binding.source must be GCS, TCS, or FAS."]);
    });

    it.each([
      ["not an array", "nope"],
      ["a non-pair", [[1, 2, 3]]],
      ["a string entry", [[1, "2"]]],
    ])("rejects a calibration that is %s", (_n, calibration) => {
      const errors = validateConfig({ Sensors: [sensor({ convert: { calibration: calibration as never } })] });
      expect(errors).toEqual(["Sensor #1 (PT1): calibration must be a list of [measured, real] number pairs."]);
    });

    it("reports a problem on every sensor, numbered from 1", () => {
      const errors = validateConfig({ Sensors: [sensor({ name: "" }), sensor({ name: "ok" }), sensor({ name: "" })] });
      expect(errors).toEqual(["Sensor #1: name is required.", "Sensor #3: name is required."]);
    });
  });

  describe("actuators", () => {
    it("requires a name and rejects duplicates", () => {
      expect(validateConfig({ Actuators: [actuator({ name: "" })] })).toEqual(["Actuator #1: name is required."]);
      expect(validateConfig({ Actuators: [actuator(), actuator()] })).toEqual(['Actuator #2: duplicate name "V1".']);
    });

    it("lets a sensor and an actuator share a name", () => {
      expect(validateConfig({ Sensors: [sensor({ name: "X" })], Actuators: [actuator({ name: "X" })] })).toEqual([]);
    });

    it("rejects an unknown type", () => {
      const errors = validateConfig({ Actuators: [actuator({ type: "pump" as never })] });
      expect(errors[0]).toMatch(/^Actuator #1 \(V1\): type must be one of servo, solenoid, /);
    });

    it.each([undefined, { target: "XYZ" }])("requires a known binding.target (%j)", (binding) => {
      const errors = validateConfig({ Actuators: [actuator({ binding: binding as never })] });
      expect(errors).toEqual(["Actuator #1 (V1): binding.target must be one of GCS, FAS, TCS, OPS."]);
    });

    it("requires position_aliases and positions to be the same length", () => {
      const errors = validateConfig({ Actuators: [actuator({ type: "servo", actions: { positions: [1, 2, 3], position_aliases: ["a"] } })] });
      expect(errors).toEqual(["Actuator #1 (V1): position_aliases and positions must be the same length."]);
    });

    it("does not require a node for a FAS actuator (the backend decides)", () => {
      expect(validateConfig({ Actuators: [actuator({ binding: { target: "FAS", relay_channel: 0 } })] })).toEqual([]);
    });
  });

  describe("motors", () => {
    it("requires a relay channel", () => {
      expect(validateConfig({ Actuators: [motor({ target: "GCS" })] })).toEqual(["Actuator #1 (M1): motor requires binding.relay_channel."]);
    });

    it("accepts a one-way motor with relay and default labels", () => {
      expect(validateConfig({ Actuators: [motor({ target: "GCS", relay_channel: 1 })] })).toEqual([]);
    });

    it("requires a reverse relay when reversible", () => {
      const errors = validateConfig({ Actuators: [motor({ target: "GCS", relay_channel: 1 }, { reversible: true })] });
      expect(errors).toEqual(["Actuator #1 (M1): reversible motor requires binding.reverse_relay_channel."]);
    });

    it("requires the two relays to differ", () => {
      const errors = validateConfig({ Actuators: [motor({ target: "GCS", relay_channel: 2, reverse_relay_channel: 2 }, { reversible: true })] });
      expect(errors).toEqual(["Actuator #1 (M1): relay_channel and reverse_relay_channel must differ."]);
    });

    it("accepts a reversible motor with three labels", () => {
      const config = { Actuators: [motor({ target: "GCS", relay_channel: 1, reverse_relay_channel: 2 }, { reversible: true, state_labels: ["fwd", "stop", "rev"] })] };
      expect(validateConfig(config)).toEqual([]);
    });

    it.each([
      [true, ["a", "b"], "exactly 3 entries when reversible is true"],
      [false, ["a", "b", "c"], "exactly 2 entries when reversible is false"],
    ])("checks the label count (reversible=%s)", (reversible, labels, text) => {
      const binding = { target: "GCS" as const, relay_channel: 1, reverse_relay_channel: 2 };
      const errors = validateConfig({ Actuators: [motor(binding, { reversible, state_labels: labels })] });
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain(text);
    });

    it("requires unique labels, ignoring case", () => {
      const errors = validateConfig({ Actuators: [motor({ target: "GCS", relay_channel: 1 }, { state_labels: ["On", "ON"] })] });
      expect(errors).toEqual(["Actuator #1 (M1): state_labels must be unique."]);
    });

    it("ignores an empty label list (defaults apply)", () => {
      expect(validateConfig({ Actuators: [motor({ target: "GCS", relay_channel: 1 }, { state_labels: [] })] })).toEqual([]);
    });
  });

  describe("commands and safety rules", () => {
    it("requires a known binding.target on every command", () => {
      const errors = validateConfig({
        Commands: { A: { binding: { target: "GCS" } }, B: { binding: { target: "XYZ" as never } }, C: {} as never },
      });
      expect(errors).toEqual([
        'Command "B": binding.target must be one of GCS, FAS, TCS, OPS.',
        'Command "C": binding.target must be one of GCS, FAS, TCS, OPS.',
      ]);
    });

    it("requires safety rule groups to be lists", () => {
      const errors = validateConfig({ safetyRules: { critical: {} as never, hazardous: [{ V1: "ALL" }] } });
      expect(errors).toEqual(["safetyRules.critical must be a list."]);
    });
  });

  it("collects errors from every section together", () => {
    const errors = validateConfig({
      Sensors: [sensor({ name: "" })],
      Actuators: [actuator({ name: "" })],
      Commands: { X: {} as never },
    });
    expect(errors).toHaveLength(3);
  });
});

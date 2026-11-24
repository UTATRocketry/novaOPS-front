import { describe, expect, it } from "vitest";

import type { ActuatorEntry, SensorEntry, SystemConfig } from "../types";
import {
  PI_GPIO_PINS,
  RESERVED_PINS,
  gpioChannelOptions,
  isUsablePiPin,
  piPinProblem,
  supportsOutputLimits,
} from "./piIo";
import { validateConfig } from "./validate";

const actuator = (over: Partial<ActuatorEntry> = {}): ActuatorEntry => ({
  name: "A1",
  type: "gpio_device",
  binding: { target: "TCS", gpio_channel: 17 },
  ...over,
});

const di = (over: Partial<SensorEntry> = {}): SensorEntry => ({
  name: "DOOR",
  type: "DI",
  binding: { source: "TCS", gpio_channel: 5 },
  ...over,
});

describe("Pi GPIO pins", () => {
  it("offers BCM 0-27 without the reserved pins on GCS and TCS", () => {
    expect(PI_GPIO_PINS).toEqual([4, 5, 6, 14, 15, 17, 18, 19, 22, 23, 24, 25, 27]);
    expect(gpioChannelOptions("GCS")).toEqual(PI_GPIO_PINS);
    expect(gpioChannelOptions("TCS")).toEqual(PI_GPIO_PINS);
  });

  it("keeps the FAS on 0-15", () => {
    expect(gpioChannelOptions("FAS")).toEqual(Array.from({ length: 16 }, (_, i) => i));
  });

  it("matches the reserved list in the design doc", () => {
    expect(RESERVED_PINS).toEqual([0, 1, 2, 3, 7, 8, 9, 10, 11, 12, 13, 16, 20, 21, 26]);
  });

  it.each([
    [17, null],
    [8, "BCM 8 is reserved"],
    [28, "must be a BCM pin 0-27"],
    [-1, "must be a BCM pin 0-27"],
    [4.5, "must be a BCM pin 0-27"],
  ])("pin %s -> %s", (pin, problem) => {
    expect(piPinProblem(pin)).toBe(problem);
    expect(isUsablePiPin(pin)).toBe(problem === null);
  });

  it("limits apply to Pi relay/GPIO types only", () => {
    expect(supportsOutputLimits(actuator())).toBe(true);
    expect(supportsOutputLimits(actuator({ type: "motor", binding: { target: "GCS", relay_channel: 1 } }))).toBe(true);
    expect(supportsOutputLimits(actuator({ type: "servo", binding: { target: "GCS", servo_channel: 1 } }))).toBe(false);
    expect(supportsOutputLimits(actuator({ binding: { target: "FAS", gpio_channel: 1 } }))).toBe(false);
  });
});

describe("validateConfig: Pi I/O", () => {
  const errs = (config: SystemConfig) => validateConfig(config);

  it("accepts the design doc's test-config additions", () => {
    expect(
      errs({
        Actuators: [
          actuator({ name: "TANK-HTR-PWR", actions: { gpio_commands: ["ARM", "DISARM"], max_on_s: 1800, on_comms_loss: "safe" } }),
          actuator({ name: "TANK-HTR-HEAT", binding: { target: "TCS", gpio_channel: 27 }, actions: { max_on_s: 600, on_comms_loss: "safe" } }),
          actuator({ name: "Relay", type: "powered_device", binding: { target: "GCS", relay_channel: 2 }, actions: { relay_type: "nominally_off", max_on_s: 30, on_comms_loss: "safe" } }),
        ],
        Heartbeat: { timeout_ms: 2000 },
      }),
    ).toEqual([]);
  });

  describe("actuators", () => {
    it("rejects an OPS target, which has no command path", () => {
      expect(errs({ Actuators: [actuator({ type: "solenoid", binding: { target: "OPS" } })] })).toEqual([
        "Actuator #1 (A1): target OPS has no command path; use GCS, FAS, TCS.",
      ]);
    });

    it("still accepts OPS on a command", () => {
      expect(errs({ Commands: { Abort: { binding: { target: "OPS" } } } })).toEqual([]);
    });

    it.each(["GCS", "TCS"] as const)("requires gpio_channel for a %s GPIO actuator", (target) => {
      expect(errs({ Actuators: [actuator({ type: "powered_gpio_device", binding: { target, relay_channel: 3 } })] })).toEqual([
        `Actuator #1 (A1): ${target} powered_gpio_device requires binding.gpio_channel.`,
      ]);
    });

    it("keeps the FAS relay_channel fallback", () => {
      expect(errs({ Actuators: [actuator({ binding: { target: "FAS", node: "EPB_0", relay_channel: 3 } })] })).toEqual([]);
    });

    it("rejects a reserved or out-of-range Pi pin", () => {
      expect(
        errs({
          Actuators: [
            actuator({ name: "A", binding: { target: "GCS", gpio_channel: 8 } }),
            actuator({ name: "B", binding: { target: "GCS", gpio_channel: 30 } }),
          ],
        }),
      ).toEqual([
        "Actuator #1 (A): gpio_channel BCM 8 is reserved.",
        "Actuator #2 (B): gpio_channel must be a BCM pin 0-27.",
      ]);
    });

    it("lets two actuators share an output pin", () => {
      expect(errs({ Actuators: [actuator({ name: "A" }), actuator({ name: "B" })] })).toEqual([]);
    });

    it("rejects a bad max_on_s or on_comms_loss", () => {
      expect(
        errs({ Actuators: [actuator({ actions: { max_on_s: 0, on_comms_loss: "off" as never } })] }),
      ).toEqual([
        "Actuator #1 (A1): max_on_s must be a positive number of seconds.",
        "Actuator #1 (A1): on_comms_loss must be one of hold, safe.",
      ]);
    });

    it.each([
      ["a servo", actuator({ type: "servo", binding: { target: "GCS", servo_channel: 1 }, actions: { max_on_s: 5 } })],
      ["a FAS actuator", actuator({ type: "solenoid", binding: { target: "FAS", node: "EPB_0", relay_channel: 1 }, actions: { on_comms_loss: "safe" } })],
    ])("rejects limits on %s", (_label, a) => {
      expect(errs({ Actuators: [a] })[0]).toMatch(/max_on_s and on_comms_loss are only allowed on GCS\/TCS/);
    });

    it("accepts the default hold and a null max_on_s anywhere, as the backend returns them", () => {
      expect(
        errs({
          Actuators: [actuator({ type: "servo", binding: { target: "FAS", node: "EPB_0", servo_channel: 1 }, actions: { max_on_s: null, on_comms_loss: "hold" } })],
        }),
      ).toEqual([]);
    });
  });

  describe("sensors", () => {
    it("accepts a DI sensor on a Pi pin", () => {
      expect(errs({ Sensors: [di()] })).toEqual([]);
    });

    it("rejects a DI on the FAS, without a pin, or on a reserved pin", () => {
      expect(
        errs({
          Sensors: [
            di({ name: "A", binding: { source: "FAS", node: "EPB_0", channel: 1 } }),
            di({ name: "B", binding: { source: "GCS" } as never }),
            di({ name: "C", binding: { source: "GCS", gpio_channel: 21 } }),
          ],
        }),
      ).toEqual([
        "Sensor #1 (A): DI binding.source must be GCS or TCS.",
        "Sensor #2 (B): DI binding requires numeric gpio_channel.",
        "Sensor #3 (C): gpio_channel BCM 21 is reserved.",
      ]);
    });

    it("rejects gpio_channel on a non-DI sensor", () => {
      expect(errs({ Sensors: [di({ type: "PT" })] })).toEqual(["Sensor #1 (DOOR): only DI sensors take binding.gpio_channel."]);
    });

    it("rejects a pin used as both input and output on the same Pi, and two DIs on one pin", () => {
      expect(
        errs({
          Sensors: [di({ name: "IN1", binding: { source: "TCS", gpio_channel: 17 } }), di({ name: "IN2", binding: { source: "TCS", gpio_channel: 17 } })],
          Actuators: [actuator({ name: "OUT" })],
        }),
      ).toEqual([
        'TCS GPIO 17 is used by both sensor "IN1" and sensor "IN2".',
        'TCS GPIO 17 is used by both sensor "IN1" and actuator "OUT".',
      ]);
    });

    it("allows the same pin on different Pis", () => {
      expect(errs({ Sensors: [di({ binding: { source: "GCS", gpio_channel: 17 } })], Actuators: [actuator()] })).toEqual([]);
    });

    it("accepts a tc_type on a Pi thermocouple, and null anywhere", () => {
      expect(
        errs({
          Sensors: [
            { name: "TC1", type: "TC", binding: { source: "TCS", hat_id: 1, channel_id: 0 }, tc_type: "T" },
            { name: "PT1", type: "PT", binding: { source: "GCS", hat_id: 0, channel_id: 0 }, tc_type: null },
          ],
        }),
      ).toEqual([]);
    });

    it("rejects a tc_type off a Pi thermocouple, or an unknown one", () => {
      expect(
        errs({
          Sensors: [
            { name: "A", type: "TC", binding: { source: "FAS", node: "EPB_0", channel: 1 }, tc_type: "K" },
            { name: "B", type: "PT", binding: { source: "GCS", hat_id: 0, channel_id: 0 }, tc_type: "K" },
            { name: "C", type: "TC", binding: { source: "GCS", hat_id: 0, channel_id: 1 }, tc_type: "Q" as never },
          ],
        }),
      ).toEqual([
        "Sensor #1 (A): tc_type is only allowed on TC sensors bound to GCS or TCS.",
        "Sensor #2 (B): tc_type is only allowed on TC sensors bound to GCS or TCS.",
        "Sensor #3 (C): tc_type must be one of J, K, T, E, R, S, B, N.",
      ]);
    });
  });

  describe("Heartbeat", () => {
    it.each([500, 2000, 60000])("accepts timeout_ms %s", (timeout_ms) => {
      expect(errs({ Heartbeat: { timeout_ms } })).toEqual([]);
    });

    it("accepts a section without timeout_ms", () => {
      expect(errs({ Heartbeat: {} })).toEqual([]);
    });

    it.each([0, 499, 60001, 1500.5])("rejects timeout_ms %s", (timeout_ms) => {
      expect(errs({ Heartbeat: { timeout_ms } })).toEqual(["Heartbeat.timeout_ms must be a whole number from 500 to 60000."]);
    });

    it("rejects a non-mapping", () => {
      expect(errs({ Heartbeat: [] as never })).toEqual(["Heartbeat must be a mapping."]);
    });
  });
});

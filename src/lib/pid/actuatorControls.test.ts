import { describe, expect, it } from "vitest";

import type { ActuatorEntry, ActuatorState } from "../types";
import {
  activeOption,
  buttonIndexAtX,
  buttonWidth,
  computeButtons,
  controlButtonFaces,
  deriveControls,
  layoutButtons,
  nextOption,
  rawValueForKind,
  segmentFaceColours,
  totalButtonsWidth,
} from "./actuatorControls";

const entry = (type: ActuatorEntry["type"], over: Partial<ActuatorEntry> = {}): ActuatorEntry => ({
  name: "A1",
  type,
  binding: { target: "GCS" },
  ...over,
});

const state = (s: Partial<ActuatorState>) => s as ActuatorState;
const kinds = (e: ActuatorEntry) => deriveControls(e).map((s) => s.kind);

describe("deriveControls: which axes each actuator type exposes", () => {
  it.each([
    ["solenoid", entry("solenoid"), ["position"]],
    ["servo without a power relay", entry("servo", { binding: { target: "GCS", servo_channel: 1 } }), ["position", "enable"]],
    ["servo with a power relay", entry("servo", { binding: { target: "GCS", servo_channel: 1, relay_channel: 2 } }), ["position", "enable", "power"]],
    ["powered_device", entry("powered_device"), ["power"]],
    ["powered_gpio_device", entry("powered_gpio_device"), ["arming", "power"]],
    ["gpio_device", entry("gpio_device"), ["arming"]],
    ["motor", entry("motor", { binding: { target: "GCS", relay_channel: 1 } }), ["motion"]],
  ])("%s", (_n, e, expected) => {
    expect(kinds(e)).toEqual(expected);
  });

  it("falls back to arming for an unknown type that lists gpio commands, else to position", () => {
    expect(kinds(entry("mystery" as never, { actions: { gpio_commands: ["fire"] } }))).toEqual(["arming"]);
    expect(kinds(entry("mystery" as never))).toEqual(["position"]);
  });

  it("uses open/closed for a solenoid with no aliases or only two", () => {
    for (const aliases of [undefined, [], ["a", "b"]]) {
      const [seg] = deriveControls(entry("solenoid", { actions: { position_aliases: aliases } }));
      expect(seg.options.map((o) => o.command)).toEqual(["open", "closed"]);
    }
  });

  it("uses the configured aliases verbatim as commands when there are three or more", () => {
    const [seg] = deriveControls(entry("servo", { actions: { position_aliases: ["closed", "half", "open"] } }));
    expect(seg.options.map((o) => [o.label, o.command])).toEqual([
      ["CLOSED", "closed"],
      ["HALF", "half"],
      ["OPEN", "open"],
    ]);
  });

  it("sends a motor's own state labels, exactly as the backend accepts them", () => {
    const one = deriveControls(entry("motor", { actions: {} }))[0];
    expect(one.options.map((o) => o.command)).toEqual(["on", "off"]);
    const rev = deriveControls(entry("motor", { actions: { reversible: true } }))[0];
    expect(rev.options.map((o) => o.command)).toEqual(["forward", "stop", "reverse"]);
    const custom = deriveControls(entry("motor", { actions: { state_labels: ["Spin", "Halt"] } }))[0];
    expect(custom.options.map((o) => [o.label, o.command])).toEqual([["SPIN", "Spin"], ["HALT", "Halt"]]);
  });

  it("sends imperative verbs for commands but accepts reported adjectives as state", () => {
    const find = (type: ActuatorEntry["type"], kind: string) => deriveControls(entry(type, { binding: { target: "GCS", servo_channel: 1, relay_channel: 1 } })).find((s) => s.kind === kind)!;
    expect(find("servo", "enable").options.map((o) => o.command)).toEqual(["enable", "disable"]);
    expect(find("servo", "enable").options[0].match).toContain("enabled");
    expect(find("gpio_device", "arming").options.map((o) => o.command)).toEqual(["arm", "disarm"]);
    expect(find("gpio_device", "arming").options[0].match).toContain("armed");
  });
});

describe("rawValueForKind", () => {
  it("reads the field for each axis", () => {
    const s = state({ position: "open", enable: "enabled", power: "on", arming: "armed", motion: "stop" });
    expect(["position", "enable", "power", "arming", "motion"].map((k) => rawValueForKind(k as never, s))).toEqual(["open", "enabled", "on", "armed", "stop"]);
  });

  it("falls back to the generic state field for position", () => {
    expect(rawValueForKind("position", state({ state: "closed" }))).toBe("closed");
  });

  it("is undefined with no state", () => {
    expect(rawValueForKind("position", null)).toBeUndefined();
  });
});

describe("activeOption", () => {
  const [position] = deriveControls(entry("solenoid"));

  it.each([
    ["open", "OPEN"],
    ["OPEN", "OPEN"],
    ["1", "OPEN"],
    ["true", "OPEN"],
    ["closed", "CLOSED"],
    ["close", "CLOSED"],
    ["0", "CLOSED"],
  ])("reported %s -> %s", (reported, label) => {
    expect(activeOption(position, state({ position: reported }))?.label).toBe(label);
  });

  it("is null when the state is unknown, never a guess", () => {
    expect(activeOption(position, null)).toBeNull();
    expect(activeOption(position, state({}))).toBeNull();
    expect(activeOption(position, state({ position: "" }))).toBeNull();
  });

  it("shows an unrecognised reported value as itself, in neutral", () => {
    expect(activeOption(position, state({ position: "jammed" }))).toMatchObject({
      label: "JAMMED",
      command: "jammed",
      activeColor: "neutral",
    });
  });
});

describe("nextOption", () => {
  const [position] = deriveControls(entry("solenoid"));

  it("toggles a two-option axis", () => {
    expect(nextOption(position, position.options[0]).command).toBe("closed");
    expect(nextOption(position, position.options[1]).command).toBe("open");
  });

  it("starts at the first option when the current one is unknown", () => {
    expect(nextOption(position, null).command).toBe("open");
    expect(nextOption(position, { label: "X", command: "x", match: [], activeColor: "neutral" }).command).toBe("open");
  });
});

describe("computeButtons", () => {
  it("shows one button for the current state of a binary axis, which sends the opposite", () => {
    const [b] = computeButtons(entry("solenoid"), state({ position: "open" }));
    expect(b).toMatchObject({ label: "OPEN", command: "closed", active: true, color: "nominal", kind: "position" });
    const [c] = computeButtons(entry("solenoid"), state({ position: "closed" }));
    expect(c).toMatchObject({ label: "CLOSED", command: "open", color: "fault" });
  });

  it("shows the axis name in neutral, and offers the first command, when the state is unknown", () => {
    const [b] = computeButtons(entry("solenoid"), null);
    expect(b).toMatchObject({ label: "POS", command: "open", active: false, color: "neutral" });
  });

  it("labels each axis when idle", () => {
    const e = entry("servo", { binding: { target: "GCS", servo_channel: 1, relay_channel: 2 } });
    expect(computeButtons(e, null).map((b) => b.label)).toEqual(["POS", "ENABLE", "POWER"]);
    expect(computeButtons(entry("gpio_device"), null).map((b) => b.label)).toEqual(["ARM"]);
    const oneWay = entry("motor", { binding: { target: "GCS", relay_channel: 1 } });
    expect(computeButtons(oneWay, null).map((b) => b.label)).toEqual(["MOTOR"]);
    const reversible = entry("motor", { binding: { target: "GCS", relay_channel: 1, reverse_relay_channel: 2 }, actions: { reversible: true } });
    expect(computeButtons(reversible, null).map((b) => b.label)).toEqual(["FORWARD", "STOP", "REVERSE"]);
  });

  it("shows one button per option on a multi-position axis, only the active one coloured", () => {
    const e = entry("servo", { actions: { position_aliases: ["closed", "half", "open"] }, binding: { target: "GCS" } });
    const buttons = computeButtons(e, state({ position: "half", enable: "enabled" })).filter((b) => b.kind === "position");
    expect(buttons.map((b) => [b.label, b.active, b.color])).toEqual([
      ["CLOSED", false, "neutral"],
      ["HALF", true, "nominal"],
      ["OPEN", false, "neutral"],
    ]);
  });

  it("combines every axis of a multi-axis actuator in order", () => {
    const e = entry("servo", { binding: { target: "GCS", servo_channel: 1, relay_channel: 2 } });
    const buttons = computeButtons(e, state({ position: "open", enable: "disabled", power: "on" }));
    expect(buttons.map((b) => [b.kind, b.label, b.command])).toEqual([
      ["position", "OPEN", "closed"],
      ["enable", "DISABLED", "enable"],
      ["power", "ON", "off"],
    ]);
  });

  it("controlButtonFaces adds the colours for each button", () => {
    const [face] = controlButtonFaces(entry("solenoid"), state({ position: "open" }));
    expect(face).toEqual({ label: "OPEN", bgFill: "rgba(34,197,94,0.18)", textFill: "#22c55e", stroke: "rgba(34,197,94,0.55)" });
  });
});

describe("segmentFaceColours", () => {
  it.each(["nominal", "fault", "info", "warn"] as const)("%s has a tinted fill", (c) => {
    expect(segmentFaceColours(c)[0]).toMatch(/^rgba\(/);
  });

  it("neutral has no fill", () => {
    expect(segmentFaceColours("neutral")[0]).toBe("transparent");
  });
});

describe("button layout", () => {
  it("never makes a button narrower than 34 px, and widens with the label", () => {
    expect(buttonWidth("A")).toBe(34);
    expect(buttonWidth("OPEN")).toBe(58);
    expect(buttonWidth("DISARMED")).toBe(98);
  });

  it("places buttons left to right with a gap, and sums to the total width", () => {
    const boxes = layoutButtons(["OPEN", "ON"]);
    expect(boxes[0]).toEqual({ x: 4, w: 58 });
    expect(boxes[1].x).toBe(4 + 58 + 4);
    expect(totalButtonsWidth(["OPEN", "ON"])).toBe(boxes[1].x + boxes[1].w + 4);
  });

  it("reserves space for an empty row", () => {
    expect(totalButtonsWidth([])).toBe(68);
  });

  it("hit-tests a click to the button under it, clamping past the right edge", () => {
    const labels = ["OPEN", "CLOSED"];
    const boxes = layoutButtons(labels);
    expect(buttonIndexAtX(labels, boxes[0].x + 1)).toBe(0);
    expect(buttonIndexAtX(labels, boxes[1].x + 1)).toBe(1);
    expect(buttonIndexAtX(labels, 9999)).toBe(1);
    expect(buttonIndexAtX([], 5)).toBe(-1);
  });
});

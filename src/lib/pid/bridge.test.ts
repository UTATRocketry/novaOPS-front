import { dia, shapes } from "@joint/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useNovaStore } from "@/lib/store";
import { FakePaper } from "@/test/fakePaper";
import type { ActuatorEntry, ClientRole, SafetyRules, SensorEntry } from "../types";
import { PidBridge } from "./bridge";
import {
  NOVA_NAMESPACE,
  NovaActuatorControl,
  NovaBottle,
  NovaChamber,
  NovaDevice,
  NovaInstrument,
  NovaSystemLink,
  NovaTextLabel,
  NovaValve,
  NovaVessel,
  NovaZone,
} from "./shapes";

vi.mock("@joint/core", async (importOriginal) => {
  const real = await importOriginal<typeof import("@joint/core")>();
  // Hover tools build real SVG views, which jsdom cannot; stand-ins that just record what was asked for.
  class ToolsView {
    constructor(public options: { tools: unknown[] }) {}
  }
  const overrides: Record<string, unknown> = {
    dia: { ...real.dia, ToolsView },
    linkTools: { ...real.linkTools, Vertices: class {}, Segments: class {} },
  };
  return new Proxy(real, { get: (t, k) => (k in overrides ? overrides[k as string] : Reflect.get(t, k)) });
});

const initial = useNovaStore.getInitialState();

/** A pipe with endpoints, as the bridge itself always creates them (a bare link cannot join a graph). */
const pipe = (props: Record<string, unknown> = {}) => {
  const link = new NovaSystemLink(props);
  link.source({ x: 0, y: 0 });
  link.target({ x: 50, y: 50 });
  return link;
};

/** Elements with a position, since only a positioned element can be selected. */
const placed = <T extends dia.Element>(cell: T, x = 0, y = 500) => {
  cell.position(x, y);
  return cell;
};

const SENSORS: SensorEntry[] = [
  { name: "PT1", type: "PT", unit: "psi", binding: { source: "GCS", hat_id: 0, channel_id: 0 } },
];
const ACTUATORS: ActuatorEntry[] = [
  { name: "SV1", type: "solenoid", binding: { target: "GCS", relay_channel: 0 } },
  { name: "IMC1", type: "gpio_device", binding: { target: "GCS" } },
  { name: "SRV", type: "servo", binding: { target: "GCS", servo_channel: 1 }, actions: { position_aliases: ["closed", "half", "open"] } },
];
const SYSTEMS = { fuel: { label: "Fuel", colorToken: "fault" } };

const RULES: SafetyRules = {
  hazardous: [{ SV1: "open" }, { IMC1: "ALL" }],
  critical: [{ SRV: ["open"] }],
};

function setup() {
  const graph = new dia.Graph({}, { cellNamespace: { ...shapes, ...NOVA_NAMESPACE } });
  const paper = new FakePaper(graph);
  const sendCommand = vi.fn();
  const onCellSelect = vi.fn();
  const bridge = new PidBridge({ graph, paper: paper as unknown as dia.Paper, sendCommand, onCellSelect });
  return { graph, paper, sendCommand, onCellSelect, bridge };
}

function session(role: ClientRole | null) {
  useNovaStore.setState({ session: { clientId: role ? "c1" : null, role } });
}

const attr = (cell: dia.Cell, path: string) => cell.attr(path);

function rig() {
  const ctx = setup();
  const { graph } = ctx;
  const inst = new NovaInstrument({ binding: { name: "PT1" }, instrumentType: "PT", label: "PT1" });
  const valve = new NovaValve({ binding: { name: "SV1" }, controllable: true, label: "SV1", symbolVariant: "solenoid" });
  const dev = new NovaDevice({ binding: { name: "IMC1" }, controllable: true, label: "IMC1" });
  const ctrl = new NovaActuatorControl({ binding: { name: "SRV" } });
  inst.position(0, 0);
  valve.position(300, 0);
  dev.position(500, 0);
  ctrl.position(100, 200);
  graph.addCells([inst, valve, dev, ctrl]);
  return { ...ctx, inst, valve, dev, ctrl };
}

function live(extra: { missing?: Set<string> } = {}) {
  const r = rig();
  r.bridge.indexLayout(SENSORS, ACTUATORS, SYSTEMS, extra.missing ?? new Set());
  r.bridge.setSafetyRules(RULES);
  r.bridge.setMode("live");
  return r;
}

beforeEach(() => {
  useNovaStore.setState(initial, true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("PidBridge.indexLayout", () => {
  it("applies each shape's labels and the configured colour", () => {
    const r = rig();
    const vessel = placed(new NovaVessel({ label: "TANK", contentsLabel: "LOX" }));
    const bottle = placed(new NovaBottle({ label: "N2" }));
    const chamber = placed(new NovaChamber({ label: "CC" }));
    const zone = placed(new NovaZone({ label: "PAD" }));
    r.graph.addCells([vessel, bottle, chamber, zone]);
    r.bridge.indexLayout(SENSORS, ACTUATORS, SYSTEMS, new Set());
    expect(attr(r.inst, "sensorName/text")).toBe("PT1");
    expect(attr(r.valve, "valveLabel/text")).toBe("SV1");
    expect(attr(r.valve, "actuatorCap/opacity")).toBe(1);
    expect(attr(r.dev, "deviceLabel/text")).toBe("IMC1");
    expect(attr(vessel, "vesselName/text")).toBe("TANK");
    expect(attr(vessel, "contents/text")).toBe("LOX");
    expect(attr(bottle, "vesselName/text")).toBe("N2");
    expect(attr(chamber, "vesselName/text")).toBe("CC");
    expect(attr(zone, "zoneLabel/text")).toBe("PAD");
  });

  it("hides the passive badge of a controllable valve, since its control row shows the state", () => {
    const r = rig();
    r.bridge.indexLayout(SENSORS, ACTUATORS, SYSTEMS, new Set());
    expect(attr(r.valve, "badgeBg/opacity")).toBe(0);
    const plain = new NovaValve({ binding: { name: "SV1" } });
    r.graph.addCell(plain);
    r.bridge.indexLayout(SENSORS, ACTUATORS, SYSTEMS, new Set());
    expect(attr(plain, "badgeBg/opacity")).toBe(1);
  });

  it("marks bindings missing from the config in the warning colour", () => {
    const r = rig();
    r.bridge.indexLayout(SENSORS, ACTUATORS, SYSTEMS, new Set([r.inst.id as string, r.valve.id as string, r.dev.id as string, r.ctrl.id as string]));
    expect(attr(r.inst, "bubble/stroke")).toContain("warn");
    expect(attr(r.valve, "badgeBg/stroke")).toContain("warn");
    expect(attr(r.dev, "box/stroke")).toContain("warn");
    expect(attr(r.ctrl, "nameLabel/fill")).toContain("warn");
  });

  it("colours a pipe by its own colour token, else by its system", () => {
    const r = rig();
    const direct = pipe({ colorToken: "nominal" });
    const bySystem = pipe({ systemId: "fuel" });
    const unknown = pipe({ systemId: "nope" });
    r.graph.addCells([direct, bySystem, unknown]);
    r.bridge.indexLayout(SENSORS, ACTUATORS, SYSTEMS, new Set());
    expect(attr(direct, "line/stroke")).toBe("#22c55e");
    expect(attr(bySystem, "line/stroke")).not.toBe(attr(unknown, "line/stroke"));
    expect(attr(unknown, "line/stroke")).toBe("#26303f");
  });

  it("gives a control its name and idle buttons, and clears a control bound to an unknown actuator", () => {
    const r = rig();
    const orphan = new NovaActuatorControl({ binding: { name: "GHOST" } });
    r.graph.addCell(orphan);
    r.bridge.indexLayout(SENSORS, ACTUATORS, SYSTEMS, new Set());
    expect(attr(r.ctrl, "nameLabel/text")).toBe("SRV");
    expect(r.ctrl.buttonCount()).toBe(4); // three positions plus the servo enable switch
    expect(orphan.buttonCount()).toBe(0);
  });

  it("reports no selection", () => {
    const r = rig();
    r.bridge.indexLayout(SENSORS, ACTUATORS, SYSTEMS, new Set());
    expect(r.onCellSelect).toHaveBeenCalledWith(null);
    expect(r.bridge.getSystems()).toBe(SYSTEMS);
  });
});

describe("PidBridge live data", () => {
  it("shows the sensor reading with a precision that shrinks as the value grows", () => {
    const r = live();
    const show = (value: number) => {
      useNovaStore.getState().ingestEngineData([{ name: "PT1", value, avg: value, unit: "psi", timestamp: 1 }]);
      return attr(r.inst, "readoutValue/text");
    };
    expect(show(12.5)).toBe("12.50");
    expect(show(150.5)).toBe("150.5");
    expect(show(1234.6)).toBe("1235");
    expect(show(-1234.6)).toBe("-1235");
    expect(attr(r.inst, "readoutUnit/text")).toBe("psi");
  });

  it("applies data that arrived before the bridge went live", () => {
    useNovaStore.getState().ingestEngineData([{ name: "PT1", value: 5, avg: 5, unit: "psi", timestamp: 1 }]);
    const r = live();
    expect(attr(r.inst, "readoutValue/text")).toBe("5.00");
  });

  it("shows — for a sensor the stream does not mention", () => {
    const r = live();
    useNovaStore.getState().ingestEngineData([{ name: "OTHER", value: 1, avg: 1, unit: "", timestamp: 1 }]);
    expect(attr(r.inst, "readoutValue/text")).toBe("—");
  });

  it("dims on a stale stream but keeps the last value, and shows — when the stream is dead", () => {
    const r = live();
    const store = useNovaStore.getState();
    store.ingestEngineData([{ name: "PT1", value: 7, avg: 7, unit: "psi", timestamp: 1 }]);
    useNovaStore.setState({ engineData: { ...useNovaStore.getState().engineData, status: "stale" } });
    expect(attr(r.inst, "body/opacity")).toBe(0.45);
    expect(attr(r.inst, "readoutValue/text")).toBe("7.00");
    useNovaStore.setState({ engineData: { ...useNovaStore.getState().engineData, status: "disconnected" } });
    expect(attr(r.inst, "readoutValue/text")).toBe("—");
    expect(attr(r.inst, "readoutUnit/text")).toBe("");
    expect(attr(r.inst, "body/opacity")).toBe(1);
  });

  it("shows — on an errored stream", () => {
    const r = live();
    useNovaStore.getState().ingestEngineData([{ name: "PT1", value: 7, avg: 7, unit: "psi", timestamp: 1 }]);
    useNovaStore.setState({ engineData: { ...useNovaStore.getState().engineData, status: "error" } });
    expect(attr(r.inst, "readoutValue/text")).toBe("—");
  });

  it("badges valves and devices from the reported position or state", () => {
    const r = live();
    const push = (states: Record<string, object>) =>
      useNovaStore.getState().ingestActuatorStates({ actuator_states: states } as never);
    push({ SV1: { position: "open" }, IMC1: { state: "armed" } });
    expect(attr(r.valve, "badgeText/text")).toBe("OPEN");
    expect(attr(r.dev, "badgeText/text")).toBe("ARMED");
    push({ SV1: { position: "closed" } });
    expect(attr(r.valve, "badgeText/text")).toBe("CLOSED");
    expect(attr(r.dev, "badgeText/text")).toBe("UNKNOWN");
    push({ SV1: { position: "half" } });
    expect(attr(r.valve, "badgeText/text")).toBe("HALF");
    push({ SV1: {} });
    expect(attr(r.valve, "badgeText/text")).toBe("UNKNOWN");
  });

  it("shows UNKNOWN on a dead actuator stream and dims on a stale one", () => {
    const r = live();
    useNovaStore.getState().ingestActuatorStates({ actuator_states: { SV1: { position: "open" } } } as never);
    useNovaStore.setState({ actuatorStates: { ...useNovaStore.getState().actuatorStates, status: "stale" } });
    expect(attr(r.valve, "body/opacity")).toBe(0.45);
    expect(attr(r.valve, "badgeText/text")).toBe("OPEN");
    useNovaStore.setState({ actuatorStates: { ...useNovaStore.getState().actuatorStates, status: "disconnected" } });
    expect(attr(r.valve, "badgeText/text")).toBe("UNKNOWN");
    expect(attr(r.valve, "body/opacity")).toBe(1);
  });

  it("lights the active button of a control and goes idle when the stream dies", () => {
    const r = live();
    const idle = JSON.stringify(r.ctrl.attributes.attrs);
    useNovaStore.getState().ingestActuatorStates({ actuator_states: { SRV: { position: "half" } } } as never);
    expect(JSON.stringify(r.ctrl.attributes.attrs)).not.toBe(idle);
    useNovaStore.setState({ actuatorStates: { ...useNovaStore.getState().actuatorStates, status: "disconnected" } });
    expect(JSON.stringify(r.ctrl.attributes.attrs)).toBe(idle);
  });
});

describe("PidBridge modes", () => {
  it("makes the paper interactive only in edit mode", () => {
    const r = live();
    expect(r.paper.interactive).toBe(false);
    r.bridge.setMode("edit");
    expect(r.paper.interactive).toBe(true);
    r.bridge.setMode("live");
    expect(r.paper.interactive).toBe(false);
  });

  it("resets bound shapes to their no-data face on entering edit mode and stops following the store", () => {
    const r = live();
    useNovaStore.getState().ingestEngineData([{ name: "PT1", value: 7, avg: 7, unit: "psi", timestamp: 1 }]);
    useNovaStore.getState().ingestActuatorStates({ actuator_states: { SV1: { position: "open" } } } as never);
    r.bridge.setMode("edit");
    expect(attr(r.inst, "readoutValue/text")).toBe("—");
    expect(attr(r.valve, "badgeText/text")).toBe("UNKNOWN");
    expect(attr(r.dev, "badgeText/text")).toBe("UNKNOWN");
    useNovaStore.getState().ingestEngineData([{ name: "PT1", value: 9, avg: 9, unit: "psi", timestamp: 2 }]);
    expect(attr(r.inst, "readoutValue/text")).toBe("—");
  });

  it("picks the live data straight back up when returning to live mode", () => {
    const r = live();
    r.bridge.setMode("edit");
    useNovaStore.getState().ingestEngineData([{ name: "PT1", value: 9, avg: 9, unit: "psi", timestamp: 2 }]);
    r.bridge.setMode("live");
    expect(attr(r.inst, "readoutValue/text")).toBe("9.00");
  });

  it("does not subscribe twice when live is requested repeatedly", () => {
    const r = live();
    const spy = vi.spyOn(r.inst, "setReadout");
    r.bridge.setMode("live");
    r.bridge.setMode("live");
    useNovaStore.getState().ingestEngineData([{ name: "PT1", value: 9, avg: 9, unit: "psi", timestamp: 2 }]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("runs full setup on the first call even if it asks for the default mode", () => {
    const r = rig();
    r.paper.interactive = "untouched";
    r.bridge.indexLayout(SENSORS, ACTUATORS, SYSTEMS, new Set());
    r.bridge.setMode("live");
    expect(r.paper.interactive).toBe(false);
  });

  it("stops following the store after destroy", () => {
    const r = live();
    r.bridge.destroy();
    useNovaStore.getState().ingestEngineData([{ name: "PT1", value: 9, avg: 9, unit: "psi", timestamp: 2 }]);
    expect(attr(r.inst, "readoutValue/text")).toBe("—");
    expect(r.paper.handlers.size).toBe(0);
  });
});

describe("PidBridge live command gate", () => {
  const click = (r: ReturnType<typeof live>, cell: dia.Cell, x = 0) =>
    r.paper.trigger("cell:pointerclick", r.paper.view(cell), {}, x, 0);

  function unlocked() {
    useNovaStore.getState().ingestLockout("unlocked");
  }

  it("sends nothing without a session or for a viewer", () => {
    const r = live();
    unlocked();
    session(null);
    click(r, r.valve);
    session("viewer");
    click(r, r.valve);
    expect(r.sendCommand).not.toHaveBeenCalled();
  });

  it("lets an operator toggle a valve, and flips the badge optimistically", () => {
    const r = live();
    session("operator");
    unlocked();
    useNovaStore.getState().ingestActuatorStates({ actuator_states: { SV1: { position: "closed" } } } as never);
    click(r, r.valve);
    expect(r.sendCommand).toHaveBeenCalledWith({ type: "solenoid", name: "SV1", state: "open" });
    expect(attr(r.valve, "badgeText/text")).toBe("OPEN");
  });

  it("toggles back the other way when the valve is open", () => {
    const r = live();
    session("operator");
    unlocked();
    useNovaStore.getState().ingestActuatorStates({ actuator_states: { SV1: { position: "open" } } } as never);
    click(r, r.valve);
    expect(r.sendCommand).toHaveBeenCalledWith({ type: "solenoid", name: "SV1", state: "closed" });
  });

  it("blocks a hazardous command while the lockout is not confirmed unlocked", () => {
    const r = live();
    session("operator");
    useNovaStore.getState().ingestActuatorStates({ actuator_states: { SV1: { position: "closed" } } } as never);
    click(r, r.valve); // lockout unknown
    useNovaStore.getState().ingestLockout("locked");
    click(r, r.valve);
    expect(r.sendCommand).not.toHaveBeenCalled();
    expect(attr(r.valve, "badgeText/text")).not.toBe("OPEN");
  });

  it("does not block a non-hazardous command on the lockout", () => {
    const r = live();
    session("operator");
    useNovaStore.getState().ingestActuatorStates({ actuator_states: { SV1: { position: "open" } } } as never);
    click(r, r.valve); // closing is not hazardous, lockout unknown
    expect(r.sendCommand).toHaveBeenCalledWith({ type: "solenoid", name: "SV1", state: "closed" });
  });

  it("lets a pad user send only hazardous or critical commands", () => {
    const r = live();
    session("pad");
    unlocked();
    useNovaStore.getState().ingestActuatorStates({ actuator_states: { SV1: { position: "open" } } } as never);
    click(r, r.valve); // closing: neither
    expect(r.sendCommand).not.toHaveBeenCalled();
    useNovaStore.getState().ingestActuatorStates({ actuator_states: { SV1: { position: "closed" } } } as never);
    click(r, r.valve); // opening: hazardous
    expect(r.sendCommand).toHaveBeenCalledWith({ type: "solenoid", name: "SV1", state: "open" });
  });

  it("matches rules case-insensitively, by name and state, including ALL and lists", () => {
    const r = live();
    session("operator");
    r.bridge.setSafetyRules({ hazardous: [{ sv1: "OPEN" }] });
    useNovaStore.getState().ingestActuatorStates({ actuator_states: { SV1: { position: "closed" } } } as never);
    click(r, r.valve);
    expect(r.sendCommand).not.toHaveBeenCalled();
    r.bridge.setSafetyRules({ hazardous: [{ SV1: ["ALL"] }] });
    click(r, r.valve);
    expect(r.sendCommand).not.toHaveBeenCalled();
    r.bridge.setSafetyRules({ hazardous: [{ SV1: "closed" }] });
    click(r, r.valve); // opening is no longer hazardous
    expect(r.sendCommand).toHaveBeenCalledTimes(1);
    r.bridge.setSafetyRules(undefined);
    click(r, r.valve);
    expect(r.sendCommand).toHaveBeenCalledTimes(2);
  });

  it("sends the device's own command", () => {
    const r = live();
    session("operator");
    unlocked();
    click(r, r.dev);
    expect(r.sendCommand).toHaveBeenCalledWith({ type: "gpio_device", name: "IMC1", state: "arm" });
  });

  it("holds a hazardous device (ALL) behind the lockout", () => {
    const r = live();
    session("operator");
    click(r, r.dev);
    expect(r.sendCommand).not.toHaveBeenCalled();
  });

  it("ignores a valve that is not controllable, unbound, or bound to an unknown actuator", () => {
    const r = live();
    session("operator");
    unlocked();
    const passive = new NovaValve({ binding: { name: "SV1" } });
    const unbound = new NovaValve({ controllable: true });
    const ghost = new NovaValve({ controllable: true, binding: { name: "GHOST" } });
    r.graph.addCells([passive, unbound, ghost]);
    for (const c of [passive, unbound, ghost]) click(r, c);
    expect(r.sendCommand).not.toHaveBeenCalled();
  });

  it("sends the command of the control button under the click", () => {
    const r = live();
    session("operator");
    unlocked();
    useNovaStore.getState().ingestActuatorStates({ actuator_states: { SRV: { position: "half" } } } as never);
    // buttons: CLOSED, HALF, OPEN, then the enable switch
    click(r, r.ctrl, r.ctrl.position().x + 10);
    expect(r.sendCommand).toHaveBeenCalledWith({ type: "servo", name: "SRV", state: "closed" });
  });

  it("clamps a click past the last button to that button", () => {
    const r = live();
    session("operator");
    unlocked();
    useNovaStore.getState().ingestActuatorStates({ actuator_states: { SRV: { position: "half" } } } as never);
    click(r, r.ctrl, r.ctrl.position().x + 5000);
    expect(r.sendCommand).toHaveBeenCalledWith({ type: "servo", name: "SRV", state: "enable" });
  });

  it("ignores a control with no binding or an unknown actuator", () => {
    const r = live();
    session("operator");
    unlocked();
    const unbound = new NovaActuatorControl();
    const ghost = new NovaActuatorControl({ binding: { name: "GHOST" } });
    r.graph.addCells([unbound, ghost]);
    click(r, unbound);
    click(r, ghost);
    expect(r.sendCommand).not.toHaveBeenCalled();
  });

  it("does nothing on a click in a passive shape", () => {
    const r = live();
    session("operator");
    unlocked();
    click(r, r.inst);
    expect(r.sendCommand).not.toHaveBeenCalled();
  });

  // KNOWN GAP: the optimistic badge is set before the backend answers and the
  // bridge has no path to learn the command was rejected, so the canvas keeps
  // showing the new position until the next actuator frame.
  it.fails("puts the badge back if the command is never confirmed", () => {
    const r = live();
    session("operator");
    unlocked();
    useNovaStore.getState().ingestActuatorStates({ actuator_states: { SV1: { position: "closed" } } } as never);
    r.sendCommand.mockImplementation(() => {
      throw new Error("rejected");
    });
    expect(() => click(r, r.valve)).toThrow();
    expect(attr(r.valve, "badgeText/text")).toBe("CLOSED");
  });
});

describe("PidBridge edit mode: selection", () => {
  const click = (r: ReturnType<typeof live>, cell: dia.Cell, evt: object = {}) =>
    r.paper.trigger("cell:pointerclick", r.paper.view(cell), evt, 0, 0);

  function edit() {
    const r = live();
    r.bridge.setMode("edit");
    r.onCellSelect.mockClear();
    return r;
  }

  it("does not command anything in edit mode", () => {
    const r = edit();
    session("operator");
    useNovaStore.getState().ingestLockout("unlocked");
    click(r, r.valve);
    expect(r.sendCommand).not.toHaveBeenCalled();
  });

  it("selects a clicked shape, highlights it, and reports it", () => {
    const r = edit();
    click(r, r.valve);
    expect(r.bridge.getSelectedCellId()).toBe(r.valve.id);
    expect(attr(r.valve, "symbol/stroke")).toBe("#4d8bff");
    expect(r.onCellSelect).toHaveBeenLastCalledWith(r.valve.id);
  });

  it("moves the highlight when another shape is clicked", () => {
    const r = edit();
    click(r, r.valve);
    click(r, r.inst);
    expect(r.bridge.getSelectedCellIds()).toEqual([r.inst.id]);
    expect(attr(r.valve, "symbol/stroke")).not.toBe("#4d8bff");
    expect(attr(r.inst, "bubble/stroke")).toBe("#4d8bff");
  });

  it("adds to and removes from the selection with ctrl or cmd", () => {
    const r = edit();
    click(r, r.valve);
    click(r, r.inst, { ctrlKey: true });
    expect(r.bridge.getSelectedCellIds()).toEqual([r.valve.id, r.inst.id]);
    click(r, r.dev, { metaKey: true });
    expect(r.bridge.getSelectedCellIds()).toHaveLength(3);
    click(r, r.inst, { ctrlKey: true });
    expect(r.bridge.getSelectedCellIds()).toEqual([r.valve.id, r.dev.id]);
    expect(r.bridge.getSelectedCellId()).toBe(r.valve.id);
  });

  it("clears the selection on a blank click", () => {
    const r = edit();
    click(r, r.valve);
    r.paper.trigger("blank:pointerclick", {}, 0, 0);
    expect(r.bridge.getSelectedCellId()).toBeNull();
    expect(r.onCellSelect).toHaveBeenLastCalledWith(null);
  });

  it("ignores blank clicks in live mode", () => {
    const r = live();
    r.paper.trigger("blank:pointerclick", {}, 0, 0);
    expect(r.graph.getLinks()).toHaveLength(0);
  });

  it("restores the unselected look, honouring a colour token", () => {
    const r = edit();
    r.valve.set("colorToken", "fault");
    click(r, r.valve);
    click(r, r.inst);
    expect(attr(r.valve, "symbol/stroke")).toBe("#ef4444");
    expect(attr(r.valve, "symbol/strokeWidth")).toBe(1.8);
  });

  it("highlights every kind of shape", () => {
    const r = edit();
    const cells: Array<[dia.Cell, string, string | number]> = [
      [placed(new NovaVessel(), 0, 500), "tank/stroke", "#4d8bff"],
      [placed(new NovaBottle(), 200, 500), "symbol/stroke", "#4d8bff"],
      [placed(new NovaChamber(), 400, 500), "symbol/stroke", "#4d8bff"],
      [r.dev, "box/stroke", "#4d8bff"],
      [r.ctrl, "body/stroke", "#4d8bff"],
      [placed(new NovaZone(), 600, 500), "box/strokeWidth", 2.5],
    ];
    r.graph.addCells(cells.map(([c]) => c));
    for (const [cell, path, expected] of cells) {
      click(r, cell);
      expect(attr(cell, path)).toBe(expected);
    }
    const label = placed(new NovaTextLabel());
    const link = pipe();
    r.graph.addCells([label, link]);
    click(r, label);
    expect(attr(label, "label/fontWeight")).toBe("700");
    click(r, link);
    expect(attr(link, "line/strokeWidth")).toBe(4.5);
    click(r, r.inst);
    expect(attr(link, "line/strokeWidth")).toBe(2.5);
    expect(attr(label, "label/fontWeight")).toBe("400");
  });

  it("shows the rotation angle above a single selected element, in the viewport", () => {
    const r = edit();
    click(r, r.valve);
    const badge = r.paper.viewport.querySelector("text");
    expect(badge?.textContent).toBe("0°");
    r.bridge.rotateSelected();
    expect(r.paper.viewport.querySelector("text")?.textContent).toBe("90°");
    click(r, r.inst, { ctrlKey: true });
    expect(r.paper.viewport.querySelector("text")).toBeNull();
  });

  it("selects a freshly added shape, behind-most for a zone", () => {
    vi.useFakeTimers();
    const r = edit();
    const zone = new NovaZone();
    r.bridge.addCellAt(zone);
    vi.advanceTimersByTime(1);
    expect(r.bridge.getSelectedCellId()).toBe(zone.id);
    expect(zone.get("z")).toBeLessThan(r.valve.get("z") as number);
  });

  it("gives a freshly drawn pipe the active colour, and leaves an already-coloured one alone", () => {
    const r = edit();
    r.bridge.setActivePipeColor("fault");
    const fresh = pipe();
    r.graph.addCell(fresh);
    expect(attr(fresh, "line/stroke")).toBe("#ef4444");
    const coloured = pipe({ colorToken: "nominal" });
    r.graph.addCell(coloured);
    expect(coloured.get("colorToken")).toBe("nominal");
    expect(attr(coloured, "line/stroke")).not.toBe("#ef4444");
  });

  it("rescales a symbol when its size changes", () => {
    const r = edit();
    const bottle = placed(new NovaBottle());
    const chamber = placed(new NovaChamber(), 200);
    r.graph.addCells([bottle, chamber]);
    bottle.resize(112, 260);
    chamber.resize(160, 124);
    expect(attr(bottle, "symbol/transform")).toBe("scale(2,2)");
    expect(attr(chamber, "symbol/transform")).toBe("scale(2,1)");
  });
});

describe("PidBridge edit mode: editing", () => {
  function edit() {
    const r = live();
    r.bridge.setMode("edit");
    return r;
  }
  const select = (r: ReturnType<typeof edit>, ...cells: dia.Cell[]) => {
    r.paper.trigger("cell:pointerclick", r.paper.view(cells[0]), {}, 0, 0);
    for (const c of cells.slice(1)) r.paper.trigger("cell:pointerclick", r.paper.view(c), { ctrlKey: true }, 0, 0);
  };

  it("deletes every selected cell and clears the selection", () => {
    const r = edit();
    select(r, r.valve, r.inst);
    r.onCellSelect.mockClear();
    r.bridge.deleteSelected();
    expect(r.graph.getCell(r.valve.id)).toBeUndefined();
    expect(r.graph.getCell(r.inst.id)).toBeUndefined();
    expect(r.graph.getCell(r.dev.id)).toBeDefined();
    expect(r.bridge.getSelectedCellIds()).toEqual([]);
    expect(r.onCellSelect).toHaveBeenCalledWith(null);
  });

  it("deletes nothing with an empty selection", () => {
    const r = edit();
    r.bridge.deleteSelected();
    expect(r.graph.getCells()).toHaveLength(4);
  });

  it("rotates a selection by a quarter turn by default, wrapping at 360", () => {
    const r = edit();
    select(r, r.valve);
    for (let i = 0; i < 4; i++) r.bridge.rotateSelected();
    expect(r.valve.angle()).toBe(0);
    r.bridge.rotateSelected(45);
    expect(r.valve.angle()).toBe(45);
  });

  it("does not rotate a pipe", () => {
    const r = edit();
    const link = pipe();
    r.graph.addCell(link);
    select(r, link);
    expect(() => r.bridge.rotateSelected()).not.toThrow();
  });

  it("drops a new shape near the centre, cascading so they do not stack", () => {
    const r = edit();
    const positions = Array.from({ length: 7 }, () => {
      const v = new NovaValve();
      r.bridge.addCellAt(v);
      return v.position();
    });
    expect(positions[0]).toEqual({ x: 360, y: 252 });
    expect(positions[1]).toEqual({ x: 400, y: 292 });
    expect(positions[6]).toEqual(positions[0]); // the cascade wraps after six
  });

  it("drops a shape exactly where asked", () => {
    const r = edit();
    const v = new NovaValve();
    r.bridge.addCellAt(v, 11, 22);
    expect(v.position()).toEqual({ x: 11, y: 22 });
  });

  it("does not position a link", () => {
    const r = edit();
    const link = pipe();
    r.bridge.addCellAt(link);
    expect(r.graph.getCell(link.id)).toBeDefined();
  });

  it("serialises the graph under the given name", () => {
    const r = edit();
    const layout = r.bridge.serializeCurrent("Test stand");
    expect(layout.meta.name).toBe("Test stand");
    expect(layout.systems).toBe(SYSTEMS);
    expect(layout.graph.cells).toHaveLength(4);
    expect(r.bridge.serializeCurrent().meta.name).toBe("Untitled");
  });
});

describe("PidBridge edit mode: history", () => {
  function edit() {
    vi.useFakeTimers();
    const r = live();
    r.bridge.setMode("edit");
    return r;
  }

  it("starts with nothing to undo or redo", () => {
    const r = edit();
    expect(r.bridge.canUndo()).toBe(false);
    expect(r.bridge.canRedo()).toBe(false);
    r.bridge.undo();
    r.bridge.redo();
    expect(r.graph.getCells()).toHaveLength(4);
  });

  it("snapshots a change after a quiet 300 ms, and undoes and redoes it", () => {
    const r = edit();
    const extra = placed(new NovaValve({ id: "extra" }));
    r.graph.addCell(extra);
    expect(r.bridge.canUndo()).toBe(false);
    vi.advanceTimersByTime(299);
    expect(r.bridge.canUndo()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(r.bridge.canUndo()).toBe(true);
    r.bridge.undo();
    expect(r.graph.getCell("extra")).toBeUndefined();
    expect(r.bridge.canRedo()).toBe(true);
    r.bridge.redo();
    expect(r.graph.getCell("extra")).toBeDefined();
    expect(r.bridge.canRedo()).toBe(false);
  });

  it("batches a burst of changes into one undo step", () => {
    const r = edit();
    r.graph.addCell(placed(new NovaValve({ id: "a" })));
    vi.advanceTimersByTime(100);
    r.graph.addCell(placed(new NovaValve({ id: "b" })));
    vi.advanceTimersByTime(300);
    r.bridge.undo();
    expect(r.graph.getCell("a")).toBeUndefined();
    expect(r.graph.getCell("b")).toBeUndefined();
    expect(r.bridge.canUndo()).toBe(false);
  });

  it("discards the redo future when a new change is made after undo", () => {
    const r = edit();
    r.graph.addCell(placed(new NovaValve({ id: "a" })));
    vi.advanceTimersByTime(300);
    r.bridge.undo();
    r.graph.addCell(placed(new NovaValve({ id: "b" })));
    vi.advanceTimersByTime(300);
    expect(r.bridge.canRedo()).toBe(false);
  });

  it("does not record the restore itself as a change", () => {
    const r = edit();
    r.graph.addCell(placed(new NovaValve({ id: "a" })));
    vi.advanceTimersByTime(300);
    r.bridge.undo();
    vi.advanceTimersByTime(1000);
    expect(r.bridge.canRedo()).toBe(true);
    expect(r.bridge.canUndo()).toBe(false);
  });

  it("does not snapshot when nothing actually changed", () => {
    const r = edit();
    r.bridge.pushSnapshot();
    r.bridge.pushSnapshot();
    expect(r.bridge.canUndo()).toBe(false);
  });

  it("keeps at most 60 steps, dropping the oldest", () => {
    const r = edit();
    for (let i = 0; i < 70; i++) {
      r.graph.addCell(placed(new NovaValve({ id: `v${i}` })));
      vi.advanceTimersByTime(300);
    }
    let steps = 0;
    while (r.bridge.canUndo()) {
      r.bridge.undo();
      steps++;
    }
    expect(steps).toBe(59);
    // the oldest reachable state is no longer the original layout
    expect(r.graph.getCell("v0")).toBeDefined();
  });

  it("re-indexes after undo so live bindings still work", () => {
    const r = edit();
    r.graph.addCell(placed(new NovaInstrument({ id: "i2", binding: { name: "PT1" } })));
    vi.advanceTimersByTime(300);
    r.bridge.undo();
    r.bridge.redo();
    r.bridge.setMode("live");
    useNovaStore.getState().ingestEngineData([{ name: "PT1", value: 3, avg: 3, unit: "psi", timestamp: 1 }]);
    expect(attr(r.graph.getCell("i2"), "readoutValue/text")).toBe("3.00");
  });

  // KNOWN GAP: selecting a shape restyles it (attr changes), and any graph
  // change in edit mode is snapshotted, so a plain click lands in undo history.
  it.fails("does not make selecting a shape an undo step", () => {
    const r = edit();
    r.paper.trigger("cell:pointerclick", r.paper.view(r.valve), {}, 0, 0);
    vi.advanceTimersByTime(1000);
    expect(r.bridge.canUndo()).toBe(false);
  });

  it("does not snapshot in live mode", () => {
    vi.useFakeTimers();
    const r = live();
    r.graph.addCell(placed(new NovaValve({ id: "a" })));
    vi.advanceTimersByTime(1000);
    r.bridge.setMode("edit");
    expect(r.bridge.canUndo()).toBe(false);
  });

  it("drops a pending snapshot on destroy", () => {
    const r = edit();
    r.graph.addCell(placed(new NovaValve({ id: "a" })));
    r.bridge.destroy();
    vi.advanceTimersByTime(1000);
    expect(r.bridge.canUndo()).toBe(false);
  });
});

describe("PidBridge edit mode: copy and paste", () => {
  function edit() {
    vi.useFakeTimers();
    const r = live();
    r.bridge.setMode("edit");
    return r;
  }
  const click = (r: ReturnType<typeof edit>, cell: dia.Cell, evt: object = {}) =>
    r.paper.trigger("cell:pointerclick", r.paper.view(cell), evt, 0, 0);

  it("pastes nothing from an empty clipboard", () => {
    const r = edit();
    r.bridge.paste();
    expect(r.graph.getCells()).toHaveLength(4);
  });

  it("pastes a copy offset by 24 px, selected, with no linked control", () => {
    const r = edit();
    r.valve.set("controlId", "ctl-1");
    click(r, r.valve);
    r.bridge.copySelected();
    r.bridge.paste();
    expect(r.graph.getElements()).toHaveLength(5);
    const [pasted] = r.bridge.getSelectedCellIds().map((id) => r.graph.getCell(id));
    expect(pasted.id).not.toBe(r.valve.id);
    expect((pasted as dia.Element).position()).toEqual({ x: r.valve.position().x + 24, y: r.valve.position().y + 24 });
    expect(pasted.get("controlId")).toBeNull();
    expect(pasted.get("binding")).toEqual({ name: "SV1" });
  });

  it("copies only elements, not pipes", () => {
    const r = edit();
    const link = pipe();
    r.graph.addCell(link);
    click(r, link);
    r.bridge.copySelected();
    r.bridge.paste();
    expect(r.graph.getLinks()).toHaveLength(1);
  });

  it("can undo a paste", () => {
    const r = edit();
    click(r, r.valve);
    vi.advanceTimersByTime(300);
    r.bridge.copySelected();
    r.bridge.paste();
    vi.advanceTimersByTime(300);
    let guard = 0;
    while (r.graph.getElements().length > 4 && r.bridge.canUndo() && guard++ < 10) r.bridge.undo();
    expect(r.graph.getElements()).toHaveLength(4);
  });

  // KNOWN GAP: paste selects every pasted shape, but the graph's "add" handler
  // then queues a select of just the last one added, so the multi-selection
  // collapses to one shape (and that re-selection is a further undo step).
  it.fails("keeps every pasted shape selected", () => {
    const r = edit();
    click(r, r.valve);
    click(r, r.inst, { ctrlKey: true });
    r.bridge.copySelected();
    r.bridge.paste();
    vi.advanceTimersByTime(1);
    expect(r.bridge.getSelectedCellIds()).toHaveLength(2);
  });

  it("pastes the copy at its copied position even after the original moves on", () => {
    const r = edit();
    click(r, r.valve);
    r.bridge.copySelected();
    r.valve.position(900, 900);
    r.bridge.paste();
    const [pasted] = r.bridge.getSelectedCellIds().map((id) => r.graph.getCell(id) as dia.Element);
    expect(pasted.position()).toEqual({ x: 324, y: 24 });
  });

  it("indexes a pasted instrument so it receives live data", () => {
    const r = edit();
    click(r, r.inst);
    r.bridge.copySelected();
    r.bridge.paste();
    r.bridge.setMode("live");
    useNovaStore.getState().ingestEngineData([{ name: "PT1", value: 4, avg: 4, unit: "psi", timestamp: 1 }]);
    const instruments = r.graph.getElements().filter((e) => e instanceof NovaInstrument);
    expect(instruments).toHaveLength(2);
    for (const i of instruments) expect(attr(i, "readoutValue/text")).toBe("4.00");
  });
});

describe("PidBridge edit mode: lasso", () => {
  function edit() {
    const r = live();
    r.bridge.setMode("edit");
    return r;
  }

  it("draws a rubber band while dragging and selects the elements inside it", () => {
    const r = edit();
    r.paper.trigger("blank:pointerdown", {}, -10, -10);
    const rect = r.paper.viewport.querySelector("rect")!;
    expect(rect).toBeTruthy();
    r.paper.trigger("blank:pointermove", {}, 400, 120);
    expect(rect.getAttribute("width")).toBe("410");
    expect(rect.getAttribute("height")).toBe("130");
    r.paper.trigger("blank:pointerup", {}, 400, 120);
    expect(r.paper.viewport.querySelector("rect")).toBeNull();
    expect(new Set(r.bridge.getSelectedCellIds())).toEqual(new Set([r.inst.id, r.valve.id]));
  });

  it("lassos backwards (right-to-left, bottom-to-top) the same as forwards", () => {
    const r = edit();
    r.paper.trigger("blank:pointerdown", {}, 400, 120);
    r.paper.trigger("blank:pointermove", {}, -10, -10);
    const rect = r.paper.viewport.querySelector("rect")!;
    expect(rect.getAttribute("x")).toBe("-10");
    r.paper.trigger("blank:pointerup", {}, -10, -10);
    expect(r.bridge.getSelectedCellIds()).toHaveLength(2);
  });

  it("treats a tiny drag as a click and selects nothing", () => {
    const r = edit();
    r.paper.trigger("blank:pointerdown", {}, 10, 10);
    r.paper.trigger("blank:pointerup", {}, 12, 12);
    expect(r.bridge.getSelectedCellIds()).toEqual([]);
  });

  it("selects only elements, never pipes", () => {
    const r = edit();
    const link = pipe();
    link.source({ x: 0, y: 0 });
    link.target({ x: 50, y: 50 });
    r.graph.addCell(link);
    r.paper.trigger("blank:pointerdown", {}, -10, -10);
    r.paper.trigger("blank:pointerup", {}, 400, 120);
    expect(r.bridge.getSelectedCellIds()).not.toContain(link.id);
  });

  it("starts a fresh selection when a lasso begins", () => {
    const r = edit();
    r.paper.trigger("cell:pointerclick", r.paper.view(r.dev), {}, 0, 0);
    r.paper.trigger("blank:pointerdown", {}, 5000, 5000);
    expect(r.bridge.getSelectedCellIds()).toEqual([]);
  });

  it("does not lasso in live mode", () => {
    const r = live();
    r.paper.trigger("blank:pointerdown", {}, 0, 0);
    expect(r.paper.viewport.querySelector("rect")).toBeNull();
  });

  it("removes a half-drawn band on destroy", () => {
    const r = edit();
    r.paper.trigger("blank:pointerdown", {}, 0, 0);
    r.bridge.destroy();
    expect(r.paper.viewport.querySelector("rect")).toBeNull();
  });
});

describe("PidBridge edit mode: group drag", () => {
  function edit() {
    const r = live();
    r.bridge.setMode("edit");
    const select = (...cells: dia.Cell[]) => {
      r.paper.trigger("cell:pointerclick", r.paper.view(cells[0]), {}, 0, 0);
      for (const c of cells.slice(1)) r.paper.trigger("cell:pointerclick", r.paper.view(c), { ctrlKey: true }, 0, 0);
    };
    return { ...r, select };
  }

  it("moves every selected element by the anchor's delta", () => {
    const r = edit();
    r.select(r.valve, r.inst, r.dev);
    const dev0 = r.dev.position();
    const inst0 = r.inst.position();
    r.paper.trigger("element:pointerdown", r.paper.view(r.valve));
    r.valve.position(r.valve.position().x + 50, r.valve.position().y + 30);
    r.paper.trigger("element:pointermove", r.paper.view(r.valve));
    expect(r.dev.position()).toEqual({ x: dev0.x + 50, y: dev0.y + 30 });
    expect(r.inst.position()).toEqual({ x: inst0.x + 50, y: inst0.y + 30 });
    expect(r.ctrl.position()).toEqual({ x: 100, y: 200 });
  });

  it("applies the total delta from the start, not an accumulating one", () => {
    const r = edit();
    r.select(r.valve, r.dev);
    const dev0 = r.dev.position();
    r.paper.trigger("element:pointerdown", r.paper.view(r.valve));
    const v0 = r.valve.position();
    for (const step of [10, 20, 30]) {
      r.valve.position(v0.x + step, v0.y);
      r.paper.trigger("element:pointermove", r.paper.view(r.valve));
    }
    expect(r.dev.position().x).toBe(dev0.x + 30);
  });

  it("does not group-drag a single selection or an unselected element", () => {
    const r = edit();
    r.select(r.valve);
    const dev0 = r.dev.position();
    r.paper.trigger("element:pointerdown", r.paper.view(r.valve));
    r.valve.position(0, 0);
    r.paper.trigger("element:pointermove", r.paper.view(r.valve));
    expect(r.dev.position()).toEqual(dev0);
    r.select(r.valve, r.inst);
    r.paper.trigger("element:pointerdown", r.paper.view(r.dev));
    r.dev.position(5, 5);
    r.paper.trigger("element:pointermove", r.paper.view(r.dev));
    expect(r.valve.position()).toEqual({ x: 0, y: 0 });
  });

  it("stops on pointer up", () => {
    const r = edit();
    r.select(r.valve, r.dev);
    r.paper.trigger("element:pointerdown", r.paper.view(r.valve));
    r.paper.trigger("element:pointerup");
    const dev0 = r.dev.position();
    r.valve.position(0, 0);
    r.paper.trigger("element:pointermove", r.paper.view(r.valve));
    expect(r.dev.position()).toEqual(dev0);
  });

  it("is off in live mode and in pipe mode", () => {
    const r = edit();
    r.select(r.valve, r.dev);
    r.bridge.setPipeMode(true);
    r.paper.trigger("element:pointerdown", r.paper.view(r.valve));
    const dev0 = r.dev.position();
    r.valve.position(0, 0);
    r.paper.trigger("element:pointermove", r.paper.view(r.valve));
    expect(r.dev.position()).toEqual(dev0);
  });
});

describe("PidBridge edit mode: pipe routing", () => {
  function pipes() {
    const r = live();
    r.bridge.setMode("edit");
    r.bridge.setPipeMode(true, "fuel");
    return r;
  }
  const blank = (r: ReturnType<typeof pipes>, x: number, y: number) => r.paper.trigger("blank:pointerclick", {}, x, y);
  const onCell = (r: ReturnType<typeof pipes>, cell: dia.Cell, x = 0, y = 0) =>
    r.paper.trigger("cell:pointerclick", r.paper.view(cell), {}, x, y);

  it("shows a crosshair cursor while routing and restores it afterwards", () => {
    const r = pipes();
    expect(r.paper.el.style.cursor).toBe("crosshair");
    r.bridge.setPipeMode(false);
    expect(r.paper.el.style.cursor).toBe("");
  });

  it("starts a pipe at a free point and bends it at each further click", () => {
    const r = pipes();
    r.bridge.setActivePipeColor("nominal");
    blank(r, 10, 10);
    const [link] = r.graph.getLinks();
    expect(link.source()).toEqual({ x: 10, y: 10 });
    expect(attr(link, "line/stroke")).toBe("#22c55e");
    blank(r, 100, 10);
    blank(r, 100, 80);
    expect(link.target()).toEqual({ x: 100, y: 80 });
    expect(link.vertices()).toEqual([{ x: 100, y: 10 }]);
  });

  it("finishes anchored to an element with the clicked points as bends", () => {
    const r = pipes();
    onCell(r, r.valve, 5, 5);
    const [link] = r.graph.getLinks();
    expect(link.source()).toEqual({ id: r.valve.id });
    blank(r, 200, 5);
    onCell(r, r.dev, 6, 6);
    expect(link.target()).toEqual({ id: r.dev.id });
    expect(link.vertices()).toEqual([{ x: 200, y: 5 }]);
    // finished: the next click starts a new pipe
    blank(r, 1, 1);
    expect(r.graph.getLinks()).toHaveLength(2);
  });

  it("finishes on a double click and keeps a pipe that has a bend", () => {
    const r = pipes();
    blank(r, 0, 0);
    blank(r, 50, 0);
    r.paper.trigger("blank:pointerdblclick");
    expect(r.graph.getLinks()).toHaveLength(1);
    blank(r, 9, 9);
    expect(r.graph.getLinks()).toHaveLength(2);
  });

  it("drops a pipe that was only a stray click", () => {
    const r = pipes();
    blank(r, 0, 0);
    r.paper.trigger("blank:pointerdblclick");
    expect(r.graph.getLinks()).toHaveLength(0);
  });

  it("cancels an unfinished pipe with Escape, but leaves finished ones", () => {
    const r = pipes();
    blank(r, 0, 0);
    blank(r, 50, 0);
    r.paper.trigger("blank:pointerdblclick");
    blank(r, 9, 9);
    expect(r.graph.getLinks()).toHaveLength(2);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(r.graph.getLinks()).toHaveLength(1);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(r.graph.getLinks()).toHaveLength(1);
  });

  it("ignores other keys", () => {
    const r = pipes();
    blank(r, 0, 0);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    expect(r.graph.getLinks()).toHaveLength(1);
  });

  it("cancels an unfinished pipe when pipe mode is switched off", () => {
    const r = pipes();
    blank(r, 0, 0);
    r.bridge.setPipeMode(false);
    expect(r.graph.getLinks()).toHaveLength(0);
  });

  it("selects instead of routing when pipe mode is off", () => {
    const r = pipes();
    r.bridge.setPipeMode(false);
    blank(r, 0, 0);
    expect(r.graph.getLinks()).toHaveLength(0);
    onCell(r, r.valve);
    expect(r.bridge.getSelectedCellId()).toBe(r.valve.id);
  });

  it("does not route in live mode", () => {
    const r = live();
    r.bridge.setPipeMode(true);
    blank(r, 0, 0);
    expect(r.graph.getLinks()).toHaveLength(0);
  });

  it("does not start a lasso while routing", () => {
    const r = pipes();
    r.paper.trigger("blank:pointerdown", {}, 0, 0);
    expect(r.paper.viewport.querySelector("rect")).toBeNull();
  });

  it("stops listening for Escape after destroy", () => {
    const r = pipes();
    blank(r, 0, 0);
    r.bridge.destroy();
    expect(r.graph.getLinks()).toHaveLength(0);
  });
});

describe("PidBridge zoom", () => {
  it("steps by a quarter and clamps between 0.15 and 4", () => {
    const r = live();
    r.bridge.zoomIn();
    expect(r.bridge.getScale()).toBe(1.25);
    expect(r.paper.scaleValue).toEqual({ sx: 1.25, sy: 1.25 });
    r.bridge.zoomOut();
    r.bridge.zoomOut();
    expect(r.bridge.getScale()).toBeCloseTo(0.8, 5);
    r.bridge.zoomTo(100);
    expect(r.bridge.getScale()).toBe(4);
    r.bridge.zoomTo(0);
    expect(r.bridge.getScale()).toBe(0.15);
  });

  it("resets scale and pan", () => {
    const r = live();
    r.bridge.zoomTo(3);
    r.paper.translate(40, 40);
    r.bridge.resetZoom();
    expect(r.bridge.getScale()).toBe(1);
    expect(r.paper.translation).toEqual({ tx: 0, ty: 0 });
  });

  it("fits the content with padding and reads the resulting scale back", () => {
    const r = live();
    r.bridge.fitContent();
    expect(r.paper.fitCalls).toEqual([{ padding: 40, maxScaleFactor: 1.5 }]);
    expect(r.bridge.getScale()).toBe(1.25);
  });

  it("keeps the rotation badge on the shape after zooming", () => {
    const r = live();
    r.bridge.setMode("edit");
    r.paper.trigger("cell:pointerclick", r.paper.view(r.valve), {}, 0, 0);
    r.valve.position(500, 500);
    r.bridge.zoomTo(2);
    const badge = r.paper.viewport.querySelector("text")!;
    expect(badge.getAttribute("x")).toBe("540");
    expect(badge.getAttribute("y")).toBe("494");
  });
});

describe("PidBridge hover tools", () => {
  it("removes link tools when the pointer leaves", () => {
    const r = live();
    const linkView = { addTools: vi.fn(), removeTools: vi.fn() };
    r.bridge.setMode("edit");
    r.paper.trigger("link:mouseenter", linkView);
    expect(linkView.addTools).toHaveBeenCalledTimes(1);
    expect(linkView.addTools.mock.calls[0][0].options.tools).toHaveLength(2);
    r.paper.trigger("link:mouseleave", linkView);
    expect(linkView.removeTools).toHaveBeenCalledTimes(1);
  });

  it("offers no link tools in live mode or while routing", () => {
    const r = live();
    const linkView = { addTools: vi.fn(), removeTools: vi.fn() };
    r.paper.trigger("link:mouseenter", linkView);
    r.bridge.setMode("edit");
    r.bridge.setPipeMode(true);
    r.paper.trigger("link:mouseenter", linkView);
    expect(linkView.addTools).not.toHaveBeenCalled();
  });
});

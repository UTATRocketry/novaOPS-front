import { dia, shapes } from "@joint/core";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

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
} from "@/lib/pid";
import { PID_COLORS } from "@/lib/pid/registry";
import type { ActuatorEntry, SensorEntry } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { PidPropertiesPanel } from "./PidPropertiesPanel";

const SENSORS: SensorEntry[] = [
  { name: "PT1", type: "PT", unit: "psi", range: [0, 500], binding: { source: "GCS", hat_id: 0, channel_id: 0 } },
  { name: "TC1", type: "TC", unit: "C", binding: { source: "GCS", hat_id: 0, channel_id: 1 } },
];
const ACTUATORS: ActuatorEntry[] = [
  { name: "SV1", type: "solenoid", binding: { target: "GCS", relay_channel: 0 } },
  { name: "IMC1", type: "gpio_device", binding: { target: "GCS" } },
];
const SYSTEMS = { fuel: { label: "Fuel", colorToken: "fault" }, ox: { label: "Oxidiser", colorToken: "info" } };

function newGraph() {
  return new dia.Graph({}, { cellNamespace: { ...shapes, ...NOVA_NAMESPACE } });
}

function mount<T extends dia.Cell>(cell: T, graph = newGraph(), over: Partial<Parameters<typeof PidPropertiesPanel>[0]> = {}) {
  if (!graph.getCell(cell.id)) graph.addCell(cell);
  const view = renderWithProviders(
    <PidPropertiesPanel cellId={cell.id as string} graph={graph} sensors={SENSORS} actuators={ACTUATORS} systems={SYSTEMS} {...over} />,
  );
  return { graph, cell, ...view };
}

const at = <T extends dia.Element>(c: T, x = 100, y = 100) => {
  c.position(x, y);
  return c;
};

/** The input or select in the row with this label. */
const field = (label: string) => screen.getByText(label).parentElement!.querySelector("input,select") as HTMLInputElement & HTMLSelectElement;
const select = (name: string, value: string) => fireEvent.change(screen.getByLabelText(name), { target: { value } });
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });
const swatch = (label: string) => fireEvent.click(screen.getByRole("button", { name: label }));

describe("PidPropertiesPanel: nothing to edit", () => {
  it("asks for a selection", () => {
    renderWithProviders(<PidPropertiesPanel cellId={null} graph={newGraph()} sensors={[]} actuators={[]} systems={{}} />);
    expect(screen.getByText("Select a shape to edit its properties.")).toBeInTheDocument();
  });

  it("asks for a selection when there is no graph yet or the cell is gone", () => {
    const { rerender } = renderWithProviders(<PidPropertiesPanel cellId="x" graph={null} sensors={[]} actuators={[]} systems={{}} />);
    expect(screen.getByText("Select a shape to edit its properties.")).toBeInTheDocument();
    rerender(<PidPropertiesPanel cellId="gone" graph={newGraph()} sensors={[]} actuators={[]} systems={{}} />);
    expect(screen.getByText("Select a shape to edit its properties.")).toBeInTheDocument();
  });

  it("shows the type of a shape it has no editor for", () => {
    const odd = at(new shapes.standard.Rectangle({ id: "odd" }));
    mount(odd);
    expect(screen.getByText("standard.Rectangle")).toBeInTheDocument();
  });

  it("switches to the newly selected shape", () => {
    const graph = newGraph();
    const a = at(new NovaInstrument({ id: "a", binding: { name: "PT1" }, label: "first" }));
    const b = at(new NovaInstrument({ id: "b", binding: { name: "TC1" }, label: "second" }), 300);
    graph.addCells([a, b]);
    const { rerender } = renderWithProviders(<PidPropertiesPanel cellId="a" graph={graph} sensors={SENSORS} actuators={ACTUATORS} systems={SYSTEMS} />);
    expect(field("Label").value).toBe("first");
    rerender(<PidPropertiesPanel cellId="b" graph={graph} sensors={SENSORS} actuators={ACTUATORS} systems={SYSTEMS} />);
    expect(field("Label").value).toBe("second");
    expect(field("Sensor").value).toBe("TC1");
  });
});

describe("PidPropertiesPanel: instrument", () => {
  const make = (props: Record<string, unknown> = {}) =>
    at(new NovaInstrument({ id: "i", binding: { name: "PT1" }, instrumentType: "TC", label: "mine", hint: { unit: "kg", range: [5, 9] }, ...props }));

  it("shows the instrument's current settings", () => {
    mount(make());
    expect(screen.getByText("Instrument")).toBeInTheDocument();
    expect(field("Sensor").value).toBe("PT1");
    expect(field("Type code").value).toBe("TC");
    expect(field("Label").value).toBe("mine");
    expect(field("Unit").value).toBe("kg");
    expect(field("Range min").value).toBe("5");
    expect(field("Range max").value).toBe("9");
  });

  it("offers only the sensors in the config", () => {
    mount(make());
    expect([...field("Sensor").options].map((o) => o.value)).toEqual(["", "PT1", "TC1"]);
  });

  it("warns when the bound sensor is not in the config", () => {
    mount(make({ binding: { name: "GONE" } }));
    expect(screen.getByText("Not in config")).toBeInTheDocument();
  });

  it("does not warn when there is no binding or a valid one", () => {
    mount(make({ binding: { name: "" } }));
    expect(screen.queryByText("Not in config")).not.toBeInTheDocument();
  });

  it("binds to a sensor: names the shape after it and takes the unit and range from the config", () => {
    const { cell } = mount(make());
    select("Sensor binding", "TC1");
    expect(cell.get("binding")).toEqual({ name: "TC1" });
    expect(cell.get("label")).toBe("TC1");
    expect(field("Label").value).toBe("TC1");
    expect(cell.attr("sensorName/text")).toBe("TC1");
    expect(cell.get("hint")).toEqual({ unit: "C", range: [0, 100] });
    expect(field("Unit").value).toBe("C");
    select("Sensor binding", "PT1");
    expect(cell.get("hint")).toEqual({ unit: "psi", range: [0, 500] });
    expect(field("Range max").value).toBe("500");
    expect(cell.attr("bubble/stroke")).not.toContain("warn");
  });

  it("leaves an instrument unbound without a warning outline when set to none", () => {
    const { cell } = mount(make());
    select("Sensor binding", "");
    expect(cell.get("binding")).toEqual({ name: "" });
    expect(cell.attr("bubble/stroke")).not.toContain("warn");
  });

  it("changes the type code and the label on the shape", () => {
    const { cell } = mount(make());
    select("Instrument type code", "LC");
    expect(cell.get("instrumentType")).toBe("LC");
    expect(cell.attr("typeCode/text")).toBe("LC");
    type(field("Label"), "PGSO");
    expect(cell.get("label")).toBe("PGSO");
    expect(cell.attr("sensorName/text")).toBe("PGSO");
  });

  it("edits the hint's unit and range together", () => {
    const { cell } = mount(make());
    type(field("Unit"), "bar");
    expect(cell.get("hint")).toEqual({ unit: "bar", range: [5, 9] });
    type(field("Range min"), "-10");
    expect(cell.get("hint")).toEqual({ unit: "bar", range: [-10, 9] });
    type(field("Range max"), "20");
    expect(cell.get("hint")).toEqual({ unit: "bar", range: [-10, 20] });
  });

  it("tints the shape and can go back to the default", () => {
    const { cell } = mount(make());
    const first = PID_COLORS[0];
    swatch(first.label);
    expect(cell.get("colorToken")).toBe(first.token);
    expect(cell.attr("bubble/stroke")).toBe(first.hex);
    swatch("Default");
    expect(cell.get("colorToken")).toBe("");
    expect(cell.attr("bubble/stroke")).toContain("border");
  });
});

describe("PidPropertiesPanel: valve", () => {
  const make = (props: Record<string, unknown> = {}) => at(new NovaValve({ id: "v", binding: { name: "SV1" }, label: "mine", ...props }));

  it("shows the valve's current settings", () => {
    mount(make({ symbolVariant: "ball3" }));
    expect(screen.getByText("Valve")).toBeInTheDocument();
    expect(field("Actuator").value).toBe("SV1");
    expect(field("Label").value).toBe("mine");
    expect(field("Symbol").value).toBe("ball3");
    expect(screen.getByText("No")).toBeInTheDocument();
  });

  it("warns when the bound actuator is not in the config", () => {
    mount(make({ binding: { name: "GONE" } }));
    expect(screen.getByText("Not in config")).toBeInTheDocument();
  });

  it("binds to an actuator, naming the valve after it", () => {
    const { cell } = mount(make({ binding: null, label: "" }));
    select("Actuator binding", "SV1");
    expect(cell.get("binding")).toEqual({ name: "SV1" });
    expect(cell.get("label")).toBe("SV1");
    expect(cell.attr("valveLabel/text")).toBe("SV1");
    expect(cell.attr("badgeBg/stroke")).not.toContain("warn");
  });

  it("unbinds to null, keeping the label", () => {
    const { cell } = mount(make());
    select("Actuator binding", "");
    expect(cell.get("binding")).toBeNull();
    expect(cell.get("label")).toBe("mine");
  });

  it("changes the symbol and shows the solenoid cap", () => {
    const { cell } = mount(make());
    select("Valve symbol variant", "solenoid");
    expect(cell.get("symbolVariant")).toBe("solenoid");
    expect(cell.attr("actuatorCap/opacity")).toBe(1);
  });

  it("edits the label", () => {
    const { cell } = mount(make());
    type(field("Label"), "SVFTV");
    expect(cell.attr("valveLabel/text")).toBe("SVFTV");
  });

  it("adds a control row under the valve when made controllable", () => {
    const { cell, graph } = mount(make({ position: undefined }));
    cell.position(200, 300);
    fireEvent.click(screen.getByText("No"));
    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(cell.get("controllable")).toBe(true);
    const ctrl = graph.getCell(cell.get("controlId")) as NovaActuatorControl;
    expect(ctrl).toBeInstanceOf(NovaActuatorControl);
    expect(ctrl.bindingName()).toBe("SV1");
    expect(ctrl.get("showName")).toBe(false);
    expect(ctrl.position()).toEqual({ x: 184, y: 300 + 96 + 2 });
    expect(ctrl.buttonCount()).toBe(1);
    expect(cell.attr("badgeBg/opacity")).toBe(0);
  });

  it("creates an empty control for an unbound valve", () => {
    const { cell, graph } = mount(make({ binding: null }));
    fireEvent.click(screen.getByText("No"));
    const ctrl = graph.getCell(cell.get("controlId")) as NovaActuatorControl;
    expect(ctrl.bindingName()).toBeNull();
    expect(ctrl.buttonCount()).toBe(0);
  });

  it("removes the control row when made uncontrollable again", () => {
    const { cell, graph } = mount(make());
    fireEvent.click(screen.getByText("No"));
    const id = cell.get("controlId");
    fireEvent.click(screen.getByText("Yes"));
    expect(graph.getCell(id)).toBeUndefined();
    expect(cell.get("controlId")).toBeNull();
    expect(cell.get("controllable")).toBe(false);
    expect(cell.attr("badgeBg/opacity")).toBe(1);
  });

  it("reuses a control row that is already linked", () => {
    const graph = newGraph();
    const existing = at(new NovaActuatorControl({ id: "ctl" }), 0, 300);
    graph.addCell(existing);
    const { cell } = mount(make({ controlId: "ctl" }), graph);
    fireEvent.click(screen.getByText("No"));
    expect(graph.getElements().filter((e) => e instanceof NovaActuatorControl)).toHaveLength(1);
    expect(cell.get("controlId")).toBe("ctl");
  });

  it("makes a new control row if the old one was deleted elsewhere", () => {
    const { cell, graph } = mount(make({ controlId: "ghost" }));
    fireEvent.click(screen.getByText("No"));
    const id = cell.get("controlId");
    expect(id).not.toBe("ghost");
    expect(graph.getCell(id)).toBeDefined();
  });

  it("keeps the linked control row in step with the valve's actuator", () => {
    const { cell, graph } = mount(make());
    fireEvent.click(screen.getByText("No"));
    const ctrl = graph.getCell(cell.get("controlId")) as NovaActuatorControl;
    select("Actuator binding", "IMC1");
    expect(ctrl.bindingName()).toBe("IMC1");
    expect(ctrl.buttonCount()).toBe(1);
    select("Actuator binding", "");
    expect(ctrl.bindingName()).toBeNull();
    expect(ctrl.buttonCount()).toBe(0);
  });
});

describe("PidPropertiesPanel: vessel, bottle and chamber", () => {
  it.each([
    ["Vessel", () => new NovaVessel({ id: "s", label: "TANK", contentsLabel: "LOX" })],
    ["Bottle", () => new NovaBottle({ id: "s", label: "TANK", contentsLabel: "LOX" })],
    ["Chamber", () => new NovaChamber({ id: "s", label: "TANK", contentsLabel: "LOX" })],
  ])("%s: shows, edits and resizes", (title, make) => {
    const cell = at(make());
    cell.resize(120, 200);
    mount(cell);
    expect(screen.getByText(title)).toBeInTheDocument();
    expect(field("Name").value).toBe("TANK");
    expect(field("Contents").value).toBe("LOX");
    expect(field("Width").value).toBe("120");
    expect(field("Height").value).toBe("200");
    type(field("Name"), "FUEL");
    expect(cell.get("label")).toBe("FUEL");
    expect(cell.attr("vesselName/text")).toBe("FUEL");
    type(field("Contents"), "IPA");
    expect(cell.attr("contents/text")).toBe("IPA");
    type(field("Width"), "150");
    expect(cell.size()).toEqual({ width: 150, height: 200 });
    type(field("Height"), "10");
    expect(cell.size()).toEqual({ width: 150, height: 30 });
    type(field("Width"), "");
    expect(cell.size().width).toBe(30);
  });

  it("tints the shape", () => {
    const cell = at(new NovaVessel({ id: "s" }));
    mount(cell);
    swatch(PID_COLORS[1].label);
    expect(cell.attr("tank/stroke")).toBe(PID_COLORS[1].hex);
  });
});

describe("PidPropertiesPanel: device", () => {
  const make = (props: Record<string, unknown> = {}) => at(new NovaDevice({ id: "d", binding: { name: "IMC1" }, label: "mine", ...props }));

  it("shows the device and warns about a missing actuator", () => {
    mount(make({ binding: { name: "GONE" } }));
    expect(screen.getByText("Device")).toBeInTheDocument();
    expect(screen.getByText("Not in config")).toBeInTheDocument();
  });

  it("binds, naming the device after the actuator", () => {
    const { cell } = mount(make({ binding: null, label: "" }));
    select("Actuator binding", "IMC1");
    expect(cell.get("binding")).toEqual({ name: "IMC1" });
    expect(cell.get("label")).toBe("IMC1");
    expect(cell.attr("deviceLabel/text")).toBe("IMC1");
    expect(cell.attr("box/stroke")).not.toContain("warn");
  });

  it("unbinds to null", () => {
    const { cell } = mount(make());
    select("Actuator binding", "");
    expect(cell.get("binding")).toBeNull();
  });

  it("edits the label and toggles controllable", () => {
    const { cell } = mount(make());
    type(field("Label"), "IMC");
    expect(cell.attr("deviceLabel/text")).toBe("IMC");
    fireEvent.click(screen.getByText("No"));
    expect(cell.get("controllable")).toBe(true);
    fireEvent.click(screen.getByText("Yes"));
    expect(cell.get("controllable")).toBe(false);
  });

  it("tints the device", () => {
    const { cell } = mount(make());
    swatch(PID_COLORS[0].label);
    expect(cell.attr("box/stroke")).toBe(PID_COLORS[0].hex);
  });
});

describe("PidPropertiesPanel: zone", () => {
  it("shows, edits, resizes with minimums, and tints the stroke", () => {
    const zone = at(new NovaZone({ id: "z", label: "PAD" }));
    mount(zone);
    expect(screen.getByText("Zone")).toBeInTheDocument();
    expect(field("Label").value).toBe("PAD");
    expect(field("Width").value).toBe("200");
    expect(field("Height").value).toBe("140");
    type(field("Label"), "PRESSURANT");
    expect(zone.attr("zoneLabel/text")).toBe("PRESSURANT");
    type(field("Width"), "300");
    type(field("Height"), "90");
    expect(zone.size()).toEqual({ width: 300, height: 90 });
    type(field("Width"), "10");
    type(field("Height"), "5");
    expect(zone.size()).toEqual({ width: 60, height: 40 });
    swatch(PID_COLORS[2].label);
    expect(zone.attr("box/stroke")).toBe(PID_COLORS[2].hex);
  });
});

describe("PidPropertiesPanel: text label", () => {
  const make = () => at(new NovaTextLabel({ id: "t", attrs: { label: { text: "ENGINE", fontSize: 14 } } }));

  it("shows the current text and size", () => {
    mount(make());
    expect(screen.getByText("Label")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("e.g. ENGINE")).toHaveValue("ENGINE");
    expect(field("Size").value).toBe("14");
  });

  it("edits the text", () => {
    const { cell } = mount(make());
    type(screen.getByPlaceholderText("e.g. ENGINE"), "TANKS");
    expect(cell.attr("label/text")).toBe("TANKS");
  });

  it("resizes the box with the font so large text is not clipped", () => {
    const { cell } = mount(make());
    type(field("Size"), "20");
    expect(cell.attr("label/fontSize")).toBe(20);
    expect(cell.attr("label/y")).toBe(20);
    expect(cell.size()).toEqual({ width: 160, height: 32 });
  });

  it("limits the size to 8 to 48 and falls back to 10 for nonsense", () => {
    const { cell } = mount(make());
    type(field("Size"), "100");
    expect(cell.attr("label/fontSize")).toBe(48);
    type(field("Size"), "2");
    expect(cell.attr("label/fontSize")).toBe(8);
    type(field("Size"), "0");
    expect(cell.attr("label/fontSize")).toBe(10);
  });

  // KNOWN GAP: the number input advertises max 24, but the handler accepts up to 48.
  it.fails("agrees with its own input on the largest size", () => {
    const { cell } = mount(make());
    type(field("Size"), "40");
    expect(cell.attr("label/fontSize")).toBe(Number(field("Size").max));
  });

  it("tints the text", () => {
    const { cell } = mount(make());
    swatch(PID_COLORS[0].label);
    expect(cell.attr("label/fill")).toBe(PID_COLORS[0].hex);
  });
});

describe("PidPropertiesPanel: actuator control", () => {
  const make = (props: Record<string, unknown> = {}) => at(new NovaActuatorControl({ id: "c", ...props }));

  it("shows its binding", () => {
    mount(make({ binding: { name: "SV1" } }));
    expect(screen.getByText("Control Widget")).toBeInTheDocument();
    expect(field("Actuator").value).toBe("SV1");
  });

  it("binds: names itself and previews the buttons", () => {
    const { cell } = mount(make());
    select("Actuator binding", "SV1");
    expect(cell.get("binding")).toEqual({ name: "SV1" });
    expect(cell.attr("nameLabel/text")).toBe("SV1");
    expect(cell.buttonCount()).toBe(1);
  });

  it("unbinds: drops the name and the buttons", () => {
    const { cell } = mount(make({ binding: { name: "SV1" } }));
    select("Actuator binding", "SV1");
    select("Actuator binding", "");
    expect(cell.get("binding")).toBeNull();
    expect(cell.attr("nameLabel/text")).toBe("");
    expect(cell.buttonCount()).toBe(0);
  });
});

describe("PidPropertiesPanel: pipe", () => {
  const make = (props: Record<string, unknown> = {}) => {
    const link = new NovaSystemLink({ id: "p", ...props });
    link.source({ x: 0, y: 0 });
    link.target({ x: 50, y: 50 });
    return link;
  };

  it("has no 'default' colour, since a pipe always has one", () => {
    mount(make({ colorToken: "info" }));
    expect(screen.getByText("Pipe")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Default" })).not.toBeInTheDocument();
  });

  it("recolours the pipe", () => {
    const { cell } = mount(make({ colorToken: "info" }));
    const other = PID_COLORS.find((c) => c.token !== "info")!;
    swatch(other.label);
    expect(cell.get("colorToken")).toBe(other.token);
    expect(cell.attr("line/stroke")).toBe(other.hex);
  });

  it("lists the systems by name and records the grouping without recolouring", () => {
    const { cell } = mount(make({ colorToken: "info", systemId: "" }));
    const sel = screen.getByLabelText("Pipe system") as HTMLSelectElement;
    expect([...sel.options].map((o) => o.textContent)).toEqual(["— none —", "Fuel", "Oxidiser"]);
    const before = cell.attr("line/stroke");
    select("Pipe system", "fuel");
    expect(cell.get("systemId")).toBe("fuel");
    expect(cell.attr("line/stroke")).toBe(before);
  });

  it("shows the pipe's current system", () => {
    mount(make({ systemId: "ox" }));
    expect((screen.getByLabelText("Pipe system") as HTMLSelectElement).value).toBe("ox");
  });
});

import { fireEvent, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import type { ActuatorEntry, SensorEntry } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { ActuatorsTable } from "./ActuatorsTable";
import { SensorsTable } from "./SensorsTable";

/** Hold the list in state, like the Config page does, and report every change. */
function SensorsHarness({ initial, spy }: { initial: SensorEntry[]; spy: (next: SensorEntry[]) => void }) {
  const [sensors, setSensors] = useState(initial);
  return (
    <SensorsTable
      sensors={sensors}
      onChange={(next) => {
        spy(next);
        setSensors(next);
      }}
    />
  );
}

function ActuatorsHarness({ initial, spy }: { initial: ActuatorEntry[]; spy: (next: ActuatorEntry[]) => void }) {
  const [actuators, setActuators] = useState(initial);
  return (
    <ActuatorsTable
      actuators={actuators}
      onChange={(next) => {
        spy(next);
        setActuators(next);
      }}
    />
  );
}

const last = <T,>(spy: ReturnType<typeof vi.fn>) => spy.mock.calls.at(-1)![0] as T;

const sensor = (over: Partial<SensorEntry> = {}): SensorEntry => ({
  name: "PT1",
  type: "PT",
  unit: "psi",
  binding: { source: "GCS", hat_id: 1, channel_id: 2 },
  ...over,
});

describe("SensorsTable", () => {
  function renderSensors(initial: SensorEntry[]) {
    const spy = vi.fn();
    renderWithProviders(<SensorsHarness initial={initial} spy={spy} />);
    return spy;
  }

  it("shows an empty state", () => {
    renderSensors([]);
    expect(screen.getByText("No sensors. Add one below.")).toBeInTheDocument();
  });

  it("shows each sensor's fields", () => {
    renderSensors([sensor({ range: [0, 1000], convert: { method: "linear", calibration: [[0, 0], [1, 2], [2, 4]] } })]);
    expect(screen.getByDisplayValue("PT1")).toBeInTheDocument();
    expect(screen.getByDisplayValue("psi")).toBeInTheDocument();
    expect(screen.getByDisplayValue("1")).toBeInTheDocument(); // hat
    expect(screen.getByDisplayValue("2")).toBeInTheDocument(); // channel
    expect(screen.getByDisplayValue("0")).toBeInTheDocument(); // range min
    expect(screen.getByDisplayValue("1000")).toBeInTheDocument(); // range max
    expect(screen.getByDisplayValue("linear")).toBeInTheDocument();
    expect(screen.getByText("3 pts")).toBeInTheDocument();
  });

  it("offers Calibrate when there are no calibration points", () => {
    renderSensors([sensor()]);
    expect(screen.getByText("Calibrate")).toBeInTheDocument();
  });

  it("adds a blank GCS pressure sensor with no conversion", () => {
    const spy = renderSensors([]);
    fireEvent.click(screen.getByText("Add sensor"));
    expect(last<SensorEntry[]>(spy)).toEqual([
      { name: "", type: "PT", unit: "", binding: { source: "GCS", hat_id: 0, channel_id: 0 }, convert: { method: "none" } },
    ]);
  });

  it("edits the name, type and unit", () => {
    const spy = renderSensors([sensor()]);
    fireEvent.change(screen.getByDisplayValue("PT1"), { target: { value: "PT2" } });
    fireEvent.change(screen.getByDisplayValue("PT"), { target: { value: "LC" } });
    fireEvent.change(screen.getByDisplayValue("psi"), { target: { value: "kg" } });
    expect(last<SensorEntry[]>(spy)[0]).toMatchObject({ name: "PT2", type: "LC", unit: "kg" });
  });

  it("removes only the chosen sensor", () => {
    const spy = renderSensors([sensor({ name: "A" }), sensor({ name: "B" })]);
    fireEvent.click(screen.getAllByLabelText("Remove sensor")[0]);
    expect(last<SensorEntry[]>(spy).map((s) => s.name)).toEqual(["B"]);
  });

  describe("binding", () => {
    it("edits the hat and channel for a GCS sensor", () => {
      const spy = renderSensors([sensor()]);
      fireEvent.change(screen.getByDisplayValue("1"), { target: { value: "3" } });
      fireEvent.change(screen.getByDisplayValue("2"), { target: { value: "5" } });
      expect(last<SensorEntry[]>(spy)[0].binding).toEqual({ source: "GCS", hat_id: 3, channel_id: 5 });
    });

    it("switching to FAS swaps the binding for a node and channel", () => {
      const spy = renderSensors([sensor()]);
      fireEvent.change(screen.getByDisplayValue("GCS"), { target: { value: "FAS" } });
      expect(last<SensorEntry[]>(spy)[0].binding).toEqual({ source: "FAS", node: "", channel: 0 });
      expect(screen.getByPlaceholderText("EPB_1")).toBeInTheDocument();
    });

    it("edits the node of a FAS sensor", () => {
      const spy = renderSensors([sensor({ binding: { source: "FAS", node: "EPB_0", channel: 1 } })]);
      fireEvent.change(screen.getByDisplayValue("EPB_0"), { target: { value: "EPB_1" } });
      expect(last<SensorEntry[]>(spy)[0].binding).toEqual({ source: "FAS", node: "EPB_1", channel: 1 });
    });

    it("switching between GCS and TCS keeps the hat/channel shape and resets the numbers", () => {
      const spy = renderSensors([sensor()]);
      fireEvent.change(screen.getByDisplayValue("GCS"), { target: { value: "TCS" } });
      expect(last<SensorEntry[]>(spy)[0].binding).toEqual({ source: "TCS", hat_id: 0, channel_id: 0 });
    });

    it("offers GCS, TCS and FAS", () => {
      renderSensors([sensor()]);
      const select = screen.getByDisplayValue("GCS") as HTMLSelectElement;
      expect(Array.from(select.options).map((o) => o.value)).toEqual(["GCS", "TCS", "FAS"]);
    });
  });

  describe("range (the fields #9 found missing)", () => {
    it("sets a range from either end", () => {
      const spy = renderSensors([sensor()]);
      fireEvent.change(screen.getByPlaceholderText("max"), { target: { value: "500" } });
      expect(last<SensorEntry[]>(spy)[0].range).toEqual([0, 500]);
      fireEvent.change(screen.getByPlaceholderText("min"), { target: { value: "-5" } });
      expect(last<SensorEntry[]>(spy)[0].range).toEqual([-5, 500]);
    });

    it("clears the range", () => {
      const spy = renderSensors([sensor({ range: [0, 100] })]);
      fireEvent.click(screen.getByLabelText("Clear range"));
      expect(last<SensorEntry[]>(spy)[0].range).toBeUndefined();
      expect(screen.queryByLabelText("Clear range")).not.toBeInTheDocument();
    });

    it("has no clear button until a range exists", () => {
      renderSensors([sensor()]);
      expect(screen.queryByLabelText("Clear range")).not.toBeInTheDocument();
    });
  });

  describe("conversion (zero_offset was missing)", () => {
    it("offers none, zero_offset, linear, polynomial and the robust fits", () => {
      renderSensors([sensor()]);
      const select = screen.getByDisplayValue("none") as HTMLSelectElement;
      expect(Array.from(select.options).map((o) => o.value)).toEqual([
        "none",
        "zero_offset",
        "linear",
        "polynomial",
        "theil_sen",
        "repeated_median",
      ]);
    });

    it("selects zero_offset and keeps any calibration already entered", () => {
      const spy = renderSensors([sensor({ convert: { method: "linear", calibration: [[0, 0], [1, 1]] } })]);
      fireEvent.change(screen.getByDisplayValue("linear"), { target: { value: "zero_offset" } });
      expect(last<SensorEntry[]>(spy)[0].convert).toEqual({ method: "zero_offset", calibration: [[0, 0], [1, 1]] });
    });

    it("shows a sensor with no convert block as none", () => {
      renderSensors([sensor({ convert: undefined })]);
      expect(screen.getByDisplayValue("none")).toBeInTheDocument();
    });
  });
});

describe("ActuatorsTable", () => {
  function renderActuators(initial: ActuatorEntry[]) {
    const spy = vi.fn();
    renderWithProviders(<ActuatorsHarness initial={initial} spy={spy} />);
    return spy;
  }

  const act = (over: Partial<ActuatorEntry> = {}): ActuatorEntry => ({
    name: "V1",
    type: "solenoid",
    binding: { target: "GCS", relay_channel: 0 },
    actions: {},
    ...over,
  });

  const openSettings = (type: string) => fireEvent.click(screen.getByText(`${type} settings`));
  const labelled = (text: string) => screen.getByText(text);

  it("shows an empty state", () => {
    renderActuators([]);
    expect(screen.getByText("No actuators. Add one below.")).toBeInTheDocument();
  });

  it("adds a blank GCS solenoid and opens its settings", () => {
    const spy = renderActuators([]);
    fireEvent.click(screen.getByText("Add actuator"));
    expect(last<ActuatorEntry[]>(spy)).toEqual([{ name: "", type: "solenoid", binding: { target: "GCS" }, actions: {} }]);
    expect(screen.getByText("solenoid_type")).toBeInTheDocument();
  });

  it("edits the name, type, target and node", () => {
    const spy = renderActuators([act()]);
    fireEvent.change(screen.getByDisplayValue("V1"), { target: { value: "V2" } });
    fireEvent.change(screen.getByDisplayValue("solenoid"), { target: { value: "servo" } });
    fireEvent.change(screen.getByDisplayValue("GCS"), { target: { value: "FAS" } });
    fireEvent.change(screen.getByPlaceholderText("—"), { target: { value: "EPB_0" } });
    expect(last<ActuatorEntry[]>(spy)[0]).toMatchObject({ name: "V2", type: "servo", binding: { target: "FAS", node: "EPB_0" } });
  });

  it("stores an emptied node as null", () => {
    const spy = renderActuators([act({ binding: { target: "FAS", node: "EPB_0" } })]);
    fireEvent.change(screen.getByDisplayValue("EPB_0"), { target: { value: "" } });
    expect(last<ActuatorEntry[]>(spy)[0].binding.node).toBeNull();
  });

  it("removes the chosen actuator and closes any open settings", () => {
    const spy = renderActuators([act({ name: "A" }), act({ name: "B", binding: { target: "GCS", relay_channel: 1 } })]);
    fireEvent.click(screen.getAllByText("solenoid settings")[0]);
    expect(screen.getByText("solenoid_type")).toBeInTheDocument();
    fireEvent.click(screen.getAllByLabelText("Remove actuator")[0]);
    expect(last<ActuatorEntry[]>(spy).map((a) => a.name)).toEqual(["B"]);
    expect(screen.queryByText("solenoid_type")).not.toBeInTheDocument();
  });

  it("toggles one actuator's settings open and closed", () => {
    renderActuators([act()]);
    openSettings("solenoid");
    expect(screen.getByText("relay_channel")).toBeInTheDocument();
    openSettings("solenoid");
    expect(screen.queryByText("relay_channel")).not.toBeInTheDocument();
  });

  describe("settings by type (relay_type was missing)", () => {
    it.each([
      ["servo", ["servo_channel", "relay_channel", "relay_type", "position aliases", "positions (µs)", "default_position"]],
      ["solenoid", ["solenoid_type", "relay_type", "relay_channel"]],
      ["powered_device", ["relay_type", "relay_channel"]],
      ["powered_gpio_device", ["relay_type", "relay_channel", "gpio_channel", "gpio_commands"]],
      ["gpio_device", ["gpio_channel", "gpio_commands"]],
      ["motor", ["reversible", "relay_channel", "state_labels (2)", "invert_relays"]],
    ] as const)("%s shows exactly its own fields", (type, fields) => {
      renderActuators([act({ type })]);
      openSettings(type);
      for (const f of fields) expect(labelled(f)).toBeInTheDocument();
    });

    it("does not show fields from other types", () => {
      renderActuators([act({ type: "gpio_device" })]);
      openSettings("gpio_device");
      for (const f of ["relay_channel", "relay_type", "servo_channel", "solenoid_type"]) {
        expect(screen.queryByText(f)).not.toBeInTheDocument();
      }
    });

    it("sets the relay_type, and clears it with the blank option", () => {
      const spy = renderActuators([act({ type: "powered_device" })]);
      openSettings("powered_device");
      const select = screen.getAllByRole("combobox").find((s) => Array.from((s as HTMLSelectElement).options).some((o) => o.value === "nominally_off"))!;
      fireEvent.change(select, { target: { value: "nominally_on" } });
      expect(last<ActuatorEntry[]>(spy)[0].actions?.relay_type).toBe("nominally_on");
      fireEvent.change(select, { target: { value: "" } });
      expect(last<ActuatorEntry[]>(spy)[0].actions?.relay_type).toBeNull();
    });

    it("sets the solenoid type", () => {
      const spy = renderActuators([act()]);
      openSettings("solenoid");
      const select = screen.getAllByRole("combobox").find((s) => Array.from((s as HTMLSelectElement).options).some((o) => o.value === "nominally_closed"))!;
      fireEvent.change(select, { target: { value: "nominally_open" } });
      expect(last<ActuatorEntry[]>(spy)[0].actions?.solenoid_type).toBe("nominally_open");
    });
  });

  describe("lists", () => {
    it("lets a comma be typed in position aliases without it vanishing", () => {
      const spy = renderActuators([act({ type: "servo" })]);
      openSettings("servo");
      const input = screen.getByPlaceholderText("open, closed");
      fireEvent.change(input, { target: { value: "open," } });
      expect(input).toHaveValue("open,");
      fireEvent.change(input, { target: { value: "open, closed" } });
      expect(last<ActuatorEntry[]>(spy)[0].actions?.position_aliases).toEqual(["open", "closed"]);
    });

    it("parses servo positions as numbers and drops anything that is not one", () => {
      const spy = renderActuators([act({ type: "servo" })]);
      openSettings("servo");
      fireEvent.change(screen.getByPlaceholderText("2050, 1090"), { target: { value: "2050, abc, 1090" } });
      expect(last<ActuatorEntry[]>(spy)[0].actions?.positions).toEqual([2050, 1090]);
    });

    it("removes the list entirely when it is emptied", () => {
      const spy = renderActuators([act({ type: "servo", actions: { position_aliases: ["open", "closed"] } })]);
      openSettings("servo");
      fireEvent.change(screen.getByDisplayValue("open, closed"), { target: { value: "" } });
      expect(last<ActuatorEntry[]>(spy)[0].actions?.position_aliases).toBeUndefined();
    });
  });

  describe("channel collisions", () => {
    /** The options a channel dropdown offers, by its field label. */
    function optionsFor(label: string) {
      const field = screen.getByText(label).parentElement!;
      const select = within(field).getByRole("combobox") as HTMLSelectElement;
      return Array.from(select.options).map((o) => o.value);
    }

    it("hides relay channels already used by another actuator on the same target and node", () => {
      renderActuators([act({ name: "A", binding: { target: "GCS", relay_channel: 3 } }), act({ name: "B", binding: { target: "GCS", relay_channel: 5 } })]);
      fireEvent.click(screen.getAllByText("solenoid settings")[1]);
      const options = optionsFor("relay_channel");
      expect(options).not.toContain("3");
      expect(options).toContain("5"); // its own current channel stays selectable
    });

    it("does not hide channels used on a different target", () => {
      renderActuators([act({ name: "A", binding: { target: "FAS", node: "EPB_0", relay_channel: 3 } }), act({ name: "B", binding: { target: "GCS", relay_channel: 5 } })]);
      fireEvent.click(screen.getAllByText("solenoid settings")[1]);
      expect(optionsFor("relay_channel")).toContain("3");
    });

    it("does not hide channels used on a different node of the same target", () => {
      renderActuators([
        act({ name: "A", binding: { target: "FAS", node: "EPB_0", relay_channel: 3 } }),
        act({ name: "B", binding: { target: "FAS", node: "EPB_1", relay_channel: 5 } }),
      ]);
      fireEvent.click(screen.getAllByText("solenoid settings")[1]);
      expect(optionsFor("relay_channel")).toContain("3");
    });

    it("treats both relays of a reversible motor as taken", () => {
      renderActuators([
        act({ name: "M", type: "motor", binding: { target: "GCS", relay_channel: 2, reverse_relay_channel: 4 }, actions: { reversible: true } }),
        act({ name: "V", binding: { target: "GCS", relay_channel: 9 } }),
      ]);
      fireEvent.click(screen.getByText("solenoid settings"));
      const options = optionsFor("relay_channel");
      expect(options).not.toContain("2");
      expect(options).not.toContain("4");
    });

    it("offers channels 0 to 15", () => {
      renderActuators([act()]);
      openSettings("solenoid");
      const options = optionsFor("relay_channel").filter(Boolean);
      expect(options).toHaveLength(16);
      expect(options[0]).toBe("0");
      expect(options[15]).toBe("15");
    });

    it("assigns and clears a channel", () => {
      const spy = renderActuators([act({ binding: { target: "GCS" } })]);
      openSettings("solenoid");
      const field = screen.getByText("relay_channel").parentElement!;
      const select = within(field).getByRole("combobox");
      fireEvent.change(select, { target: { value: "7" } });
      expect(last<ActuatorEntry[]>(spy)[0].binding.relay_channel).toBe(7);
      fireEvent.change(select, { target: { value: "" } });
      expect(last<ActuatorEntry[]>(spy)[0].binding.relay_channel).toBeNull();
    });
  });

  describe("motors", () => {
    const motor = (actions: ActuatorEntry["actions"] = {}) => act({ type: "motor", binding: { target: "GCS", relay_channel: 1 }, actions });

    it("asks for the reverse relay and three labels only when reversible", () => {
      renderActuators([motor({ reversible: true })]);
      openSettings("motor");
      expect(screen.getByText("reverse_relay_channel")).toBeInTheDocument();
      expect(screen.getByText("state_labels (3)")).toBeInTheDocument();
    });

    it("does not show the reverse relay for a one-way motor", () => {
      renderActuators([motor()]);
      openSettings("motor");
      expect(screen.queryByText("reverse_relay_channel")).not.toBeInTheDocument();
    });

    it("clears the state labels when reversibility changes, since their count would be rejected", () => {
      const spy = renderActuators([motor({ state_labels: ["on", "off"] })]);
      openSettings("motor");
      const toggle = within(screen.getByText("reversible").parentElement!).getByRole("button");
      expect(toggle).toHaveTextContent("OFF");
      fireEvent.click(toggle);
      expect(last<ActuatorEntry[]>(spy)[0].actions).toMatchObject({ reversible: true, state_labels: undefined });
    });

    it("turns reversible off by removing it rather than storing false", () => {
      const spy = renderActuators([motor({ reversible: true })]);
      openSettings("motor");
      fireEvent.click(within(screen.getByText("reversible").parentElement!).getByRole("button"));
      expect(last<ActuatorEntry[]>(spy)[0].actions).not.toHaveProperty("reversible", true);
      expect(last<ActuatorEntry[]>(spy)[0].actions?.reversible).toBeUndefined();
    });

    it("toggles invert_relays", () => {
      const spy = renderActuators([motor()]);
      openSettings("motor");
      fireEvent.click(within(screen.getByText("invert_relays").parentElement!).getByRole("button"));
      expect(last<ActuatorEntry[]>(spy)[0].actions?.invert_relays).toBe(true);
    });
  });
});

describe("Pi I/O fields (#42)", () => {
  function renderSensors(initial: SensorEntry[]) {
    const spy = vi.fn();
    renderWithProviders(<SensorsHarness initial={initial} spy={spy} />);
    return spy;
  }
  function renderActuators(initial: ActuatorEntry[]) {
    const spy = vi.fn();
    renderWithProviders(<ActuatorsHarness initial={initial} spy={spy} />);
    return spy;
  }
  function optionsFor(label: string) {
    const field = screen.getByText(label).parentElement!;
    const select = within(field).getByRole("combobox") as HTMLSelectElement;
    return Array.from(select.options).map((o) => o.value);
  }
  const selectWith = (value: string) =>
    screen.getAllByRole("combobox").find((s) => Array.from((s as HTMLSelectElement).options).some((o) => o.value === value))! as HTMLSelectElement;

  describe("actuator GPIO channels", () => {
    it.each(["GCS", "TCS"] as const)("offers %s BCM pins without the reserved ones", (target) => {
      renderActuators([{ name: "H", type: "gpio_device", binding: { target }, actions: {} }]);
      fireEvent.click(screen.getByText("gpio_device settings"));
      expect(optionsFor("gpio_channel").filter(Boolean)).toEqual(["4", "5", "6", "14", "15", "17", "18", "19", "22", "23", "24", "25", "27"]);
    });

    it("keeps 0-15 for the FAS", () => {
      renderActuators([{ name: "IMC", type: "gpio_device", binding: { target: "FAS", node: "IMC_0" }, actions: {} }]);
      fireEvent.click(screen.getByText("gpio_device settings"));
      const options = optionsFor("gpio_channel").filter(Boolean);
      expect(options).toHaveLength(16);
      expect(options.at(-1)).toBe("15");
    });

    it("still shows a reserved pin from an older config so it can be fixed", () => {
      renderActuators([{ name: "H", type: "gpio_device", binding: { target: "TCS", gpio_channel: 8 }, actions: {} }]);
      fireEvent.click(screen.getByText("gpio_device settings"));
      expect(optionsFor("gpio_channel")).toContain("8");
    });

    it("no longer offers OPS as a target, but shows it on an actuator that has it", () => {
      renderActuators([
        { name: "A", type: "solenoid", binding: { target: "GCS" }, actions: {} },
        { name: "B", type: "solenoid", binding: { target: "OPS" }, actions: {} },
      ]);
      const [a, b] = screen.getAllByRole("combobox").filter((s) => Array.from((s as HTMLSelectElement).options).some((o) => o.value === "TCS")) as HTMLSelectElement[];
      expect(Array.from(a.options).map((o) => o.value)).toEqual(["GCS", "FAS", "TCS"]);
      expect(Array.from(b.options).map((o) => o.value)).toEqual(["GCS", "FAS", "TCS", "OPS"]);
    });
  });

  describe("output limits", () => {
    it.each(["solenoid", "powered_device", "powered_gpio_device", "gpio_device", "motor"] as const)("shows them for a %s on a Pi", (type) => {
      renderActuators([{ name: "X", type, binding: { target: "TCS" }, actions: {} }]);
      fireEvent.click(screen.getByText(`${type} settings`));
      expect(screen.getByText("max_on_s")).toBeInTheDocument();
      expect(screen.getByText("on_comms_loss")).toBeInTheDocument();
    });

    it("hides them for a servo and for the FAS", () => {
      renderActuators([
        { name: "S", type: "servo", binding: { target: "GCS" }, actions: {} },
        { name: "F", type: "solenoid", binding: { target: "FAS", node: "EPB_0" }, actions: {} },
      ]);
      fireEvent.click(screen.getByText("servo settings"));
      expect(screen.queryByText("max_on_s")).not.toBeInTheDocument();
      fireEvent.click(screen.getByText("solenoid settings"));
      expect(screen.queryByText("max_on_s")).not.toBeInTheDocument();
    });

    it("edits max_on_s and on_comms_loss, defaulting to hold, and clears max_on_s to null", () => {
      const spy = renderActuators([{ name: "H", type: "gpio_device", binding: { target: "TCS", gpio_channel: 17 }, actions: {} }]);
      fireEvent.click(screen.getByText("gpio_device settings"));
      const commsLoss = selectWith("safe");
      expect(commsLoss.value).toBe("hold");
      fireEvent.change(commsLoss, { target: { value: "safe" } });
      fireEvent.change(screen.getByPlaceholderText("no limit"), { target: { value: "600" } });
      expect(last<ActuatorEntry[]>(spy)[0].actions).toMatchObject({ max_on_s: 600, on_comms_loss: "safe" });
      fireEvent.change(screen.getByPlaceholderText("no limit"), { target: { value: "" } });
      expect(last<ActuatorEntry[]>(spy)[0].actions?.max_on_s).toBeNull();
    });

    it("resets the limits when the target moves off the Pis", () => {
      const spy = renderActuators([{ name: "H", type: "solenoid", binding: { target: "GCS", relay_channel: 2 }, actions: { max_on_s: 30, on_comms_loss: "safe" } }]);
      fireEvent.change(screen.getByDisplayValue("GCS"), { target: { value: "FAS" } });
      expect(last<ActuatorEntry[]>(spy)[0].actions).toMatchObject({ max_on_s: null, on_comms_loss: "hold" });
    });
  });

  describe("sensors", () => {
    it("offers a thermocouple type for a Pi TC, defaulting to K", () => {
      const spy = renderSensors([sensor({ name: "TC1", type: "TC", binding: { source: "TCS", hat_id: 1, channel_id: 0 } })]);
      const tcType = selectWith("J");
      expect(Array.from(tcType.options).map((o) => o.value)).toEqual(["J", "K", "T", "E", "R", "S", "B", "N"]);
      expect(tcType.value).toBe("K");
      fireEvent.change(tcType, { target: { value: "T" } });
      expect(last<SensorEntry[]>(spy)[0].tc_type).toBe("T");
    });

    it("has no thermocouple type for a FAS TC or a non-TC sensor", () => {
      renderSensors([
        sensor({ name: "A", type: "TC", binding: { source: "FAS", node: "EPB_0", channel: 1 } }),
        sensor({ name: "B", type: "PT" }),
      ]);
      expect(screen.queryByTitle("Thermocouple type (MCC 134)")).not.toBeInTheDocument();
    });

    it("clears the thermocouple type when the sensor moves to the FAS or stops being a TC", () => {
      const spy = renderSensors([sensor({ name: "TC1", type: "TC", tc_type: "T" })]);
      fireEvent.change(screen.getByDisplayValue("TC"), { target: { value: "PT" } });
      expect(last<SensorEntry[]>(spy)[0].tc_type).toBeNull();
    });

    it("turns a sensor into a DI with a GPIO binding and no pin yet", () => {
      const spy = renderSensors([sensor({ binding: { source: "TCS", hat_id: 1, channel_id: 2 } })]);
      fireEvent.change(screen.getByDisplayValue("PT"), { target: { value: "DI" } });
      expect(last<SensorEntry[]>(spy)[0]).toMatchObject({ type: "DI", binding: { source: "TCS" }, convert: { method: "none" } });
      expect(last<SensorEntry[]>(spy)[0].binding).not.toHaveProperty("hat_id");
    });

    it("picks a DI pin from the usable BCM pins, hiding ones other DIs on that Pi use", () => {
      const spy = renderSensors([
        sensor({ name: "D1", type: "DI", binding: { source: "GCS", gpio_channel: 5 } }),
        sensor({ name: "D2", type: "DI", binding: { source: "GCS", gpio_channel: 6 } }),
      ]);
      const pinSelects = screen.getAllByTitle("BCM GPIO input pin (reserved pins not offered)").map((b) => within(b).getByRole("combobox") as HTMLSelectElement);
      const second = Array.from(pinSelects[1].options).map((o) => o.value).filter(Boolean);
      expect(second).not.toContain("5");
      expect(second).not.toContain("8");
      expect(second).toContain("6");
      fireEvent.change(pinSelects[1], { target: { value: "27" } });
      expect(last<SensorEntry[]>(spy)[1].binding).toEqual({ source: "GCS", gpio_channel: 27 });
    });

    it("offers only GCS and TCS as a DI's source, and keeps the pin when switching", () => {
      const spy = renderSensors([sensor({ name: "D1", type: "DI", binding: { source: "GCS", gpio_channel: 5 } })]);
      const source = screen.getByDisplayValue("GCS") as HTMLSelectElement;
      expect(Array.from(source.options).map((o) => o.value)).toEqual(["GCS", "TCS"]);
      fireEvent.change(source, { target: { value: "TCS" } });
      expect(last<SensorEntry[]>(spy)[0].binding).toEqual({ source: "TCS", gpio_channel: 5 });
    });

    it("turns a DI back into a DAQ channel binding", () => {
      const spy = renderSensors([sensor({ name: "D1", type: "DI", binding: { source: "TCS", gpio_channel: 5 } })]);
      fireEvent.change(screen.getByDisplayValue("DI"), { target: { value: "TC" } });
      expect(last<SensorEntry[]>(spy)[0].binding).toEqual({ source: "TCS", hat_id: 0, channel_id: 0 });
    });
  });
});

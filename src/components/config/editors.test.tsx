import { fireEvent, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import type { DeviceEntry, PacketEntry, ProcedureEntry, SafetyRules } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { BuzzerMelodiesTable } from "./BuzzerMelodiesTable";
import { DevicesTable } from "./DevicesTable";
import { PacketsTable } from "./PacketsTable";
import { ProceduresTable } from "./ProceduresTable";
import { RulesTable } from "./RulesTable";

/** Keep the value in state like the Config page does, and report every change. */
function Stateful<T>({ initial, spy, render }: { initial: T; spy: (next: T) => void; render: (value: T, set: (next: T) => void) => React.ReactNode }) {
  const [value, setValue] = useState(initial);
  return <>{render(value, (next) => { spy(next); setValue(next); })}</>;
}

const last = <T,>(spy: ReturnType<typeof vi.fn>) => spy.mock.calls.at(-1)![0] as T;
const click = (text: string) => fireEvent.click(screen.getByText(text));
const clickLabel = (label: string, index = 0) => fireEvent.click(screen.getAllByLabelText(label)[index]);

// ---------------------------------------------------------------------------

describe("ProceduresTable", () => {
  function setup(initial: ProcedureEntry[]) {
    const spy = vi.fn();
    renderWithProviders(
      <Stateful<ProcedureEntry[]> initial={initial} spy={spy} render={(v, set) => <ProceduresTable procedures={v} onChange={set} />} />,
    );
    return spy;
  }

  it("shows an empty state, marked frontend-only", () => {
    setup([]);
    expect(screen.getByText("No procedures. Add one below.")).toBeInTheDocument();
    expect(screen.getByText("frontend only")).toBeInTheDocument();
  });

  it("adds a blank procedure, then steps to it", () => {
    const spy = setup([]);
    click("Add procedure");
    expect(last<ProcedureEntry[]>(spy)).toEqual([{ name: "", steps: [] }]);
    click("Add step");
    expect(last<ProcedureEntry[]>(spy)[0].steps).toEqual([""]);
  });

  it("renames a procedure and edits a step, numbering steps from 1", () => {
    const spy = setup([{ name: "Fill", steps: ["open valve", "close valve"] }]);
    expect(screen.getByText("1.")).toBeInTheDocument();
    expect(screen.getByText("2.")).toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue("Fill"), { target: { value: "Fuel fill" } });
    fireEvent.change(screen.getByDisplayValue("close valve"), { target: { value: "shut valve" } });
    expect(last<ProcedureEntry[]>(spy)[0]).toEqual({ name: "Fuel fill", steps: ["open valve", "shut valve"] });
  });

  it("removes one step and renumbers the rest", () => {
    const spy = setup([{ name: "P", steps: ["a", "b", "c"] }]);
    clickLabel("Remove step", 1);
    expect(last<ProcedureEntry[]>(spy)[0].steps).toEqual(["a", "c"]);
    expect(screen.queryByText("3.")).not.toBeInTheDocument();
  });

  it("removes a whole procedure, leaving the others", () => {
    const spy = setup([{ name: "A", steps: [] }, { name: "B", steps: [] }]);
    clickLabel("Remove procedure", 0);
    expect(last<ProcedureEntry[]>(spy).map((p) => p.name)).toEqual(["B"]);
  });

  it("keeps each procedure's steps separate", () => {
    const spy = setup([{ name: "A", steps: ["x"] }, { name: "B", steps: ["y"] }]);
    fireEvent.change(screen.getByDisplayValue("y"), { target: { value: "z" } });
    expect(last<ProcedureEntry[]>(spy)).toEqual([{ name: "A", steps: ["x"] }, { name: "B", steps: ["z"] }]);
  });
});

// ---------------------------------------------------------------------------

describe("RulesTable", () => {
  function setup(rules: SafetyRules) {
    const spy = vi.fn();
    renderWithProviders(<Stateful<SafetyRules> initial={rules} spy={spy} render={(v, set) => <RulesTable rules={v} onChange={set} />} />);
    return spy;
  }

  it("explains what the two kinds mean and shows each count", () => {
    setup({ hazardous: [{ A: "ALL" }, { B: "open" }], critical: [] });
    expect(screen.getByText("Hazardous (blocked by lockout)")).toBeInTheDocument();
    expect(screen.getByText("Critical")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("No critical rules.")).toBeInTheDocument();
  });

  it("copes with a config that has no rules at all", () => {
    setup({});
    expect(screen.getByText("No hazardous rules.")).toBeInTheDocument();
    expect(screen.getByText("No critical rules.")).toBeInTheDocument();
  });

  it("shows a rule as its name and its states", () => {
    setup({ hazardous: [{ SVFTV: "open" }, { MAINS: ["open", "arm"] }] });
    expect(screen.getByDisplayValue("SVFTV")).toBeInTheDocument();
    expect(screen.getByDisplayValue("open")).toBeInTheDocument();
    expect(screen.getByDisplayValue("open, arm")).toBeInTheDocument();
  });

  it("adds a rule that blocks every state of a blank command, to the right list", () => {
    const spy = setup({});
    click("Add critical rule");
    expect(last<SafetyRules>(spy).critical).toEqual([{ "": "ALL" }]);
    click("Add hazardous rule");
    expect(last<SafetyRules>(spy)).toEqual({ critical: [{ "": "ALL" }], hazardous: [{ "": "ALL" }] });
  });

  it("renames a rule, keeping its states", () => {
    const spy = setup({ hazardous: [{ A: "open" }] });
    fireEvent.change(screen.getByDisplayValue("A"), { target: { value: "B" } });
    expect(last<SafetyRules>(spy).hazardous).toEqual([{ B: "open" }]);
  });

  it("stores one state as a string and several as a list", () => {
    const spy = setup({ hazardous: [{ A: "open" }] });
    fireEvent.change(screen.getByDisplayValue("open"), { target: { value: "open, arm" } });
    expect(last<SafetyRules>(spy).hazardous).toEqual([{ A: ["open", "arm"] }]);
    fireEvent.change(screen.getByDisplayValue("open, arm"), { target: { value: "arm" } });
    expect(last<SafetyRules>(spy).hazardous).toEqual([{ A: "arm" }]);
  });

  it("treats blank states as ALL, which blocks every state", () => {
    const spy = setup({ hazardous: [{ A: "open" }] });
    fireEvent.change(screen.getByDisplayValue("open"), { target: { value: "" } });
    expect(last<SafetyRules>(spy).hazardous).toEqual([{ A: "ALL" }]);
  });

  it("removes only the chosen rule", () => {
    const spy = setup({ hazardous: [{ A: "ALL" }, { B: "ALL" }] });
    clickLabel("Remove rule", 0);
    expect(last<SafetyRules>(spy).hazardous).toEqual([{ B: "ALL" }]);
  });

  it("leaves the other list alone when one is edited", () => {
    const spy = setup({ hazardous: [{ A: "ALL" }], critical: [{ C: "ALL" }] });
    clickLabel("Remove rule", 0);
    expect(last<SafetyRules>(spy).critical).toEqual([{ C: "ALL" }]);
  });

  // Known gap: a comma typed after a state is parsed away on the same keystroke,
  // so a rule with several states cannot be typed by hand (the other list cells
  // keep their raw text; this one rebuilds it from the parsed value).
  it.fails("lets a trailing comma be typed while entering several states", () => {
    setup({ hazardous: [{ A: "open" }] });
    const input = screen.getByDisplayValue("open");
    fireEvent.change(input, { target: { value: "open," } });
    expect(screen.getByDisplayValue("open,")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------

describe("PacketsTable", () => {
  function setup(packets: PacketEntry[]) {
    const spy = vi.fn();
    renderWithProviders(<Stateful<PacketEntry[]> initial={packets} spy={spy} render={(v, set) => <PacketsTable packets={v} onChange={set} />} />);
    return spy;
  }
  const pwm: PacketEntry = { name: "PWM Set", op: "pwm_set", fields: [{ key: "channel", type: "number", default: 0 }, { key: "enable", type: "bool", default: true }] };

  it("shows an empty state and the known ops", () => {
    setup([]);
    expect(screen.getByText("No packets. Add one below.")).toBeInTheDocument();
    expect(screen.getByText(/Ops: pwm_set/)).toBeInTheDocument();
  });

  it("shows each packet's name, op and parameter count", () => {
    setup([pwm]);
    expect(screen.getByDisplayValue("PWM Set")).toBeInTheDocument();
    expect(screen.getByDisplayValue("pwm_set")).toBeInTheDocument();
    expect(screen.getByText("2 params")).toBeInTheDocument();
  });

  it("adds a blank packet and opens its parameters", () => {
    const spy = setup([]);
    click("Add packet");
    expect(last<PacketEntry[]>(spy)).toEqual([{ name: "", op: "", fields: [] }]);
    expect(screen.getByText(/No parameters/)).toBeInTheDocument();
  });

  it("edits the name and op", () => {
    const spy = setup([pwm]);
    fireEvent.change(screen.getByDisplayValue("PWM Set"), { target: { value: "Servo" } });
    fireEvent.change(screen.getByDisplayValue("pwm_set"), { target: { value: "servo" } });
    expect(last<PacketEntry[]>(spy)[0]).toMatchObject({ name: "Servo", op: "servo" });
  });

  it("removes a packet and closes any open editor", () => {
    const spy = setup([pwm, { name: "B", op: "b", fields: [] }]);
    click("2 params");
    clickLabel("Remove packet", 0);
    expect(last<PacketEntry[]>(spy).map((p) => p.op)).toEqual(["b"]);
    expect(screen.queryByText(/Parameters — sent to the FAS bridge/)).not.toBeInTheDocument();
  });

  describe("parameters", () => {
    it("adds a numeric parameter that defaults to 0", () => {
      const spy = setup([{ name: "P", op: "p", fields: [] }]);
      click("0 params");
      click("Add parameter");
      expect(last<PacketEntry[]>(spy)[0].fields).toEqual([{ key: "", type: "number", default: 0 }]);
    });

    it("edits a parameter's key and numeric default", () => {
      const spy = setup([pwm]);
      click("2 params");
      fireEvent.change(screen.getByDisplayValue("channel"), { target: { value: "ch" } });
      fireEvent.change(screen.getAllByDisplayValue("0")[0], { target: { value: "7" } });
      expect(last<PacketEntry[]>(spy)[0].fields[0]).toEqual({ key: "ch", type: "number", default: 7 });
    });

    it("clears a numeric default to undefined when emptied, so it falls back to the type's default", () => {
      const spy = setup([pwm]);
      click("2 params");
      fireEvent.change(screen.getAllByDisplayValue("0")[0], { target: { value: "" } });
      expect(last<PacketEntry[]>(spy)[0].fields[0].default).toBeUndefined();
    });

    it("changing the type resets the default to that type's zero value", () => {
      const spy = setup([pwm]);
      click("2 params");
      const typeSelects = screen.getAllByDisplayValue("number");
      fireEvent.change(typeSelects[0], { target: { value: "bool" } });
      expect(last<PacketEntry[]>(spy)[0].fields[0]).toMatchObject({ type: "bool", default: false });
      const boolSelects = screen.getAllByDisplayValue("bool");
      fireEvent.change(boolSelects[boolSelects.length - 1], { target: { value: "number" } });
      expect(last<PacketEntry[]>(spy)[0].fields.at(-1)).toMatchObject({ type: "number", default: 0 });
    });

    it("edits a boolean default", () => {
      const spy = setup([pwm]);
      click("2 params");
      fireEvent.change(screen.getByDisplayValue("true"), { target: { value: "false" } });
      expect(last<PacketEntry[]>(spy)[0].fields[1].default).toBe(false);
    });

    it("removes one parameter", () => {
      const spy = setup([pwm]);
      click("2 params");
      clickLabel("Remove parameter", 0);
      expect(last<PacketEntry[]>(spy)[0].fields.map((f) => f.key)).toEqual(["enable"]);
    });

    // Known gap: a half-typed number such as "-" is stored as NaN in the config.
    it.fails("never stores NaN as a default while a number is being typed", () => {
      const spy = setup([pwm]);
      click("2 params");
      fireEvent.change(screen.getAllByDisplayValue("0")[0], { target: { value: "-" } });
      expect(Number.isNaN(last<PacketEntry[]>(spy)[0].fields[0].default as number)).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------

describe("DevicesTable", () => {
  function setup(devices: DeviceEntry[]) {
    const spy = vi.fn();
    renderWithProviders(<Stateful<DeviceEntry[]> initial={devices} spy={spy} render={(v, set) => <DevicesTable devices={v} onChange={set} />} />);
    return spy;
  }
  const epb: DeviceEntry = { key: "EPB:0", label: "Engineering board", ranges: { voltage: [0, 30], current: [0, 5] } };

  it("shows an empty state", () => {
    setup([]);
    expect(screen.getByText("No devices. Add one below.")).toBeInTheDocument();
  });

  it("shows each device's key, label and range count", () => {
    setup([epb, { key: "PMB:0" }]);
    expect(screen.getByDisplayValue("EPB:0")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Engineering board")).toBeInTheDocument();
    expect(screen.getByText("2 ranges")).toBeInTheDocument();
    expect(screen.getByText("0 ranges")).toBeInTheDocument();
  });

  it("adds a blank device and opens its ranges", () => {
    const spy = setup([]);
    click("Add device");
    expect(last<DeviceEntry[]>(spy)).toEqual([{ key: "", label: "", ranges: {} }]);
    expect(screen.getByText(/No ranges \(charts autoscale\)/)).toBeInTheDocument();
  });

  it("edits the key and label, and removes a device", () => {
    const spy = setup([epb, { key: "PMB:0", ranges: {} }]);
    fireEvent.change(screen.getByDisplayValue("EPB:0"), { target: { value: "EPB:1" } });
    expect(last<DeviceEntry[]>(spy)[0].key).toBe("EPB:1");
    clickLabel("Remove device", 0);
    expect(last<DeviceEntry[]>(spy).map((d) => d.key)).toEqual(["PMB:0"]);
  });

  describe("chart ranges", () => {
    it("lists and edits a range's bounds", () => {
      const spy = setup([epb]);
      click("2 ranges");
      expect(screen.getByDisplayValue("voltage")).toBeInTheDocument();
      fireEvent.change(screen.getAllByDisplayValue("30")[0], { target: { value: "40" } });
      expect(last<DeviceEntry[]>(spy)[0].ranges).toEqual({ voltage: [0, 40], current: [0, 5] });
      fireEvent.change(screen.getAllByDisplayValue("0")[0], { target: { value: "-5" } });
      expect(last<DeviceEntry[]>(spy)[0].ranges!.voltage).toEqual([-5, 40]);
    });

    it("treats a cleared bound as 0", () => {
      const spy = setup([epb]);
      click("2 ranges");
      fireEvent.change(screen.getAllByDisplayValue("30")[0], { target: { value: "" } });
      expect(last<DeviceEntry[]>(spy)[0].ranges!.voltage).toEqual([0, 0]);
    });

    it("adds a range with a blank metric name", () => {
      const spy = setup([{ key: "EPB:0", ranges: {} }]);
      click("0 ranges");
      click("Add range");
      expect(last<DeviceEntry[]>(spy)[0].ranges).toEqual({ "": [0, 0] });
    });

    it("renames a metric, keeping its bounds and the order of the others", () => {
      const spy = setup([epb]);
      click("2 ranges");
      fireEvent.change(screen.getByDisplayValue("voltage"), { target: { value: "volts" } });
      const ranges = last<DeviceEntry[]>(spy)[0].ranges!;
      expect(Object.keys(ranges)).toEqual(["volts", "current"]);
      expect(ranges.volts).toEqual([0, 30]);
    });

    it("removes a range", () => {
      const spy = setup([epb]);
      click("2 ranges");
      clickLabel("Remove range", 0);
      expect(last<DeviceEntry[]>(spy)[0].ranges).toEqual({ current: [0, 5] });
    });

    it("lists the metrics each board kind understands", () => {
      setup([epb]);
      click("2 ranges");
      expect(screen.getByText(/EPB: voltage current/)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------

describe("BuzzerMelodiesTable", () => {
  type Melodies = Record<string, Array<[number, number] | [number, number, number]>>;
  function setup(melodies: Melodies) {
    const spy = vi.fn();
    renderWithProviders(<Stateful<Melodies> initial={melodies} spy={spy} render={(v, set) => <BuzzerMelodiesTable melodies={v} onChange={set} />} />);
    return spy;
  }
  const boot: Melodies = { boot: [[440, 200], [880, 100, 128]] };

  it("shows an empty state", () => {
    setup({});
    expect(screen.getByText("No melodies. Add one below.")).toBeInTheDocument();
  });

  it("shows each melody's name and note count, in the singular for one", () => {
    setup({ boot: [[440, 200], [880, 100]], ping: [[1000, 50]] });
    expect(screen.getByText("2 notes")).toBeInTheDocument();
    expect(screen.getByText("1 note")).toBeInTheDocument();
  });

  it("adds a one-note melody with a unique name, and opens its editor", () => {
    const spy = setup({ new_melody: [[1, 1]] });
    click("Add melody");
    expect(Object.keys(last<Melodies>(spy))).toEqual(["new_melody", "new_melody_1"]);
    expect(last<Melodies>(spy).new_melody_1).toEqual([[440, 200]]);
    expect(screen.getByDisplayValue("[[440,200]]")).toBeInTheDocument();
  });

  it("renames a melody, keeping its notes and place", () => {
    const spy = setup({ ...boot, other: [[1, 1]] });
    fireEvent.change(screen.getByDisplayValue("boot"), { target: { value: "startup" } });
    expect(Object.keys(last<Melodies>(spy))).toEqual(["startup", "other"]);
    expect(last<Melodies>(spy).startup).toEqual(boot.boot);
  });

  it("removes a melody and closes its editor", () => {
    const spy = setup(boot);
    click("2 notes");
    clickLabel("Remove melody");
    expect(last<Melodies>(spy)).toEqual({});
    expect(screen.queryByText(/JSON array of/)).not.toBeInTheDocument();
  });

  it("opens the notes as JSON, and toggles closed", () => {
    setup(boot);
    click("2 notes");
    expect(screen.getByDisplayValue("[[440,200],[880,100,128]]")).toBeInTheDocument();
    click("2 notes");
    expect(screen.queryByText(/JSON array of/)).not.toBeInTheDocument();
  });

  describe("editing notes", () => {
    const area = () => document.querySelector("textarea") as HTMLTextAreaElement;

    it("applies valid notes immediately, with or without a volume", () => {
      const spy = setup(boot);
      click("2 notes");
      fireEvent.change(area(), { target: { value: "[[100,10],[200,20,64],[300,30]]" } });
      expect(last<Melodies>(spy).boot).toEqual([[100, 10], [200, 20, 64], [300, 30]]);
      expect(screen.queryByText(/Invalid JSON/)).not.toBeInTheDocument();
    });

    it.each([
      ["not json", "[[1,2"],
      ["not an array", '{"a":1}'],
      ["a note that is not a list", "[1,2]"],
      ["a note with one value", "[[1]]"],
      ["a note with four values", "[[1,2,3,4]]"],
      ["a non-numeric frequency", '[["a",2]]'],
      ["a non-numeric duration", '[[1,"b"]]'],
      ["a non-numeric volume", '[[1,2,"c"]]'],
    ])("rejects %s, shows why, and keeps the last good melody", (_n, raw) => {
      const spy = setup(boot);
      click("2 notes");
      const calls = spy.mock.calls.length;
      fireEvent.change(area(), { target: { value: raw } });
      expect(screen.getByText("Invalid JSON — expected [[freq, ms], …]")).toBeInTheDocument();
      expect(spy.mock.calls.length).toBe(calls);
      expect(area().value).toBe(raw);
    });

    it("clears the error once the text is valid again", () => {
      setup(boot);
      click("2 notes");
      fireEvent.change(area(), { target: { value: "[[" } });
      fireEvent.change(area(), { target: { value: "[[1,2]]" } });
      expect(screen.queryByText(/Invalid JSON/)).not.toBeInTheDocument();
    });

    // Known gap: renaming a melody to a name that already exists silently
    // replaces that other melody and its notes.
    it.fails("does not overwrite another melody when renamed onto its name", () => {
      const spy = setup({ boot: [[1, 1]], ping: [[2, 2]] });
      fireEvent.change(screen.getByDisplayValue("boot"), { target: { value: "ping" } });
      expect(Object.keys(last<Melodies>(spy))).toHaveLength(2);
    });
  });
});

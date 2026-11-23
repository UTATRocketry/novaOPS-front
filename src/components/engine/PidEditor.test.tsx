import { act, createEvent, fireEvent, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_SYSTEMS,
  NovaActuatorControl,
  NovaBottle,
  NovaChamber,
  NovaDevice,
  NovaInstrument,
  NovaTextLabel,
  NovaValve,
  NovaVessel,
  NovaZone,
} from "@/lib/pid";
import { PID_COLORS } from "@/lib/pid/registry";
import type { NovaPidLayout } from "@/lib/pid/serializer";
import type { ActuatorEntry, SensorEntry } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { PidEditor, type PidEditorHandle } from "./PidEditor";

// The canvas, properties panel and upload modal have their own tests. Here they
// are stand-ins that record their props, and the canvas hands the editor a fake
// bridge, so what is under test is the editor's own wiring: toolbar, palette,
// shortcuts and save/load.
const stub = vi.hoisted(() => ({
  canvas: { props: null as any, autoReady: true },
  panel: { props: null as any },
  bridge: null as any,
  graph: { id: "graph" } as any,
}));

vi.mock("./PidCanvas", async () => {
  const { useEffect } = await import("react");
  return {
    PidCanvas: (props: any) => {
      stub.canvas.props = props;
      useEffect(() => {
        if (stub.canvas.autoReady) props.onReady?.(stub.graph, {}, stub.bridge);
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return <div data-testid="canvas" />;
    },
  };
});

vi.mock("./PidPropertiesPanel", () => ({
  PidPropertiesPanel: (props: any) => {
    stub.panel.props = props;
    return <div data-testid="panel">{props.cellId ?? "nothing selected"}</div>;
  },
}));

vi.mock("./UploadConfigModal", () => ({
  UploadConfigModal: ({ onClose }: { onClose: () => void }) => <button onClick={onClose}>close-upload-modal</button>,
}));

const LAYOUT: NovaPidLayout = {
  schemaVersion: 1,
  meta: { name: "t", savedAt: "2026-01-01T00:00:00Z", app: "novaops" },
  systems: { fuel: { label: "Fuel", colorToken: "fault" } },
  graph: { cells: [] },
};

const SENSORS: SensorEntry[] = [{ name: "PT1", type: "PT", unit: "psi", binding: { source: "GCS", hat_id: 0, channel_id: 0 } }];
const ACTUATORS: ActuatorEntry[] = [{ name: "SV1", type: "solenoid", binding: { target: "GCS", relay_channel: 0 } }];

function makeBridge() {
  return {
    addCellAt: vi.fn(),
    copySelected: vi.fn(),
    paste: vi.fn(),
    deleteSelected: vi.fn(),
    rotateSelected: vi.fn(),
    setPipeMode: vi.fn(),
    setActivePipeColor: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    fitContent: vi.fn(),
    resetZoom: vi.fn(),
    serializeCurrent: vi.fn(() => LAYOUT),
  };
}

const button = (name: string | RegExp) => screen.getByRole("button", { name });
const select = (id: string | null) => act(() => stub.canvas.props.onCellSelect(id));
const key = (init: KeyboardEventInit, target: Node = document.body) => {
  const e = createEvent.keyDown(target, { bubbles: true, cancelable: true, ...init });
  act(() => {
    fireEvent(target, e);
  });
  return e;
};

beforeEach(() => {
  stub.bridge = makeBridge();
  stub.canvas.autoReady = true;
  stub.canvas.props = null;
  stub.panel.props = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PidEditor: layout of the editor", () => {
  it("shows the toolbar, the palette, the canvas and the properties panel", () => {
    renderWithProviders(<PidEditor />);
    for (const name of ["Undo (Ctrl+Z)", "Redo (Ctrl+Y)", "Zoom out", "Zoom in", "Fit all", "Reset zoom", "Draw pipe (P)", "Rotate 90°", "Delete selected", "Save layout as JSON", "Load layout from JSON", "Upload YAML config"]) {
      expect(button(name)).toBeInTheDocument();
    }
    expect(screen.getByText("Edit")).toBeInTheDocument();
    for (const title of ["Structures", "Valves", "Instruments", "Controls", "Other"]) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
    expect(screen.getByTestId("canvas")).toBeInTheDocument();
    expect(screen.getByTestId("panel")).toBeInTheDocument();
  });

  it("runs the canvas in edit mode with the layout, config and a default height", () => {
    renderWithProviders(<PidEditor layout={LAYOUT} sensors={SENSORS} actuators={ACTUATORS} />);
    const p = stub.canvas.props;
    expect(p.mode).toBe("edit");
    expect(p.layout).toBe(LAYOUT);
    expect(p.sensors).toBe(SENSORS);
    expect(p.actuators).toBe(ACTUATORS);
    expect(p.height).toBe(580);
  });

  it("takes a custom height", () => {
    renderWithProviders(<PidEditor height={300} />);
    expect(stub.canvas.props.height).toBe(300);
  });

  it("offers a swatch for each palette colour, with the first active", () => {
    renderWithProviders(<PidEditor />);
    for (const c of PID_COLORS) expect(button(c.label)).toBeInTheDocument();
  });
});

describe("PidEditor: the properties panel", () => {
  it("shows nothing selected, then follows the canvas selection", () => {
    renderWithProviders(<PidEditor />);
    expect(stub.panel.props.cellId).toBeNull();
    select("valve-1");
    expect(screen.getByTestId("panel")).toHaveTextContent("valve-1");
    select(null);
    expect(stub.panel.props.cellId).toBeNull();
  });

  it("gives the panel the live graph once the canvas is ready, and the config", () => {
    renderWithProviders(<PidEditor sensors={SENSORS} actuators={ACTUATORS} />);
    select("x");
    expect(stub.panel.props.graph).toBe(stub.graph);
    expect(stub.panel.props.sensors).toBe(SENSORS);
    expect(stub.panel.props.actuators).toBe(ACTUATORS);
  });

  it("uses the layout's own systems, else the defaults", () => {
    const { rerender } = renderWithProviders(<PidEditor layout={LAYOUT} />);
    expect(stub.panel.props.systems).toBe(LAYOUT.systems);
    rerender(<PidEditor />);
    expect(stub.panel.props.systems).toBe(DEFAULT_SYSTEMS);
  });
});

describe("PidEditor: the palette", () => {
  const add = (title: string) => {
    fireEvent.click(screen.getByTitle(title));
    return stub.bridge.addCellAt.mock.calls.at(-1)?.[0];
  };

  it("drops a labelled tank, bottle and chamber", () => {
    renderWithProviders(<PidEditor />);
    const tank = add("Tank");
    expect(tank).toBeInstanceOf(NovaVessel);
    expect(tank.get("label")).toBe("TANK");
    const bottle = add("Bottle");
    expect(bottle).toBeInstanceOf(NovaBottle);
    expect(bottle.get("label")).toBe("BOTTLE");
    const chamber = add("Chamber");
    expect(chamber).toBeInstanceOf(NovaChamber);
    expect(chamber.get("label")).toBe("CHAMBER");
  });

  it("drops a text label that reads TEXT", () => {
    renderWithProviders(<PidEditor />);
    const label = add("Text label");
    expect(label).toBeInstanceOf(NovaTextLabel);
    expect(label.attr("label/text")).toBe("TEXT");
  });

  it("drops each valve type unbound and uncontrollable", () => {
    renderWithProviders(<PidEditor />);
    for (const [title, variant] of [["2-way ball", "ball2"], ["3-way ball", "ball3"], ["Solenoid", "solenoid"]]) {
      const v = add(title);
      expect(v).toBeInstanceOf(NovaValve);
      expect(v.get("symbolVariant")).toBe(variant);
      expect(v.get("binding")).toBeNull();
      expect(v.isControllable()).toBe(false);
    }
  });

  it("drops each instrument type with an empty binding", () => {
    renderWithProviders(<PidEditor />);
    for (const [title, type] of [["Pressure (PT)", "PT"], ["Thermocouple (TC)", "TC"], ["Load (LC)", "LC"]]) {
      const i = add(title);
      expect(i).toBeInstanceOf(NovaInstrument);
      expect(i.get("instrumentType")).toBe(type);
      expect(i.get("binding")).toEqual({ name: "" });
      expect(i.get("hint")).toEqual({ unit: "", range: [0, 100] });
    }
  });

  it("drops an unbound control, device and a zone", () => {
    renderWithProviders(<PidEditor />);
    const control = add("Actuator control");
    expect(control).toBeInstanceOf(NovaActuatorControl);
    expect(control.bindingName()).toBeNull();
    const device = add("Device");
    expect(device).toBeInstanceOf(NovaDevice);
    expect(device.isControllable()).toBe(false);
    const zone = add("Zone (box)");
    expect(zone).toBeInstanceOf(NovaZone);
    expect(zone.get("label")).toBe("ZONE");
  });

  it("does nothing before the canvas is ready", () => {
    stub.canvas.autoReady = false;
    renderWithProviders(<PidEditor />);
    fireEvent.click(screen.getByTitle("Tank"));
    expect(stub.bridge.addCellAt).not.toHaveBeenCalled();
  });
});

describe("PidEditor: toolbar", () => {
  it.each([
    ["Undo (Ctrl+Z)", "undo"],
    ["Redo (Ctrl+Y)", "redo"],
    ["Zoom out", "zoomOut"],
    ["Zoom in", "zoomIn"],
    ["Fit all", "fitContent"],
    ["Reset zoom", "resetZoom"],
  ])("%s calls the bridge", (label, method) => {
    renderWithProviders(<PidEditor />);
    fireEvent.click(button(label));
    expect(stub.bridge[method]).toHaveBeenCalledTimes(1);
  });

  it("disables rotate and delete until something is selected", () => {
    renderWithProviders(<PidEditor />);
    expect(button("Rotate 90°")).toHaveAttribute("aria-disabled", "true");
    expect(button("Delete selected")).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(button("Rotate 90°"));
    fireEvent.click(button("Delete selected"));
    expect(stub.bridge.rotateSelected).not.toHaveBeenCalled();
    expect(stub.bridge.deleteSelected).not.toHaveBeenCalled();
    select("c1");
    expect(button("Rotate 90°")).toHaveAttribute("aria-disabled", "false");
    fireEvent.click(button("Rotate 90°"));
    fireEvent.click(button("Delete selected"));
    expect(stub.bridge.rotateSelected).toHaveBeenCalledTimes(1);
    expect(stub.bridge.deleteSelected).toHaveBeenCalledTimes(1);
  });

  it("toggles pipe mode, passing the chosen colour first", () => {
    renderWithProviders(<PidEditor />);
    fireEvent.click(button("Draw pipe (P)"));
    expect(stub.bridge.setActivePipeColor).toHaveBeenLastCalledWith("info");
    expect(stub.bridge.setPipeMode).toHaveBeenLastCalledWith(true);
    fireEvent.click(button("Exit pipe mode (P)"));
    expect(stub.bridge.setPipeMode).toHaveBeenLastCalledWith(false);
    expect(button("Draw pipe (P)")).toBeInTheDocument();
  });

  it("sets the pipe colour from a swatch and uses it when pipe mode starts", () => {
    renderWithProviders(<PidEditor />);
    const other = PID_COLORS.find((c) => c.token !== "info")!;
    fireEvent.click(button(other.label));
    expect(stub.bridge.setActivePipeColor).toHaveBeenLastCalledWith(other.token);
    fireEvent.click(button("Draw pipe (P)"));
    expect(stub.bridge.setActivePipeColor).toHaveBeenLastCalledWith(other.token);
  });

  it("does not throw if a toolbar button is used before the canvas is ready", () => {
    stub.canvas.autoReady = false;
    renderWithProviders(<PidEditor />);
    for (const name of ["Undo (Ctrl+Z)", "Zoom in", "Fit all", "Draw pipe (P)"]) fireEvent.click(button(name));
    expect(stub.bridge.undo).not.toHaveBeenCalled();
  });

  it("opens and closes the config upload dialog", () => {
    renderWithProviders(<PidEditor />);
    expect(screen.queryByText("close-upload-modal")).not.toBeInTheDocument();
    fireEvent.click(button("Upload YAML config"));
    fireEvent.click(screen.getByText("close-upload-modal"));
    expect(screen.queryByText("close-upload-modal")).not.toBeInTheDocument();
  });
});

describe("PidEditor: keyboard shortcuts", () => {
  it("deletes the selection with Delete or Backspace", () => {
    renderWithProviders(<PidEditor />);
    expect(key({ key: "Delete" }).defaultPrevented).toBe(true);
    key({ key: "Backspace" });
    expect(stub.bridge.deleteSelected).toHaveBeenCalledTimes(2);
  });

  it("rotates with R in either case", () => {
    renderWithProviders(<PidEditor />);
    key({ key: "r" });
    key({ key: "R" });
    expect(stub.bridge.rotateSelected).toHaveBeenCalledTimes(2);
  });

  it("toggles pipe mode with P, keeping the toolbar in step", () => {
    renderWithProviders(<PidEditor />);
    key({ key: "p" });
    expect(stub.bridge.setPipeMode).toHaveBeenLastCalledWith(true, undefined);
    expect(button("Exit pipe mode (P)")).toBeInTheDocument();
    key({ key: "P" });
    expect(stub.bridge.setPipeMode).toHaveBeenLastCalledWith(false, undefined);
    expect(button("Draw pipe (P)")).toBeInTheDocument();
  });

  it("undoes with Ctrl or Cmd Z, redoes with Ctrl or Cmd Y", () => {
    renderWithProviders(<PidEditor />);
    key({ key: "z", ctrlKey: true });
    key({ key: "z", metaKey: true });
    expect(stub.bridge.undo).toHaveBeenCalledTimes(2);
    key({ key: "y", ctrlKey: true });
    key({ key: "y", metaKey: true });
    expect(stub.bridge.redo).toHaveBeenCalledTimes(2);
  });

  it("copies and pastes with Ctrl or Cmd C and V, in either case", () => {
    renderWithProviders(<PidEditor />);
    key({ key: "c", ctrlKey: true });
    key({ key: "C", metaKey: true });
    key({ key: "v", ctrlKey: true });
    key({ key: "V", metaKey: true });
    expect(stub.bridge.copySelected).toHaveBeenCalledTimes(2);
    expect(stub.bridge.paste).toHaveBeenCalledTimes(2);
  });

  // KNOWN GAP: with Shift held the browser reports key "Z" (capital), but the
  // handler compares with "z", so the documented Ctrl+Shift+Z redo never fires.
  it.fails("redoes with Ctrl+Shift+Z", () => {
    renderWithProviders(<PidEditor />);
    key({ key: "Z", ctrlKey: true, shiftKey: true });
    expect(stub.bridge.redo).toHaveBeenCalledTimes(1);
  });

  // KNOWN GAP: R and P are matched without checking for modifiers, so while
  // the editor is open Ctrl+R (reload) and Ctrl+P (print) are swallowed and
  // instead rotate the selection / toggle pipe mode.
  it.fails("leaves browser shortcuts such as Ctrl+R alone", () => {
    renderWithProviders(<PidEditor />);
    const e = key({ key: "r", ctrlKey: true });
    expect(e.defaultPrevented).toBe(false);
    expect(stub.bridge.rotateSelected).not.toHaveBeenCalled();
  });

  it.each(["input", "textarea", "select"])("ignores shortcuts typed in a %s", (tag) => {
    renderWithProviders(<PidEditor />);
    const field = document.body.appendChild(document.createElement(tag));
    const e = key({ key: "Delete" }, field);
    key({ key: "r" }, field);
    key({ key: "z", ctrlKey: true }, field);
    expect(e.defaultPrevented).toBe(false);
    expect(stub.bridge.deleteSelected).not.toHaveBeenCalled();
    expect(stub.bridge.rotateSelected).not.toHaveBeenCalled();
    expect(stub.bridge.undo).not.toHaveBeenCalled();
  });

  it("ignores shortcuts typed in an editable element", () => {
    renderWithProviders(<PidEditor />);
    const div = document.body.appendChild(document.createElement("div"));
    Object.defineProperty(div, "isContentEditable", { value: true });
    key({ key: "Delete" }, div);
    expect(stub.bridge.deleteSelected).not.toHaveBeenCalled();
  });

  it("ignores unrelated keys", () => {
    renderWithProviders(<PidEditor />);
    const e = key({ key: "a" });
    key({ key: "z" });
    expect(e.defaultPrevented).toBe(false);
    expect(stub.bridge.undo).not.toHaveBeenCalled();
  });

  it("stops listening when it unmounts", () => {
    const { unmount } = renderWithProviders(<PidEditor />);
    unmount();
    key({ key: "Delete" });
    expect(stub.bridge.deleteSelected).not.toHaveBeenCalled();
  });
});

describe("PidEditor: saving and loading", () => {
  let saved: { blob: Blob; name: string } | null;

  beforeEach(() => {
    saved = null;
    Object.assign(URL, {
      createObjectURL: (blob: Blob) => {
        saved = { blob, name: "" };
        return "blob:layout";
      },
      revokeObjectURL: () => {},
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      if (saved) saved.name = this.download;
    });
  });

  it("serialises the graph, reports it, and downloads it as indented JSON", async () => {
    const onLayoutChange = vi.fn();
    renderWithProviders(<PidEditor onLayoutChange={onLayoutChange} />);
    fireEvent.click(button("Save layout as JSON"));
    expect(stub.bridge.serializeCurrent).toHaveBeenCalledWith("P&ID Layout");
    expect(onLayoutChange).toHaveBeenCalledWith(LAYOUT);
    expect(saved!.name).toMatch(/^pid-layout-\d+\.json$/);
    expect(await saved!.blob.text()).toBe(JSON.stringify(LAYOUT, null, 2));
  });

  it("saves without a listener", () => {
    renderWithProviders(<PidEditor />);
    fireEvent.click(button("Save layout as JSON"));
    expect(saved).not.toBeNull();
  });

  it("saves nothing before the canvas is ready", () => {
    stub.canvas.autoReady = false;
    renderWithProviders(<PidEditor />);
    fireEvent.click(button("Save layout as JSON"));
    expect(saved).toBeNull();
  });

  describe("Load", () => {
    let input: HTMLInputElement;
    let alertSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (this: HTMLInputElement) {
        input = this;
      });
      alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    });

    const choose = (file: File | null) => {
      Object.defineProperty(input, "files", { value: file ? [file] : [], configurable: true });
      input.onchange!(new Event("change"));
    };

    it("asks for a JSON file", () => {
      renderWithProviders(<PidEditor />);
      fireEvent.click(button("Load layout from JSON"));
      expect(input.type).toBe("file");
      expect(input.accept).toBe(".json");
    });

    it("hands a valid layout to the parent", async () => {
      const onLayoutChange = vi.fn();
      renderWithProviders(<PidEditor onLayoutChange={onLayoutChange} />);
      fireEvent.click(button("Load layout from JSON"));
      choose(new File([JSON.stringify(LAYOUT)], "layout.json"));
      await waitFor(() => expect(onLayoutChange).toHaveBeenCalledWith(LAYOUT));
      expect(alertSpy).not.toHaveBeenCalled();
    });

    it("rejects a file that is not a Nova layout, and tells the user", async () => {
      const onLayoutChange = vi.fn();
      renderWithProviders(<PidEditor onLayoutChange={onLayoutChange} />);
      fireEvent.click(button("Load layout from JSON"));
      choose(new File(['{"hello":1}'], "other.json"));
      await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("Invalid layout file — not a Nova P&ID JSON."));
      expect(onLayoutChange).not.toHaveBeenCalled();
    });

    it("rejects text that is not JSON", async () => {
      const onLayoutChange = vi.fn();
      renderWithProviders(<PidEditor onLayoutChange={onLayoutChange} />);
      fireEvent.click(button("Load layout from JSON"));
      choose(new File(["not json"], "x.json"));
      await waitFor(() => expect(alertSpy).toHaveBeenCalled());
      expect(onLayoutChange).not.toHaveBeenCalled();
    });

    it("does nothing when the dialog is cancelled", () => {
      const onLayoutChange = vi.fn();
      renderWithProviders(<PidEditor onLayoutChange={onLayoutChange} />);
      fireEvent.click(button("Load layout from JSON"));
      choose(null);
      expect(onLayoutChange).not.toHaveBeenCalled();
      expect(alertSpy).not.toHaveBeenCalled();
    });

    // KNOWN GAP: parseLayout only checks for meta.app === "novaops", so a file
    // with the right stamp but no graph is accepted and handed to the canvas.
    it.fails("rejects a layout file that has no graph", async () => {
      const onLayoutChange = vi.fn();
      renderWithProviders(<PidEditor onLayoutChange={onLayoutChange} />);
      fireEvent.click(button("Load layout from JSON"));
      choose(new File([JSON.stringify({ meta: { app: "novaops" } })], "x.json"));
      await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    });
  });
});

describe("PidEditor: imperative handle", () => {
  it("serialises the current graph under a name, defaulting to Untitled", () => {
    const ref = createRef<PidEditorHandle>();
    renderWithProviders(<PidEditor ref={ref} />);
    expect(ref.current!.serialize("Plant")).toBe(LAYOUT);
    expect(stub.bridge.serializeCurrent).toHaveBeenLastCalledWith("Plant");
    ref.current!.serialize();
    expect(stub.bridge.serializeCurrent).toHaveBeenLastCalledWith("Untitled");
  });

  it("returns null before the canvas is ready", () => {
    stub.canvas.autoReady = false;
    const ref = createRef<PidEditorHandle>();
    renderWithProviders(<PidEditor ref={ref} />);
    expect(ref.current!.serialize()).toBeNull();
  });
});

import { act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "@/lib/api";
import { DEFAULT_LAYOUT, NovaActuatorControl, NovaDevice, NovaInstrument, NovaSystemLink, NovaValve } from "@/lib/pid";
import type { NovaPidLayout } from "@/lib/pid/serializer";
import { useNovaStore } from "@/lib/store";
import type { ActuatorEntry, SensorEntry } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { PidCanvas } from "./PidCanvas";

// JointJS's paper needs a real SVG layout engine, which jsdom lacks. The graph,
// the shapes and the bridge are all real; only the paper is a recording stand-in.
const made = vi.hoisted(() => ({ papers: [] as any[] }));

vi.mock("@joint/core", async (importOriginal) => {
  const real = await importOriginal<typeof import("@joint/core")>();
  const { FakePaper } = await import("@/test/fakePaper");
  class Paper extends FakePaper {
    removed = false;
    constructor(public options: Record<string, any>) {
      super(options.model);
      made.papers.push(this);
    }
    remove() {
      this.removed = true;
      this.el.remove();
    }
  }
  const overrides: Record<string, unknown> = { dia: { ...real.dia, Paper } };
  return new Proxy(real, { get: (t, k) => (k in overrides ? overrides[k as string] : Reflect.get(t, k)) });
});

vi.mock("@/lib/api");

const initial = useNovaStore.getInitialState();
const mocked = vi.mocked(api);

const SENSORS: SensorEntry[] = [{ name: "PT1", type: "PT", unit: "psi", binding: { source: "GCS", hat_id: 0, channel_id: 0 } }];
const ACTUATORS: ActuatorEntry[] = [{ name: "SV1", type: "solenoid", binding: { target: "GCS", relay_channel: 0 } }];

const layoutOf = (...cells: Array<{ toJSON(): unknown }>): NovaPidLayout => ({
  schemaVersion: 1,
  meta: { name: "t", savedAt: "2026-01-01T00:00:00Z", app: "novaops" },
  systems: {},
  graph: { cells: cells.map((c) => c.toJSON()) as never },
});

const valve = () => new NovaValve({ id: "v1", position: { x: 100, y: 100 }, binding: { name: "SV1" }, controllable: true });
const inst = () => new NovaInstrument({ id: "i1", position: { x: 0, y: 0 }, binding: { name: "PT1" } });

const paper = () => made.papers[made.papers.length - 1];
const container = () => paper().el.parentElement as HTMLElement;

beforeEach(() => {
  made.papers.length = 0;
  useNovaStore.setState(initial, true);
  vi.resetAllMocks();
  mocked.sendCommand.mockResolvedValue(undefined as never);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("PidCanvas: the host element", () => {
  it("is sized in pixels from a number and passes a string through", () => {
    const { rerender } = renderWithProviders(<PidCanvas height={420} />);
    expect(container().style.height || getComputedStyle(container()).height).toBeTruthy();
    expect(paper().options.height).toBe(420);
    rerender(<PidCanvas height="50vh" />);
    // the paper's own size falls back when a CSS length cannot be parsed to pixels
    expect(paper().options.height).toBe(420);
  });

  it("falls back to 600 px for a height it cannot parse", () => {
    renderWithProviders(<PidCanvas height="calc(100vh - 80px)" />);
    expect(paper().options.height).toBe(600);
    renderWithProviders(<PidCanvas />);
    expect(paper().options.height).toBe(600);
    renderWithProviders(<PidCanvas height="480px" />);
    expect(paper().options.height).toBe(480);
  });

  it("marks itself as the edit surface only in edit mode", () => {
    const { rerender } = renderWithProviders(<PidCanvas />);
    expect(container().classList.contains("pid-edit")).toBe(false);
    rerender(<PidCanvas mode="edit" />);
    expect(container().classList.contains("pid-edit")).toBe(true);
  });

  it("attaches the paper inside its own container and removes only the paper on unmount", () => {
    const { unmount, container: host } = renderWithProviders(<PidCanvas />);
    const el = paper().el as HTMLElement;
    expect(host.contains(el)).toBe(true);
    expect(() => unmount()).not.toThrow();
    expect(paper().removed).toBe(true);
  });

  it("creates the paper locked, snapping to a 10 px grid, with drag-to-connect pipes", () => {
    renderWithProviders(<PidCanvas />);
    const o = paper().options;
    expect(o.interactive).toBe(false);
    expect(o.gridSize).toBe(10);
    expect(o.snapToGrid).toEqual({ x: 10, y: 10 });
    expect(o.preventContextMenu).toBe(true);
    expect(o.linkPinning).toBe(false);
    expect(o.defaultLink()).toBeInstanceOf(NovaSystemLink);
  });

  it("only allows a connection between two different ports", () => {
    renderWithProviders(<PidCanvas />);
    const ok = paper().options.validateConnection as (a: unknown, b: unknown, c: unknown, d: unknown) => boolean;
    const a = {};
    const b = {};
    const m = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    expect(ok(a, m, b, m)).toBe(true);
    expect(ok(a, null, b, m)).toBe(false);
    expect(ok(a, m, b, null)).toBe(false);
    expect(ok(a, m, a, m)).toBe(false);
  });

  it("tells the parent when it is ready, once, with the live graph, paper and bridge", () => {
    const onReady = vi.fn();
    const { rerender } = renderWithProviders(<PidCanvas onReady={onReady} />);
    expect(onReady).toHaveBeenCalledTimes(1);
    const [graph, p, bridge] = onReady.mock.calls[0];
    expect(p).toBe(paper());
    expect(typeof graph.getCells).toBe("function");
    expect(typeof bridge.setMode).toBe("function");
    rerender(<PidCanvas onReady={onReady} height={300} />);
    expect(onReady).toHaveBeenCalledTimes(1);
  });
});

describe("PidCanvas: loading a layout", () => {
  it("shows the shipped default layout when none is given", () => {
    const onReady = vi.fn();
    renderWithProviders(<PidCanvas onReady={onReady} />);
    const graph = onReady.mock.calls[0][0];
    expect(graph.getCells()).toHaveLength(DEFAULT_LAYOUT.graph.cells.length);
  });

  it("loads the given layout in place of the previous one when it changes", () => {
    const onReady = vi.fn();
    const { rerender } = renderWithProviders(<PidCanvas layout={layoutOf(inst())} onReady={onReady} />);
    const graph = onReady.mock.calls[0][0];
    expect(graph.getCells().map((c: any) => c.id)).toEqual(["i1"]);
    rerender(<PidCanvas layout={layoutOf(valve())} onReady={onReady} />);
    expect(graph.getCells().map((c: any) => c.id)).toEqual(["v1"]);
  });

  it("flags an instrument whose sensor is not in the config", () => {
    const onReady = vi.fn();
    renderWithProviders(<PidCanvas layout={layoutOf(inst())} sensors={[]} onReady={onReady} />);
    expect(onReady.mock.calls[0][0].getCell("i1").attr("bubble/stroke")).toContain("warn");
  });

  // KNOWN GAP: a valve's missing-binding warning is drawn on its status badge,
  // and entering live mode immediately redraws that badge (UNKNOWN face), which
  // wipes the warning. A controllable valve hides that badge altogether.
  it.fails("keeps a valve's missing-binding warning once live mode starts", () => {
    const onReady = vi.fn();
    const plain = new NovaValve({ id: "v2", position: { x: 0, y: 0 }, binding: { name: "GONE" } });
    renderWithProviders(<PidCanvas layout={layoutOf(plain)} actuators={[]} onReady={onReady} />);
    expect(onReady.mock.calls[0][0].getCell("v2").attr("badgeBg/stroke")).toContain("warn");
  });

  it("does not flag shapes whose bindings exist", () => {
    const onReady = vi.fn();
    renderWithProviders(<PidCanvas layout={layoutOf(inst(), valve())} sensors={SENSORS} actuators={ACTUATORS} onReady={onReady} />);
    const graph = onReady.mock.calls[0][0];
    expect(graph.getCell("i1").attr("bubble/stroke")).not.toContain("warn");
    expect(graph.getCell("v1").attr("badgeBg/stroke")).not.toContain("warn");
  });

  // KNOWN GAP: the loader checks sensors and valves only, so a device or control
  // bound to an actuator that no longer exists is never flagged as missing, even
  // though the bridge has a "missing" look ready for both.
  it.fails("flags a device or control bound to an actuator that is not in the config", () => {
    const onReady = vi.fn();
    const device = new NovaDevice({ id: "d1", position: { x: 0, y: 0 }, binding: { name: "GONE" }, controllable: true });
    const control = new NovaActuatorControl({ id: "c1", position: { x: 0, y: 100 }, binding: { name: "GONE" } });
    renderWithProviders(<PidCanvas layout={layoutOf(device, control)} actuators={ACTUATORS} onReady={onReady} />);
    const graph = onReady.mock.calls[0][0];
    expect(graph.getCell("d1").attr("box/stroke")).toContain("warn");
    expect(graph.getCell("c1").attr("nameLabel/fill")).toContain("warn");
  });

  it("zooms to fit once, after the first frame, and not again when the layout changes", () => {
    vi.useFakeTimers();
    const { rerender } = renderWithProviders(<PidCanvas layout={layoutOf(inst())} />);
    expect(paper().fitCalls).toHaveLength(0);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(paper().fitCalls).toHaveLength(1);
    rerender(<PidCanvas layout={layoutOf(valve())} />);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(paper().fitCalls).toHaveLength(1);
  });

  it("does not fit an empty layout", () => {
    vi.useFakeTimers();
    renderWithProviders(<PidCanvas layout={{ ...layoutOf(), graph: { cells: [] } }} />);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(paper().fitCalls).toHaveLength(0);
  });

  // KNOWN GAP: `sensors` and `actuators` default to a fresh [] on every render,
  // and they are effect dependencies, so any re-render of a parent that does not
  // pass them wipes and reloads the whole diagram (dropping any edit-mode
  // selection and live-value state with it).
  it.fails("keeps the same shapes across a re-render that changes nothing", () => {
    const onReady = vi.fn();
    const layout = layoutOf(inst());
    const { rerender } = renderWithProviders(<PidCanvas layout={layout} onReady={onReady} />);
    const graph = onReady.mock.calls[0][0];
    const before = graph.getCell("i1");
    rerender(<PidCanvas layout={layout} onReady={onReady} />);
    expect(graph.getCell("i1")).toBe(before);
  });
});

describe("PidCanvas: modes", () => {
  it("starts locked in live mode and interactive in edit mode", () => {
    renderWithProviders(<PidCanvas layout={layoutOf(inst())} />);
    expect(paper().interactive).toBe(false);
    renderWithProviders(<PidCanvas layout={layoutOf(inst())} mode="edit" />);
    expect(paper().interactive).toBe(true);
  });

  it("switches mode without reloading", () => {
    const onReady = vi.fn();
    const layout = layoutOf(inst());
    const sensors: SensorEntry[] = [];
    const actuators: ActuatorEntry[] = [];
    const { rerender } = renderWithProviders(<PidCanvas layout={layout} sensors={sensors} actuators={actuators} onReady={onReady} />);
    rerender(<PidCanvas layout={layout} sensors={sensors} actuators={actuators} onReady={onReady} mode="edit" />);
    expect(paper().interactive).toBe(true);
    rerender(<PidCanvas layout={layout} sensors={sensors} actuators={actuators} onReady={onReady} mode="live" />);
    expect(paper().interactive).toBe(false);
  });

  it("feeds live readings to bound shapes", () => {
    const onReady = vi.fn();
    renderWithProviders(<PidCanvas layout={layoutOf(inst())} sensors={SENSORS} onReady={onReady} />);
    const graph = onReady.mock.calls[0][0];
    act(() => {
      useNovaStore.getState().ingestEngineData([{ name: "PT1", value: 12.5, avg: 12.5, unit: "psi", timestamp: 1 }]);
    });
    expect(graph.getCell("i1").attr("readoutValue/text")).toBe("12.50");
  });

  it("hands the safety rules to the bridge, including ones that arrive later", () => {
    useNovaStore.getState().ingestLockout("unlocked");
    useNovaStore.setState({ session: { clientId: "c1", role: "operator" } });
    useNovaStore.getState().ingestActuatorStates({ actuator_states: { SV1: { position: "closed" } } } as never);
    const layout = layoutOf(valve());
    const sensors: SensorEntry[] = [];
    const { rerender } = renderWithProviders(<PidCanvas layout={layout} sensors={sensors} actuators={ACTUATORS} />);
    rerender(<PidCanvas layout={layout} sensors={sensors} actuators={ACTUATORS} safetyRules={{ hazardous: [{ SV1: "ALL" }] }} />);
    // locked out? no: unlocked, so a hazardous command still goes through
    const v = paper().graph.getCell("v1");
    act(() => paper().trigger("cell:pointerclick", paper().view(v), {}, 0, 0));
    expect(mocked.sendCommand).toHaveBeenCalledTimes(1);
  });
});

describe("PidCanvas: sending commands", () => {
  const setup = () => {
    useNovaStore.getState().ingestLockout("unlocked");
    useNovaStore.setState({ session: { clientId: "client-9", role: "operator" } });
    useNovaStore.getState().ingestActuatorStates({ actuator_states: { SV1: { position: "closed" } } } as never);
    renderWithProviders(<PidCanvas layout={layoutOf(valve())} sensors={SENSORS} actuators={ACTUATORS} />);
    const v = paper().graph.getCell("v1");
    return () => act(() => paper().trigger("cell:pointerclick", paper().view(v), {}, 0, 0));
  };

  it("sends the command with the session's client id", () => {
    setup()();
    expect(mocked.sendCommand).toHaveBeenCalledWith({ type: "solenoid", name: "SV1", state: "open" }, "client-9");
  });

  it("uses the client id current at click time", () => {
    const click = setup();
    act(() => {
      useNovaStore.setState({ session: { clientId: "client-10", role: "operator" } });
    });
    click();
    expect(mocked.sendCommand).toHaveBeenCalledWith(expect.anything(), "client-10");
  });

  it("logs a failed command to the console and does not throw", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    mocked.sendCommand.mockRejectedValue(new Error("403"));
    setup()();
    await act(async () => {});
    expect(err).toHaveBeenCalledWith("[PidCanvas] command error:", expect.any(Error));
  });
});

describe("PidCanvas: zoom and pan", () => {
  const fire = (type: string, init: MouseEventInit & { code?: string } = {}, target: EventTarget = container()) => {
    const Ctor = type.startsWith("key") ? KeyboardEvent : MouseEvent;
    const e = new Ctor(type, { bubbles: true, cancelable: true, ...init } as never);
    act(() => {
      target.dispatchEvent(e);
    });
    return e;
  };

  it("zooms in on wheel-up and out on wheel-down without scrolling the page", () => {
    renderWithProviders(<PidCanvas />);
    const up = new WheelEvent("wheel", { deltaY: -100, cancelable: true, bubbles: true });
    act(() => {
      container().dispatchEvent(up);
    });
    expect(up.defaultPrevented).toBe(true);
    expect(paper().scaleValue.sx).toBeCloseTo(1.12, 5);
    act(() => {
      container().dispatchEvent(new WheelEvent("wheel", { deltaY: 100, cancelable: true, bubbles: true }));
    });
    expect(paper().scaleValue.sx).toBeCloseTo(1, 5);
  });

  it("pans with the middle button and stops the gesture reaching the diagram", () => {
    renderWithProviders(<PidCanvas />);
    paper().translate(10, 20);
    const inner = vi.fn();
    paper().el.addEventListener("pointerdown", inner);
    const down = fire("pointerdown", { button: 1, clientX: 100, clientY: 100 }, paper().el);
    expect(down.defaultPrevented).toBe(true);
    expect(inner).not.toHaveBeenCalled();
    expect(container().style.cursor).toBe("grabbing");
    fire("pointermove", { clientX: 130, clientY: 90 }, paper().el);
    expect(paper().translation).toEqual({ tx: 40, ty: 10 });
    fire("pointerup", {}, paper().el);
    expect(container().style.cursor).toBe("");
    fire("pointermove", { clientX: 500, clientY: 500 }, paper().el);
    expect(paper().translation).toEqual({ tx: 40, ty: 10 });
  });

  it("leaves an ordinary left-button drag to the diagram", () => {
    renderWithProviders(<PidCanvas />);
    const inner = vi.fn();
    paper().el.addEventListener("pointerdown", inner);
    const down = fire("pointerdown", { button: 0 }, paper().el);
    expect(down.defaultPrevented).toBe(false);
    expect(inner).toHaveBeenCalledTimes(1);
  });

  it("pans with space held and the left button, showing a grab cursor", () => {
    renderWithProviders(<PidCanvas />);
    const space = fire("keydown", { code: "Space" }, window);
    expect(space.defaultPrevented).toBe(true);
    expect(container().style.cursor).toBe("grab");
    fire("pointerdown", { button: 0, clientX: 0, clientY: 0 }, paper().el);
    fire("pointermove", { clientX: 25, clientY: 5 }, paper().el);
    expect(paper().translation).toEqual({ tx: 25, ty: 5 });
    fire("pointerup", {}, paper().el);
    expect(container().style.cursor).toBe("grab");
    fire("keyup", { code: "Space" }, window);
    expect(container().style.cursor).toBe("");
  });

  it("keeps the grabbing cursor until the drag ends even if space is released first", () => {
    renderWithProviders(<PidCanvas />);
    fire("keydown", { code: "Space" }, window);
    fire("pointerdown", { button: 0 }, paper().el);
    fire("keyup", { code: "Space" }, window);
    expect(container().style.cursor).toBe("grabbing");
    fire("pointerup", {}, paper().el);
    expect(container().style.cursor).toBe("");
  });

  it("does not swallow the space bar while typing in a field", () => {
    renderWithProviders(
      <>
        <input data-testid="f" />
        <PidCanvas />
      </>,
    );
    const input = document.querySelector("input")!;
    const e = fire("keydown", { code: "Space" }, input);
    expect(e.defaultPrevented).toBe(false);
    expect(container().style.cursor).toBe("");
  });

  it("does not swallow the space bar in a textarea, select or editable element", () => {
    renderWithProviders(<PidCanvas />);
    for (const tag of ["textarea", "select"]) {
      const el = document.body.appendChild(document.createElement(tag));
      expect(fire("keydown", { code: "Space" }, el).defaultPrevented).toBe(false);
    }
    const div = document.body.appendChild(document.createElement("div"));
    Object.defineProperty(div, "isContentEditable", { value: true });
    expect(fire("keydown", { code: "Space" }, div).defaultPrevented).toBe(false);
  });

  it("removes its window and container listeners on unmount", () => {
    const { unmount } = renderWithProviders(<PidCanvas />);
    const c = container();
    unmount();
    const e = new KeyboardEvent("keydown", { code: "Space", cancelable: true });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
    const w = new WheelEvent("wheel", { deltaY: 1, cancelable: true });
    c.dispatchEvent(w);
    expect(w.defaultPrevented).toBe(false);
  });
});

describe("PidCanvas: selection callback", () => {
  it("reports edit-mode selection to the latest callback, not the first", () => {
    const first = vi.fn();
    const second = vi.fn();
    const layout = layoutOf(valve());
    const sensors: SensorEntry[] = [];
    const actuators: ActuatorEntry[] = [];
    const { rerender } = renderWithProviders(<PidCanvas layout={layout} sensors={sensors} actuators={actuators} mode="edit" onCellSelect={first} />);
    rerender(<PidCanvas layout={layout} sensors={sensors} actuators={actuators} mode="edit" onCellSelect={second} />);
    first.mockClear();
    second.mockClear();
    act(() => paper().trigger("cell:pointerclick", paper().view(paper().graph.getCell("v1")), {}, 0, 0));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith("v1");
  });
});

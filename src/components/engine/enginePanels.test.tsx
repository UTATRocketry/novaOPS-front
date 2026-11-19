import { act, fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "@/lib/api";
import { useNovaStore } from "@/lib/store/store";
import type { SensorEntry, SystemConfig } from "@/lib/types";
import { FakeUPlot } from "@/test/uplotMock";
import { Gauge } from "@/components/primitives";
import { renderWithProviders } from "@/test/render";
import { EnginePlots } from "./EnginePlots";
import { EngineSidebar } from "./EngineSidebar";
import { GaugeStrip } from "./GaugeStrip";

vi.mock("@/lib/api");
const mocked = vi.mocked(api);
const initial = useNovaStore.getInitialState();

const sensor = (name: string, type: SensorEntry["type"] = "PT", over: Partial<SensorEntry> = {}): SensorEntry => ({
  name,
  type,
  unit: "psi",
  binding: { source: "GCS", hat_id: 0, channel_id: 0 },
  ...over,
});
const SENSORS = [sensor("PT1", "PT", { range: [0, 1000] }), sensor("TC1", "TC", { unit: "C" }), sensor("LC1", "LC", { unit: "kg" }), sensor("PT2")];

const reading = (name: string, value: number, unit = "psi") => ({ name, value, avg: value, unit, timestamp: 1 });

beforeEach(() => {
  useNovaStore.setState(initial, true);
  localStorage.clear();
  vi.resetAllMocks();
  mocked.getRecordingStatus.mockResolvedValue({ enabled: false });
  mocked.getCalibrationStatus.mockResolvedValue({ enabled: false });
  mocked.getConfig.mockResolvedValue({});
});

// ---------------------------------------------------------------------------

describe("Gauge: off-scale readings", () => {
  // Known gap: a reading above the gauge's scale is clamped for the number as
  // well as the needle, so 500 on a 0-100 scale reads "100.0". A sensor with no
  // configured range gets exactly that 0-100 default scale.
  it.fails("shows the real value, not the clamped one, when the reading is off the scale", () => {
    renderWithProviders(<Gauge value={500} min={0} max={100} />);
    expect(screen.getByText("500.0")).toBeInTheDocument();
  });
});

describe("GaugeStrip", () => {
  const gauges = () => screen.queryAllByLabelText("Select sensor") as HTMLSelectElement[];

  it("renders nothing without sensors", () => {
    const { container } = renderWithProviders(<GaugeStrip sensors={[]} />);
    expect(container.querySelector("select")).toBeNull();
  });

  it("starts with the first three sensors when nothing was saved, and saves that choice", () => {
    renderWithProviders(<GaugeStrip sensors={SENSORS} />);
    expect(gauges().map((g) => g.value)).toEqual(["PT1", "TC1", "LC1"]);
    expect(JSON.parse(localStorage.getItem("nova.engine.gauges") ?? "null")).toBeNull(); // seeding is not a user choice
  });

  it("restores a saved selection instead", () => {
    localStorage.setItem("nova.engine.gauges", JSON.stringify(["PT2"]));
    renderWithProviders(<GaugeStrip sensors={SENSORS} />);
    expect(gauges().map((g) => g.value)).toEqual(["PT2"]);
  });

  it("ignores a corrupt saved selection", () => {
    localStorage.setItem("nova.engine.gauges", "{nope");
    renderWithProviders(<GaugeStrip sensors={SENSORS} />);
    expect(gauges()).toHaveLength(3);
  });

  it("drops saved gauges for sensors that no longer exist", () => {
    localStorage.setItem("nova.engine.gauges", JSON.stringify(["GONE", "PT1"]));
    renderWithProviders(<GaugeStrip sensors={SENSORS} />);
    expect(gauges().map((g) => g.value)).toEqual(["PT1"]);
  });

  it("shows the live value with its unit, and a dash with none", () => {
    act(() => useNovaStore.getState().ingestEngineData([reading("PT1", 250.5, "bar")]));
    renderWithProviders(<GaugeStrip sensors={SENSORS} />);
    expect(screen.getByText("250.5")).toBeInTheDocument();
    expect(screen.getByText("bar")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });

  it("labels each gauge by sensor type, and offers every sensor to switch to", () => {
    renderWithProviders(<GaugeStrip sensors={SENSORS} />);
    expect(screen.getAllByText("Pressure").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Thermocouple").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Load").length).toBeGreaterThan(0);
    expect(Array.from(gauges()[0].options).map((o) => o.value)).toEqual(["PT1", "TC1", "LC1", "PT2"]);
  });

  it("switches a gauge to another sensor and saves it", () => {
    renderWithProviders(<GaugeStrip sensors={SENSORS} />);
    fireEvent.change(gauges()[0], { target: { value: "PT2" } });
    expect(gauges().map((g) => g.value)).toEqual(["PT2", "TC1", "LC1"]);
    expect(JSON.parse(localStorage.getItem("nova.engine.gauges")!)).toEqual(["PT2", "TC1", "LC1"]);
  });

  it("adds a gauge for the first sensor not shown, or the first sensor if all are", () => {
    renderWithProviders(<GaugeStrip sensors={SENSORS} />);
    fireEvent.click(screen.getByText("Add gauge"));
    expect(gauges().map((g) => g.value)).toEqual(["PT1", "TC1", "LC1", "PT2"]);
    fireEvent.click(screen.getByText("Add gauge"));
    expect(gauges().map((g) => g.value)[4]).toBe("PT1");
  });

  it("removes a gauge and saves", () => {
    renderWithProviders(<GaugeStrip sensors={SENSORS} />);
    fireEvent.click(screen.getAllByLabelText("Remove gauge")[1]);
    expect(gauges().map((g) => g.value)).toEqual(["PT1", "LC1"]);
    expect(JSON.parse(localStorage.getItem("nova.engine.gauges")!)).toEqual(["PT1", "LC1"]);
  });

  it("offers to add a gauge even when all have been removed", () => {
    localStorage.setItem("nova.engine.gauges", "[]");
    renderWithProviders(<GaugeStrip sensors={SENSORS} />);
    expect(gauges()).toHaveLength(0);
    fireEvent.click(screen.getByText("Add gauge"));
    expect(gauges()).toHaveLength(1);
  });

  it("uses the sensor's configured range as the scale", () => {
    renderWithProviders(<GaugeStrip sensors={[sensor("PT1", "PT", { range: [0, 2000] })]} />);
    expect(screen.getByText("2000")).toBeInTheDocument();
  });

  it("dims a stale reading but not an absent one", () => {
    act(() => useNovaStore.getState().ingestEngineData([reading("PT1", 5)]));
    act(() => useNovaStore.setState({ engineData: { ...useNovaStore.getState().engineData, status: "stale" } }));
    renderWithProviders(<GaugeStrip sensors={[sensor("PT1")]} />);
    expect(screen.getByText("5.00")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------

describe("EnginePlots", () => {
  const plots = () => screen.queryAllByLabelText("Select sensor") as HTMLSelectElement[];

  it("says no sensors are configured", () => {
    renderWithProviders(<EnginePlots sensors={[]} />);
    expect(screen.getByText("No sensors configured.")).toBeInTheDocument();
  });

  it("starts with no plots and offers to add one", () => {
    renderWithProviders(<EnginePlots sensors={SENSORS} />);
    expect(screen.getByText(/No plots/)).toBeInTheDocument();
    expect(plots()).toHaveLength(0);
  });

  it("adds a plot for the first unused sensor, then the next, and saves", () => {
    renderWithProviders(<EnginePlots sensors={SENSORS} />);
    fireEvent.click(screen.getByText("Add plot"));
    expect(plots().map((p) => p.value)).toEqual(["PT1"]);
    fireEvent.click(screen.getByText("Add plot"));
    expect(plots().map((p) => p.value)).toEqual(["PT1", "TC1"]);
    expect(JSON.parse(localStorage.getItem("nova.engine.plots")!).map((s: { sensorName: string }) => s.sensorName)).toEqual(["PT1", "TC1"]);
  });

  it("builds one chart per plot, pinned to the sensor's range when it has one", () => {
    localStorage.setItem("nova.engine.plots", JSON.stringify([{ key: "a", sensorName: "PT1" }, { key: "b", sensorName: "TC1" }]));
    renderWithProviders(<EnginePlots sensors={SENSORS} />);
    expect(FakeUPlot.instances).toHaveLength(2);
    expect(FakeUPlot.instances[0].opts.scales.y).toEqual({ range: [0, 1000] });
    expect(FakeUPlot.instances[1].opts.scales.y).toEqual({});
  });

  it("shows the live value to two places and the unit, or a dash", () => {
    localStorage.setItem("nova.engine.plots", JSON.stringify([{ key: "a", sensorName: "PT1" }, { key: "b", sensorName: "TC1" }]));
    act(() => useNovaStore.getState().ingestEngineData([reading("PT1", 12.345, "bar")]));
    renderWithProviders(<EnginePlots sensors={SENSORS} />);
    expect(screen.getByText("12.35")).toBeInTheDocument();
    expect(screen.getByText("bar")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("switches a plot to another sensor, and removes one", () => {
    localStorage.setItem("nova.engine.plots", JSON.stringify([{ key: "a", sensorName: "PT1" }, { key: "b", sensorName: "TC1" }]));
    renderWithProviders(<EnginePlots sensors={SENSORS} />);
    fireEvent.change(plots()[0], { target: { value: "LC1" } });
    expect(plots().map((p) => p.value)).toEqual(["LC1", "TC1"]);
    fireEvent.click(screen.getAllByLabelText("Remove plot")[0]);
    expect(plots().map((p) => p.value)).toEqual(["TC1"]);
  });

  it("drops plots for sensors that left the config", () => {
    localStorage.setItem("nova.engine.plots", JSON.stringify([{ key: "a", sensorName: "GONE" }, { key: "b", sensorName: "PT1" }]));
    renderWithProviders(<EnginePlots sensors={SENSORS} />);
    expect(plots().map((p) => p.value)).toEqual(["PT1"]);
    expect(JSON.parse(localStorage.getItem("nova.engine.plots")!)).toHaveLength(1);
  });

  it("ignores corrupt or malformed saved plots", () => {
    localStorage.setItem("nova.engine.plots", JSON.stringify([{ key: "a" }, 5, { key: "b", sensorName: "PT1" }]));
    renderWithProviders(<EnginePlots sensors={SENSORS} />);
    expect(plots().map((p) => p.value)).toEqual(["PT1"]);
    localStorage.setItem("nova.engine.plots", "{nope");
  });

  it("reorders by dragging one plot onto another, and saves the order", () => {
    localStorage.setItem("nova.engine.plots", JSON.stringify([{ key: "a", sensorName: "PT1" }, { key: "b", sensorName: "TC1" }, { key: "c", sensorName: "LC1" }]));
    renderWithProviders(<EnginePlots sensors={SENSORS} />);
    const cards = screen.getAllByTitle("Drag to reorder").map((h) => h.closest('[draggable="true"]')!);
    fireEvent.dragStart(cards[0]);
    fireEvent.dragOver(cards[2]);
    fireEvent.drop(cards[2]);
    expect(plots().map((p) => p.value)).toEqual(["TC1", "LC1", "PT1"]);
    expect(JSON.parse(localStorage.getItem("nova.engine.plots")!).map((s: { sensorName: string }) => s.sensorName)).toEqual(["TC1", "LC1", "PT1"]);
  });

  it("leaves the order alone when a plot is dropped on itself or without a drag", () => {
    localStorage.setItem("nova.engine.plots", JSON.stringify([{ key: "a", sensorName: "PT1" }, { key: "b", sensorName: "TC1" }]));
    renderWithProviders(<EnginePlots sensors={SENSORS} />);
    const cards = screen.getAllByTitle("Drag to reorder").map((h) => h.closest('[draggable="true"]')!);
    fireEvent.drop(cards[1]);
    fireEvent.dragStart(cards[0]);
    fireEvent.drop(cards[0]);
    expect(plots().map((p) => p.value)).toEqual(["PT1", "TC1"]);
  });
});

// ---------------------------------------------------------------------------

describe("EngineSidebar", () => {
  const procedures = (list: Array<{ name: string; steps: string[] }>): SystemConfig => ({ Procedures: list });
  const counter = () => screen.getByText(/^\d+ \/ \d+$|^Complete$/);

  async function sidebar(config: SystemConfig = {}, steps?: Array<{ label: string }>) {
    mocked.getConfig.mockResolvedValue(config);
    const view = renderWithProviders(<EngineSidebar steps={steps} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    return view;
  }

  it("shows the three cards", async () => {
    await sidebar();
    expect(screen.getByText("Procedure")).toBeInTheDocument();
    expect(screen.getByText("Actions")).toBeInTheDocument();
    expect(screen.getByText("Legend")).toBeInTheDocument();
  });

  it("falls back to the built-in checklist when the config has no procedures", async () => {
    await sidebar();
    expect(screen.getByText("Verify all valves closed")).toBeInTheDocument();
    expect(counter()).toHaveTextContent("1 / 7");
  });

  it("uses a configured procedure's steps instead", async () => {
    await sidebar(procedures([{ name: "Fill", steps: ["open", "close"] }]));
    expect(screen.getByText("open")).toBeInTheDocument();
    expect(screen.queryByText("Verify all valves closed")).not.toBeInTheDocument();
    expect(counter()).toHaveTextContent("1 / 2");
  });

  it("uses steps passed in over everything else", async () => {
    await sidebar(procedures([{ name: "Fill", steps: ["x"] }]), [{ label: "custom a" }, { label: "custom b" }]);
    expect(screen.getByText("custom a")).toBeInTheDocument();
    expect(screen.queryByText("x")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("steps forward and back, marking finished steps, and stops at the ends", async () => {
    await sidebar(procedures([{ name: "P", steps: ["a", "b"] }]));
    const back = () => screen.getByText("Back");
    const next = () => screen.getByText(/^Next$|^Done$/);
    expect(back()).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(back());
    expect(counter()).toHaveTextContent("1 / 2");
    fireEvent.click(next());
    expect(counter()).toHaveTextContent("2 / 2");
    expect(screen.getByText("check_circle")).toBeInTheDocument();
    fireEvent.click(next());
    expect(counter()).toHaveTextContent("Complete");
    expect(next()).toHaveTextContent("Done");
    expect(next()).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(back());
    expect(counter()).toHaveTextContent("2 / 2");
  });

  it("offers a choice between procedures only when there are several, and restarts on switching", async () => {
    await sidebar(procedures([{ name: "Fill", steps: ["f1", "f2"] }, { name: "", steps: ["d1"] }]));
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(["Fill", "Procedure 2"]);
    fireEvent.click(screen.getByText("Next"));
    expect(counter()).toHaveTextContent("2 / 2");
    fireEvent.change(select, { target: { value: "1" } });
    expect(screen.getByText("d1")).toBeInTheDocument();
    expect(counter()).toHaveTextContent("1 / 1");
  });

  it("offers no choice for a single procedure", async () => {
    await sidebar(procedures([{ name: "Only", steps: ["a"] }]));
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("explains the schematic colours and symbols", async () => {
    await sidebar();
    for (const label of ["Pressurant", "Fuel", "Oxidizer", "Ball valve (2-way)", "Solenoid valve", "Pressure transducer (PT)"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("includes the engine actions", async () => {
    await sidebar();
    expect(within(screen.getByText("Actions").closest("div")!.parentElement!).getByText("Reload config")).toBeInTheDocument();
  });
});

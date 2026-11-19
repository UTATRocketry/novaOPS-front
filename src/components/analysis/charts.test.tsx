import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ActuationEvent, Channel, Dataset } from "@/lib/analysis";
import { FakeUPlot } from "@/test/uplotMock";
import { renderWithProviders } from "@/test/render";
import { AnalysisChart } from "./AnalysisChart";
import { ChartGrid } from "./ChartGrid";
import { EventsCard } from "./EventsCard";
import { buildColorMap } from "./palette";

const f64 = (...v: number[]) => Float64Array.of(...v);

const event = (id: string, over: Partial<ActuationEvent> = {}): ActuationEvent => ({
  id,
  epochMs: 0,
  elapsed: 1,
  kind: "relay",
  channel: "relay_0",
  actuator: "Fill",
  actuatorType: "solenoid",
  state: "on · open",
  previousState: "off · closed",
  value: 1,
  previousValue: 0,
  typeId: "relay",
  outsideCapture: false,
  ...over,
});

const channel = (id: string, unit: string, values: Float64Array): Channel => ({
  id,
  name: id,
  unit,
  type: "PT",
  origin: "calibrated",
  binding: { source: "GCS", colKey: "x" },
  values,
  applied: [],
  sampleRateHz: 10,
});

// ---------------------------------------------------------------------------

describe("buildColorMap", () => {
  it("gives every channel a plot token by its position, cycling after ten", () => {
    const channels = Array.from({ length: 12 }, (_, i) => channel(`c${i}`, "psi", f64()));
    const map = buildColorMap(channels);
    expect(map.get("c0")).toBe("plot.1");
    expect(map.get("c9")).toBe("plot.10");
    expect(map.get("c10")).toBe("plot.1");
    expect(map.size).toBe(12);
  });

  it("is independent of which channels are selected, so a trace keeps its colour", () => {
    const all = [channel("a", "psi", f64()), channel("b", "psi", f64())];
    expect(buildColorMap(all).get("b")).toBe("plot.2");
    expect(buildColorMap(all).get("b")).toBe(buildColorMap(all).get("b"));
  });
});

// ---------------------------------------------------------------------------

describe("EventsCard", () => {
  function card(events: ActuationEvent[], over: Partial<React.ComponentProps<typeof EventsCard>> = {}) {
    const props = {
      events,
      window: null,
      onSeek: vi.fn(),
      showMarkers: true,
      onToggleMarkers: vi.fn(),
      unplaceable: false,
      ...over,
    };
    renderWithProviders(<EventsCard {...props} />);
    return props;
  }

  it("explains that events cannot be placed when the clocks cannot be related", () => {
    card([], { unplaceable: true });
    expect(screen.getByText(/Cannot place events on this timeline/)).toBeInTheDocument();
    expect(screen.queryByText("markers")).not.toBeInTheDocument();
  });

  it("invites an actuator log to be loaded when there are no events", () => {
    card([]);
    expect(screen.getByText(/No actuator log loaded/)).toBeInTheDocument();
  });

  it("lists each event with its time, actuator, channel, change and kind", () => {
    card([event("e1", { elapsed: 1.23456 })]);
    expect(screen.getByText("1.235s")).toBeInTheDocument();
    expect(screen.getByText("Fill")).toBeInTheDocument();
    expect(screen.getByText("relay_0")).toBeInTheDocument();
    expect(screen.getByText("off · closed")).toBeInTheDocument();
    expect(screen.getByText("on · open")).toBeInTheDocument();
    expect(screen.getByText("relay")).toBeInTheDocument();
  });

  it("names a log marker 'log', with no before-state arrow, and a dash for an unmapped channel", () => {
    card([
      event("m", { kind: "recording", actuator: null, channel: "—", state: "start_data_saving", previousState: null }),
      event("u", { actuator: null, previousState: null }),
    ]);
    expect(screen.getByText("log")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });

  it("hides events outside the capture, and counts them", () => {
    card([event("in"), event("out1", { outsideCapture: true, actuator: "Hidden1" }), event("out2", { outsideCapture: true, actuator: "Hidden2" })]);
    expect(screen.queryByText("Hidden1")).not.toBeInTheDocument();
    expect(screen.getByText(/2 events fall outside the loaded capture/)).toBeInTheDocument();
  });

  it("uses the singular for one outside event", () => {
    card([event("in"), event("out", { outsideCapture: true })]);
    expect(screen.getByText(/1 event fall outside/)).toBeInTheDocument();
  });

  it("zooms to two seconds either side of a clicked event", () => {
    const { onSeek } = card([event("e1", { elapsed: 10 })]);
    fireEvent.click(screen.getByText("Fill"));
    expect(onSeek).toHaveBeenCalledWith({ start: 8, end: 12 });
  });

  it("toggles the chart markers", () => {
    const { onToggleMarkers } = card([event("e1")], { showMarkers: true });
    fireEvent.click(screen.getByText("markers"));
    expect(onToggleMarkers).toHaveBeenCalledWith(false);
  });

  it("can restrict the list to the zoom window, but only when there is one", () => {
    card([event("a", { elapsed: 1, actuator: "A" }), event("b", { elapsed: 50, actuator: "B" })]);
    expect(screen.getByText("in window").closest("button")).toHaveAttribute("aria-disabled", "true");
  });

  it("filters to the window when asked", () => {
    card([event("a", { elapsed: 1, actuator: "A" }), event("b", { elapsed: 50, actuator: "B" })], { window: { start: 0, end: 10 } });
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
    fireEvent.click(screen.getByText("in window"));
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.queryByText("B")).not.toBeInTheDocument();
  });

  it("offers to hide events no configured actuator claims, only when there are some, and shows how many", () => {
    const view = renderWithProviders(<EventsCard events={[event("a")]} window={null} onSeek={() => {}} showMarkers onToggleMarkers={() => {}} unplaceable={false} />);
    expect(screen.queryByText("hide unmapped")).not.toBeInTheDocument();
    view.unmount();
    card([event("a"), event("u", { actuator: null, channel: "relay_9" })]);
    expect(screen.getByTitle("1 channel change(s) no configured actuator claims")).toBeInTheDocument();
    fireEvent.click(screen.getByText("hide unmapped"));
    expect(screen.queryByText("relay_9")).not.toBeInTheDocument();
    expect(screen.getByText("Fill")).toBeInTheDocument();
  });

  it("keeps log markers when hiding unmapped events", () => {
    card([event("m", { kind: "recording", actuator: null, state: "stop_data_saving", previousState: null }), event("u", { actuator: null, channel: "relay_9" })]);
    fireEvent.click(screen.getByText("hide unmapped"));
    expect(screen.getByText("stop_data_saving")).toBeInTheDocument();
    expect(screen.queryByText("relay_9")).not.toBeInTheDocument();
  });

  it("says when the filters leave nothing", () => {
    card([event("u", { actuator: null })]);
    fireEvent.click(screen.getByText("hide unmapped"));
    expect(screen.getByText("No events match the current filters.")).toBeInTheDocument();
  });

  it("shows how many events are listed", () => {
    card([event("a"), event("b")]);
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------

describe("AnalysisChart", () => {
  const series = (n = 2) =>
    Array.from({ length: n }, (_, i) => ({ label: `S${i}`, values: f64(1, NaN, 3), colorToken: `plot.${i + 1}` }));
  const xs = f64(0, 1, 2);

  function chart(over: Partial<React.ComponentProps<typeof AnalysisChart>> = {}) {
    const props = {
      xs,
      series: series(),
      syncKey: "k",
      window: null,
      onWindowChange: vi.fn(),
      ...over,
    };
    const view = renderWithProviders(<AnalysisChart {...props} />);
    return { ...view, props };
  }

  describe("construction", () => {
    it("builds one chart, a series per input, with the shared cursor key", () => {
      chart({ unit: "psi", height: 250 });
      expect(FakeUPlot.instances).toHaveLength(1);
      const { opts } = FakeUPlot.last;
      expect(opts.height).toBe(250);
      expect(opts.series).toHaveLength(3);
      expect(opts.cursor.sync).toEqual({ key: "k" });
      expect(opts.axes[1].label).toBe("psi");
      expect(opts.legend.show).toBe(false);
    });

    it("leaves zoom to the app, so the window can be shared", () => {
      chart();
      expect(FakeUPlot.last.opts.cursor.drag).toEqual({ x: true, y: false, setScale: false });
    });

    it("never bridges a gap with an invented line", () => {
      chart();
      for (const s of FakeUPlot.last.opts.series.slice(1)) expect(s.spanGaps).toBe(false);
    });

    it("hands the chart nulls for gaps, never NaN", () => {
      chart({ series: [{ label: "a", values: f64(1, NaN, Infinity), colorToken: "plot.1" }] });
      expect(FakeUPlot.last.data[1]).toEqual([1, null, null]);
    });

    it("labels the x axis in seconds, or as a sample index", () => {
      chart();
      expect(FakeUPlot.last.opts.axes[0].values({}, [0, 1.234])).toEqual(["0.00s", "1.23s"]);
      FakeUPlot.reset();
      chart({ xIsIndex: true });
      expect(FakeUPlot.last.opts.axes[0].values({}, [0, 1.6])).toEqual(["0", "2"]);
    });

    it("destroys the chart on unmount and rebuilds when the plotted set changes", () => {
      const view = chart();
      const first = FakeUPlot.last;
      view.rerender(<AnalysisChart {...view.props} series={series(3)} />);
      expect(first.destroyed).toBe(true);
      expect(FakeUPlot.instances).toHaveLength(2);
      const second = FakeUPlot.last;
      view.unmount();
      expect(second.destroyed).toBe(true);
    });

    it("does not rebuild when the parent re-renders with the same data", () => {
      const view = chart();
      view.rerender(<AnalysisChart {...view.props} />);
      expect(FakeUPlot.instances).toHaveLength(1);
    });
  });

  describe("data and window", () => {
    it("pushes new data when a series' buffer changes, but not for the same buffers", () => {
      const s = series(1);
      const view = chart({ series: s });
      const afterMount = FakeUPlot.last.setDataCalls.length; // the first render syncs once
      view.rerender(<AnalysisChart {...view.props} series={[...s]} />);
      expect(FakeUPlot.last.setDataCalls).toHaveLength(afterMount);
      view.rerender(<AnalysisChart {...view.props} series={[{ ...s[0], values: f64(7, 8, 9) }]} />);
      expect(FakeUPlot.last.setDataCalls).toHaveLength(afterMount + 1);
      expect(FakeUPlot.last.setDataCalls.at(-1)![1]).toEqual([7, 8, 9]);
    });

    it("zooms the x scale to the window, or to the whole capture", () => {
      const view = chart({ window: { start: 0.5, end: 1.5 } });
      expect(FakeUPlot.last.scaleCalls.at(-1)).toEqual({ scale: "x", range: { min: 0.5, max: 1.5 } });
      view.rerender(<AnalysisChart {...view.props} window={null} />);
      expect(FakeUPlot.last.scaleCalls.at(-1)).toEqual({ scale: "x", range: { min: 0, max: 2 } });
    });

    it("ignores an empty or inverted window", () => {
      chart({ window: { start: 2, end: 1 } });
      expect(FakeUPlot.last.scaleCalls).toHaveLength(0);
    });
  });

  describe("interaction", () => {
    it("reports a drag-selection as the new window, and clears the selection", () => {
      const { props } = chart();
      const u = FakeUPlot.last;
      u.select = { left: 10, top: 0, width: 30, height: 100 };
      u.fire("setSelect");
      expect(props.onWindowChange).toHaveBeenCalledWith({ start: 10, end: 40 });
      expect(u.select.width).toBe(0);
    });

    it("ignores a tiny drag, which is just a click", () => {
      const { props } = chart();
      const u = FakeUPlot.last;
      u.select = { left: 10, top: 0, width: 2, height: 100 };
      u.fire("setSelect");
      expect(props.onWindowChange).not.toHaveBeenCalled();
    });

    it("resets the window on double-click", () => {
      const { props, container } = chart();
      fireEvent.doubleClick(container.querySelector("div div div")!);
      expect(props.onWindowChange).toHaveBeenCalledWith(null);
    });

    it("reports the sample under the cursor, and null when it leaves", () => {
      const onCursorIndex = vi.fn();
      chart({ onCursorIndex });
      const u = FakeUPlot.last;
      u.cursor.idx = 2;
      u.fire("setCursor");
      u.cursor.idx = null;
      u.fire("setCursor");
      expect(onCursorIndex.mock.calls).toEqual([[2], [null]]);
    });
  });

  describe("actuation markers", () => {
    const draw = (events: ActuationEvent[], extra: Partial<React.ComponentProps<typeof AnalysisChart>> = {}) => {
      chart({ events, ...extra });
      const u = FakeUPlot.last;
      u.scales.x = { min: 0, max: 10 };
      u.canvasCalls.length = 0;
      u.fire("draw");
      return u;
    };
    const labels = (u: FakeUPlot) => u.canvasCalls.filter((c) => c[0] === "fillText").map((c) => c[1]);
    const lines = (u: FakeUPlot) => u.canvasCalls.filter((c) => c[0] === "moveTo").length;

    it("draws nothing without events", () => {
      const u = draw([]);
      expect(u.canvasCalls).toHaveLength(0);
    });

    it("draws a line and a label per event, clipped to the plot area", () => {
      const u = draw([event("a", { elapsed: 2 }), event("b", { elapsed: 8, actuator: "Vent", state: "off · closed" })]);
      expect(lines(u)).toBe(2);
      expect(labels(u)).toEqual(["Fill on · open", "Vent off · closed"]);
      expect(u.canvasCalls.some((c) => c[0] === "clip")).toBe(true);
    });

    it("names an unmapped channel by its channel, and a log marker by its state", () => {
      const u = draw([event("a", { elapsed: 2, actuator: null, channel: "relay_9" }), event("m", { elapsed: 8, kind: "recording", state: "start_data_saving" })]);
      expect(labels(u)).toEqual(["relay_9 on · open", "start_data_saving"]);
    });

    it("skips events outside the capture or off the visible axis", () => {
      const u = draw([event("a", { elapsed: -1 }), event("b", { elapsed: 99 }), event("c", { elapsed: 3, outsideCapture: true }), event("d", { elapsed: 4 })]);
      expect(lines(u)).toBe(1);
    });

    it("dashes log markers differently from commands", () => {
      const u = draw([event("a", { elapsed: 2 }), event("m", { elapsed: 8, kind: "recording", state: "x" })]);
      const dashes = u.canvasCalls.filter((c) => c[0] === "setLineDash").map((c) => c[1]);
      expect(dashes).toContainEqual([4, 3]);
      expect(dashes).toContainEqual([2, 3]);
    });

    it("can draw the lines without the labels", () => {
      const u = draw([event("a", { elapsed: 2 })], { showEventLabels: false });
      expect(lines(u)).toBe(1);
      expect(labels(u)).toHaveLength(0);
    });

    it("drops a label that would overprint another, once the rows are full", () => {
      const burst = Array.from({ length: 8 }, (_, i) => event(`b${i}`, { elapsed: 5 + i * 0.0001 }));
      const u = draw(burst);
      expect(lines(u)).toBe(8);
      expect(labels(u).length).toBe(3);
    });

    it("repaints when the events change", () => {
      const view = chart({ events: [] });
      const before = FakeUPlot.last.redrawCount;
      view.rerender(<AnalysisChart {...view.props} events={[event("a")]} />);
      expect(FakeUPlot.last.redrawCount).toBeGreaterThan(before);
    });
  });
});

// ---------------------------------------------------------------------------

describe("ChartGrid", () => {
  const dataset = (over: Partial<Dataset> = {}): Dataset => ({
    elapsed: f64(0, 1, 2, 3),
    epochMs: f64(1e12, 1e12 + 1000, 1e12 + 2000, 1e12 + 3000),
    channels: [],
    skipped: [],
    rowCount: 4,
    unboundColumns: [],
    sampleRateHz: 1,
    primarySource: "GCS",
    alignments: [],
    unalignedSources: [],
    events: [],
    ...over,
  });
  const ramp = (top: number) => f64(0, top / 3, (2 * top) / 3, top);

  function grid(channels: Channel[], over: Partial<React.ComponentProps<typeof ChartGrid>> = {}, ds: Dataset = dataset({ channels })) {
    const props = {
      dataset: ds,
      channels,
      window: null,
      onWindowChange: vi.fn(),
      cursorIndex: null,
      onCursorIndex: vi.fn(),
      colors: buildColorMap(channels),
      autoSplit: false,
      chartHeight: 280,
      showEvents: false,
      ...over,
    };
    renderWithProviders(<ChartGrid {...props} />);
    return props;
  }

  it("asks for a channel when none is selected, and draws no chart", () => {
    grid([]);
    expect(screen.getByText("No channels selected.")).toBeInTheDocument();
    expect(FakeUPlot.instances).toHaveLength(0);
  });

  it("draws one chart per unit, titled with the unit and channel count", () => {
    grid([channel("PT1", "psi", ramp(10)), channel("PT2", "psi", ramp(20)), channel("TC1", "C", ramp(30))]);
    expect(FakeUPlot.instances).toHaveLength(2);
    expect(screen.getByText("psi")).toBeInTheDocument();
    expect(screen.getByText("2 ch")).toBeInTheDocument();
    expect(screen.getByText("1 ch")).toBeInTheDocument();
  });

  it("titles a unitless group 'Unitless' and gives its chart no axis label", () => {
    grid([channel("X", "", ramp(1))]);
    expect(screen.getByText("Unitless")).toBeInTheDocument();
    expect(FakeUPlot.last.opts.axes[1].label).toBeUndefined();
  });

  it("splits a range outlier onto its own chart when asked, and says why", () => {
    grid([channel("tank", "kg", ramp(10)), channel("thrust", "kg", ramp(500))], { autoSplit: true });
    expect(FakeUPlot.instances).toHaveLength(2);
    expect(screen.getByText("split by range")).toBeInTheDocument();
    expect(screen.getAllByText(/plotted separately so they stay readable/).length).toBeGreaterThan(0);
  });

  it("keeps them together when not asked", () => {
    grid([channel("tank", "kg", ramp(10)), channel("thrust", "kg", ramp(500))], { autoSplit: false });
    expect(FakeUPlot.instances).toHaveLength(1);
  });

  it("shares one cursor key and the zoom window across every chart", () => {
    const props = grid([channel("a", "psi", ramp(1)), channel("b", "C", ramp(1))], { window: { start: 1, end: 2 } });
    for (const u of FakeUPlot.instances) {
      expect(u.opts.cursor.sync.key).toBe("nova-analysis");
      expect(u.scaleCalls.at(-1)!.range).toEqual({ min: 1, max: 2 });
    }
    FakeUPlot.instances[0].select = { left: 0, top: 0, width: 10, height: 1 };
    FakeUPlot.instances[0].fire("setSelect");
    expect(props.onWindowChange).toHaveBeenCalledWith({ start: 0, end: 10 });
  });

  it("uses a sample-index axis when the capture has no wall clock", () => {
    grid([channel("a", "psi", ramp(1))], {}, dataset({ epochMs: null, channels: [channel("a", "psi", ramp(1))] }));
    expect(FakeUPlot.last.opts.axes[0].values({}, [2.4])).toEqual(["2"]);
  });

  it("lists each trace in the legend, with its value at the cursor to five significant digits", () => {
    const channels = [channel("PT1", "psi", f64(1, 2, 3.14159265, 4))];
    grid(channels, { cursorIndex: 2 });
    expect(screen.getByText("PT1")).toBeInTheDocument();
    expect(screen.getByText("3.1416")).toBeInTheDocument();
  });

  it("shows a dash at a cursor over a gap, and no values without a cursor", () => {
    const channels = [channel("PT1", "psi", f64(1, NaN, 3, 4))];
    const view = renderWithProviders(
      <ChartGrid dataset={dataset({ channels })} channels={channels} window={null} onWindowChange={() => {}} cursorIndex={1} onCursorIndex={() => {}} colors={buildColorMap(channels)} autoSplit={false} chartHeight={200} showEvents={false} />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
    view.unmount();
    renderWithProviders(
      <ChartGrid dataset={dataset({ channels })} channels={channels} window={null} onWindowChange={() => {}} cursorIndex={null} onCursorIndex={() => {}} colors={buildColorMap(channels)} autoSplit={false} chartHeight={200} showEvents={false} />,
    );
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  it("draws actuation markers on every chart only when asked", () => {
    const channels = [channel("a", "psi", ramp(1))];
    const ds = dataset({ channels, events: [event("e1", { elapsed: 1 })] });
    grid(channels, { showEvents: true }, ds);
    const u = FakeUPlot.last;
    u.scales.x = { min: 0, max: 3 };
    u.canvasCalls.length = 0;
    u.fire("draw");
    expect(u.canvasCalls.some((c) => c[0] === "fillText")).toBe(true);
    FakeUPlot.reset();
    grid(channels, { showEvents: false }, ds);
    const v = FakeUPlot.last;
    v.scales.x = { min: 0, max: 3 };
    v.canvasCalls.length = 0;
    v.fire("draw");
    expect(v.canvasCalls).toHaveLength(0);
  });
});

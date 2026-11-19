import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeUPlot } from "@/test/uplotMock";
import { renderWithProviders } from "@/test/render";
import { Card, Gauge, PillTabs, Plot, Terminal, UnderConstruction } from "./index";

describe("Card", () => {
  it("shows a title and header action above its body", () => {
    renderWithProviders(
      <Card title="Engine" headerAction={<span>action</span>}>
        <p>body</p>
      </Card>,
    );
    expect(screen.getByRole("heading", { name: "Engine" })).toBeInTheDocument();
    expect(screen.getByText("action")).toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();
  });

  it("has no header at all without a title", () => {
    renderWithProviders(<Card>just body</Card>);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.getByText("just body")).toBeInTheDocument();
  });

  it("passes extra props through to the container", () => {
    renderWithProviders(<Card data-testid="c">x</Card>);
    expect(screen.getByTestId("c")).toBeInTheDocument();
  });
});

describe("PillTabs", () => {
  const items = [
    { value: "a", label: "Alpha" },
    { value: "b", label: "Beta" },
  ];

  it("shows every tab and reports the one clicked", () => {
    const onChange = vi.fn();
    renderWithProviders(<PillTabs items={items} value="a" onChange={onChange} />);
    fireEvent.click(screen.getByText("Beta"));
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("reports a click on the already-active tab too", () => {
    const onChange = vi.fn();
    renderWithProviders(<PillTabs items={items} value="a" onChange={onChange} />);
    fireEvent.click(screen.getByText("Alpha"));
    expect(onChange).toHaveBeenCalledWith("a");
  });
});

describe("Terminal", () => {
  it("shows the empty message, or a default", () => {
    const view = renderWithProviders(<Terminal lines={[]} emptyMessage="Quiet." />);
    expect(screen.getByText("Quiet.")).toBeInTheDocument();
    view.unmount();
    renderWithProviders(<Terminal lines={[]} />);
    expect(screen.getByText("No output.")).toBeInTheDocument();
  });

  it("shows each line, with its timestamp when it has one", () => {
    renderWithProviders(<Terminal lines={[{ text: "first", timestamp: "09:00:00" }, { text: "second" }]} />);
    expect(screen.getByText("09:00:00")).toBeInTheDocument();
    expect(screen.getByText("first")).toBeInTheDocument();
    expect(screen.getByText("second")).toBeInTheDocument();
  });
});

describe("UnderConstruction", () => {
  it("says the section is not ready", () => {
    renderWithProviders(<UnderConstruction />);
    expect(screen.getByText("Under Construction")).toBeInTheDocument();
    expect(screen.getByText("coming soon")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------

describe("Gauge", () => {
  const needle = (container: HTMLElement) => container.querySelectorAll("svg > line");
  const rimTicks = (container: HTMLElement) => container.querySelectorAll("svg line").length;

  it("shows a dash and no needle for a missing value", () => {
    for (const value of [undefined, null, NaN]) {
      const { container, unmount } = renderWithProviders(<Gauge value={value} unit="psi" />);
      expect(screen.getByText("—")).toBeInTheDocument();
      expect(screen.queryByText("psi")).not.toBeInTheDocument();
      expect(container.querySelector("svg circle")).toBeNull();
      unmount();
    }
  });

  it("shows a real zero as a value, with its needle", () => {
    const { container } = renderWithProviders(<Gauge value={0} unit="psi" />);
    expect(screen.getByText("0.00")).toBeInTheDocument();
    expect(container.querySelector("svg circle")).not.toBeNull();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  it("shows the value and unit", () => {
    renderWithProviders(<Gauge value={42.5} unit="bar" label="Tank" />);
    expect(screen.getByText("42.50")).toBeInTheDocument();
    expect(screen.getByText("bar")).toBeInTheDocument();
    expect(screen.getByText("Tank")).toBeInTheDocument();
  });

  it.each([
    [1234.56, "1235"],
    [123.456, "123.5"],
    [12.345, "12.35"],
  ])("formats %s as '%s'", (value, text) => {
    renderWithProviders(<Gauge value={value} min={0} max={5000} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it("clamps the needle and the shown value to the scale", () => {
    const { container } = renderWithProviders(<Gauge value={500} min={0} max={100} />);
    expect(screen.getByText("100.0")).toBeInTheDocument();
    expect(container.querySelector("svg circle")).not.toBeNull();
    const below = renderWithProviders(<Gauge value={-50} min={0} max={100} />);
    expect(below.getAllByText("0.00").length).toBeGreaterThan(0);
  });

  it("puts the needle at the left for the minimum, the top for the middle, and the right for the maximum", () => {
    const tip = (value: number) => {
      const { container, unmount } = renderWithProviders(<Gauge value={value} min={0} max={100} size={200} />);
      const line = container.querySelector("svg > line:last-of-type") ?? needle(container)[needle(container).length - 1];
      const x = Number(line!.getAttribute("x2"));
      const cx = 100;
      unmount();
      return x - cx;
    };
    expect(tip(0)).toBeLessThan(0);
    expect(Math.abs(tip(50))).toBeLessThan(1);
    expect(tip(100)).toBeGreaterThan(0);
  });

  it("labels the scale at its quarter points, with precision that suits the range", () => {
    renderWithProviders(<Gauge value={1} min={800} max={1100} />);
    for (const label of ["800", "875", "950", "1025", "1100"]) expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("uses finer labels for a narrow range", () => {
    renderWithProviders(<Gauge value={1} min={0} max={1} />);
    expect(screen.getByText("0.25")).toBeInTheDocument();
  });

  it("draws eleven rim ticks, however many zones there are", () => {
    const { container } = renderWithProviders(<Gauge value={null} zones={[{ upTo: 1, color: "info" }]} />);
    expect(rimTicks(container)).toBe(11);
  });

  it("draws one arc per zone, plus the track", () => {
    const a = renderWithProviders(<Gauge value={null} />);
    expect(a.container.querySelectorAll("svg path")).toHaveLength(5);
    a.unmount();
    const b = renderWithProviders(<Gauge value={null} zones={[{ upTo: 0.5, color: "info" }, { upTo: 1, color: "fault" }]} />);
    expect(b.container.querySelectorAll("svg path")).toHaveLength(3);
  });

  it("copes with a degenerate scale", () => {
    expect(() => renderWithProviders(<Gauge value={5} min={10} max={10} />)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------

describe("Plot", () => {
  const series = [{ label: "P", colorToken: "info" }, { label: "T", colorToken: "fault" }];
  const lastData = () => FakeUPlot.last.setDataCalls.at(-1)!;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
  });
  afterEach(() => vi.useRealTimers());

  const frame = (ms = 100) =>
    vi.advanceTimersByTime(ms);

  describe("construction", () => {
    it("builds one chart with the x axis and one series per input", () => {
      renderWithProviders(<Plot series={series} values={[1, 2]} height={180} />);
      expect(FakeUPlot.instances).toHaveLength(1);
      const { opts } = FakeUPlot.last;
      expect(opts.height).toBe(180);
      expect(opts.series).toHaveLength(3);
      expect(opts.series[1]).toMatchObject({ label: "P" });
      expect(opts.series[2]).toMatchObject({ label: "T" });
      expect(opts.cursor.show).toBe(false);
      expect(opts.legend.show).toBe(false);
    });

    it("is at least 120 px wide even in an unmeasured container", () => {
      renderWithProviders(<Plot series={series} values={[1, 2]} />);
      expect(FakeUPlot.last.opts.width).toBe(120);
    });

    it("fixes the y range when both limits are given, and autoscales otherwise", () => {
      renderWithProviders(<Plot series={series} values={[1, 2]} yMin={0} yMax={50} />);
      expect(FakeUPlot.last.opts.scales.y).toEqual({ range: [0, 50] });
      FakeUPlot.reset();
      renderWithProviders(<Plot series={series} values={[1, 2]} yMin={0} />);
      expect(FakeUPlot.last.opts.scales.y).toEqual({});
    });

    it("labels the y axis with the unit", () => {
      renderWithProviders(<Plot series={series} values={[1, 2]} unit="psi" />);
      expect(FakeUPlot.last.opts.axes[1].label).toBe("psi");
    });

    it("ticks the x axis every five seconds back from now, reading 'now' and 'Ns'", () => {
      renderWithProviders(<Plot series={series} values={[1, 2]} windowMs={15_000} />);
      const x = FakeUPlot.last.opts.axes[0];
      const splits = x.splits({}, 0, 85, 100);
      expect(splits).toEqual([85, 90, 95, 100]);
      expect(x.values({ scales: { x: { max: 100 } } }, splits)).toEqual(["15s", "10s", "5s", "now"]);
    });

    it("destroys the chart on unmount", () => {
      const view = renderWithProviders(<Plot series={series} values={[1, 2]} />);
      const chart = FakeUPlot.last;
      view.unmount();
      expect(chart.destroyed).toBe(true);
    });

    it("rebuilds, destroying the old chart, when the series set or axis range changes", () => {
      const view = renderWithProviders(<Plot series={series} values={[1, 2]} yMin={0} yMax={10} />);
      const first = FakeUPlot.last;
      view.rerender(<Plot series={series} values={[1, 2]} yMin={0} yMax={20} />);
      expect(first.destroyed).toBe(true);
      expect(FakeUPlot.instances).toHaveLength(2);
      view.rerender(<Plot series={[series[0]]} values={[1]} yMin={0} yMax={20} />);
      expect(FakeUPlot.instances).toHaveLength(3);
    });

    it("does not rebuild when only the live values change", () => {
      const view = renderWithProviders(<Plot series={series} values={[1, 2]} />);
      view.rerender(<Plot series={series} values={[3, 4]} />);
      expect(FakeUPlot.instances).toHaveLength(1);
    });
  });

  describe("self-sampling", () => {
    it("appends the current values and keeps them as data", () => {
      renderWithProviders(<Plot series={series} values={[1, 2]} />);
      frame();
      const [xs, p, t] = lastData() as number[][];
      expect(xs.length).toBeGreaterThan(0);
      expect(p.at(-1)).toBe(1);
      expect(t.at(-1)).toBe(2);
    });

    it("records a gap (NaN), never a zero, for a missing or non-finite value", () => {
      renderWithProviders(<Plot series={series} values={[null, Infinity]} />);
      frame();
      const [, p, t] = lastData() as number[][];
      expect(Number.isNaN(p.at(-1))).toBe(true);
      expect(Number.isNaN(t.at(-1))).toBe(true);
    });

    it("follows the latest value as it changes", () => {
      const view = renderWithProviders(<Plot series={series} values={[1, 2]} />);
      frame();
      view.rerender(<Plot series={series} values={[5, 6]} />);
      frame();
      const [, p] = lastData() as number[][];
      expect(p.at(-1)).toBe(5);
    });

    it("samples no faster than tickMs", () => {
      renderWithProviders(<Plot series={series} values={[1, 2]} tickMs={1000} />);
      frame(2000);
      const lengths = FakeUPlot.last.setDataCalls.map((d) => d[0].length);
      expect(Math.max(...lengths)).toBeLessThanOrEqual(3);
    });

    it("scrolls the x window to now on every frame", () => {
      renderWithProviders(<Plot series={series} values={[1, 2]} windowMs={30_000} />);
      frame();
      const call = FakeUPlot.last.scaleCalls.at(-1)!;
      expect(call.scale).toBe("x");
      expect(call.range.max - call.range.min).toBeCloseTo(30);
    });

    it("drops samples older than the window", () => {
      renderWithProviders(<Plot series={series} values={[1, 2]} windowMs={1000} tickMs={100} />);
      frame(100);
      const early = (lastData() as number[][])[0][0];
      frame(3000);
      const xs = (lastData() as number[][])[0];
      expect(xs[0]).toBeGreaterThan(early);
      expect(xs.at(-1)! - xs[0]).toBeLessThanOrEqual(2.1);
    });

    it("clears its buffer when the reset key changes", () => {
      const view = renderWithProviders(<Plot series={series} values={[1, 2]} resetKey="a" />);
      frame(200);
      view.rerender(<Plot series={series} values={[1, 2]} resetKey="b" />);
      const cleared = FakeUPlot.last.setDataCalls.find((d) => d[0].length === 0);
      expect(cleared).toBeDefined();
    });

    it("stops animating on unmount", () => {
      const view = renderWithProviders(<Plot series={series} values={[1, 2]} />);
      const chart = FakeUPlot.last;
      view.unmount();
      const calls = chart.setDataCalls.length;
      frame(500);
      expect(chart.setDataCalls.length).toBe(calls);
    });
  });

  describe("external samples", () => {
    it("renders the supplied arrays instead of sampling the values", () => {
      const getSamples = vi.fn(() => ({ xs: [1, 2, 3], ys: [[10, 20, 30], [1, 2, 3]] }));
      renderWithProviders(<Plot series={series} values={[999, 999]} getSamples={getSamples} />);
      frame();
      expect(getSamples).toHaveBeenCalled();
      expect(lastData()).toEqual([[1, 2, 3], [10, 20, 30], [1, 2, 3]]);
    });

    it("keeps reading from the latest supplier", () => {
      const first = vi.fn(() => ({ xs: [1], ys: [[1], [1]] }));
      const second = vi.fn(() => ({ xs: [2], ys: [[2], [2]] }));
      const view = renderWithProviders(<Plot series={series} values={[0, 0]} getSamples={first} />);
      frame();
      view.rerender(<Plot series={series} values={[0, 0]} getSamples={second} />);
      frame();
      expect(second).toHaveBeenCalled();
      expect(lastData()[0]).toEqual([2]);
    });
  });
});

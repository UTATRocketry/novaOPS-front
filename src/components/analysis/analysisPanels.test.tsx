import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_PROCESSING } from "@/lib/analysis";
import type { Channel, Dataset, ProcessingOptions } from "@/lib/analysis";
import { renderWithProviders } from "@/test/render";
import { CaptureSummary } from "./CaptureSummary";
import { ChannelPicker } from "./ChannelPicker";
import { MiniButton, NumberField, ToggleRow } from "./controls";
import { ProcessingCard } from "./ProcessingCard";
import { StatsTable } from "./StatsTable";
import { WindowBar } from "./WindowBar";

const f64 = (...v: number[]) => Float64Array.of(...v);

const channel = (name: string, over: Partial<Channel> = {}): Channel => ({
  id: name,
  name,
  unit: "psi",
  type: "PT",
  origin: "calibrated",
  binding: { source: "GCS", colKey: "hat0_ch0" },
  values: f64(1, 2, 3, 4),
  applied: [],
  sampleRateHz: 10,
  ...over,
});

function dataset(over: Partial<Dataset> = {}): Dataset {
  return {
    elapsed: f64(0, 1, 2, 3),
    epochMs: f64(1_700_000_000_000, 1_700_000_001_000, 1_700_000_002_000, 1_700_000_003_000),
    channels: [channel("PT1")],
    skipped: [],
    rowCount: 4,
    unboundColumns: [],
    sampleRateHz: 1,
    primarySource: "GCS",
    alignments: [],
    unalignedSources: [],
    events: [],
    ...over,
  };
}

// ---------------------------------------------------------------------------

describe("controls", () => {
  describe("NumberField", () => {
    it("shows its label, suffix and hint", () => {
      renderWithProviders(<NumberField label="Decimate" value={2} onChange={() => {}} suffix="every Nth" hint="Keeps 1000 rows" />);
      expect(screen.getByText("Decimate")).toBeInTheDocument();
      expect(screen.getByText("every Nth")).toBeInTheDocument();
      expect(screen.getByText("Keeps 1000 rows")).toBeInTheDocument();
      expect(screen.getByRole("spinbutton")).toHaveValue(2);
    });

    it("reports a typed number, and null (not zero) for an emptied field", () => {
      const onChange = vi.fn();
      renderWithProviders(<NumberField label="x" value={5} onChange={onChange} />);
      const input = screen.getByRole("spinbutton");
      fireEvent.change(input, { target: { value: "7.5" } });
      fireEvent.change(input, { target: { value: "" } });
      expect(onChange.mock.calls).toEqual([[7.5], [null]]);
    });

    it("shows an empty box for a null value", () => {
      renderWithProviders(<NumberField label="x" value={null} onChange={() => {}} placeholder="auto" />);
      expect(screen.getByRole("spinbutton")).toHaveValue(null);
      expect(screen.getByPlaceholderText("auto")).toBeInTheDocument();
    });

    it("can be disabled", () => {
      renderWithProviders(<NumberField label="x" value={1} onChange={() => {}} disabled />);
      expect(screen.getByRole("spinbutton")).toBeDisabled();
    });
  });

  describe("ToggleRow", () => {
    it("is a switch that reports the opposite of its state when clicked", () => {
      const onChange = vi.fn();
      renderWithProviders(<ToggleRow label="Smooth" checked={false} onChange={onChange} hint="Applies to kg" />);
      const toggle = screen.getByRole("switch");
      expect(toggle).toHaveAttribute("aria-checked", "false");
      fireEvent.click(toggle);
      expect(onChange).toHaveBeenCalledWith(true);
      expect(screen.getByText("Applies to kg")).toBeInTheDocument();
    });

    it("reports false when switched off", () => {
      const onChange = vi.fn();
      renderWithProviders(<ToggleRow label="Smooth" checked onChange={onChange} />);
      expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
      fireEvent.click(screen.getByRole("switch"));
      expect(onChange).toHaveBeenCalledWith(false);
    });
  });

  describe("MiniButton", () => {
    it("clicks, and does nothing when disabled", () => {
      const onClick = vi.fn();
      const view = renderWithProviders(<MiniButton onClick={onClick}>Go</MiniButton>);
      fireEvent.click(screen.getByText("Go"));
      expect(onClick).toHaveBeenCalledTimes(1);
      view.unmount();
      renderWithProviders(<MiniButton onClick={onClick} disabled>Go</MiniButton>);
      fireEvent.click(screen.getByText("Go"));
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });
});

// ---------------------------------------------------------------------------

describe("WindowBar", () => {
  const full = { start: 0, end: 300 };

  it("shows the full range and disables 'Full capture' when no window is set", () => {
    renderWithProviders(<WindowBar window={null} fullRange={full} onChange={() => {}} xIsIndex={false} />);
    expect(screen.getByText(/0\.00s → 300\.00s/)).toBeInTheDocument();
    expect(screen.getByText(/300\.00s of 300\.00s/)).toBeInTheDocument();
    expect(screen.getByText("Full capture")).toHaveAttribute("aria-disabled", "true");
  });

  it("shows the chosen window against the whole capture", () => {
    renderWithProviders(<WindowBar window={{ start: 10, end: 40 }} fullRange={full} onChange={() => {}} xIsIndex={false} />);
    expect(screen.getByText(/10\.00s → 40\.00s/)).toBeInTheDocument();
    expect(screen.getByText(/30\.00s of 300\.00s/)).toBeInTheDocument();
    expect(screen.getByText("Full capture")).toHaveAttribute("aria-disabled", "false");
  });

  it("clears the window with Full capture", () => {
    const onChange = vi.fn();
    renderWithProviders(<WindowBar window={{ start: 1, end: 2 }} fullRange={full} onChange={onChange} xIsIndex={false} />);
    fireEvent.click(screen.getByText("Full capture"));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("offers 'last N seconds' presets that end at the end of the capture", () => {
    const onChange = vi.fn();
    renderWithProviders(<WindowBar window={null} fullRange={full} onChange={onChange} xIsIndex={false} />);
    fireEvent.click(screen.getByText("last 60s"));
    expect(onChange).toHaveBeenCalledWith({ start: 240, end: 300 });
  });

  it("only offers presets shorter than the capture", () => {
    renderWithProviders(<WindowBar window={null} fullRange={{ start: 0, end: 90 }} onChange={() => {}} xIsIndex={false} />);
    expect(screen.getByText("last 30s")).toBeInTheDocument();
    expect(screen.getByText("last 60s")).toBeInTheDocument();
    expect(screen.queryByText("last 120s")).not.toBeInTheDocument();
  });

  it("drops the seconds unit and the presets when the axis is a sample index", () => {
    renderWithProviders(<WindowBar window={null} fullRange={{ start: 0, end: 500 }} onChange={() => {}} xIsIndex />);
    expect(screen.queryByText("last 60s")).not.toBeInTheDocument();
    expect(screen.getByText(/0\.00 → 500\.00/)).toBeInTheDocument();
    expect(screen.queryByText(/500\.00s/)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------

describe("ProcessingCard", () => {
  function card(options: Partial<ProcessingOptions> = {}, ds: Dataset | null = dataset()) {
    const onChange = vi.fn();
    const onReset = vi.fn();
    renderWithProviders(<ProcessingCard options={{ ...DEFAULT_PROCESSING, ...options }} onChange={onChange} onReset={onReset} dataset={ds} />);
    return { onChange, onReset };
  }
  const field = (index: number) => screen.getAllByRole("spinbutton")[index];

  it("shows the script's defaults", () => {
    card();
    expect(field(0)).toHaveValue(1);
    expect(field(1)).toHaveValue(51);
    expect(field(2)).toHaveValue(3);
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });

  it("resets to defaults", () => {
    const { onReset } = card();
    fireEvent.click(screen.getByText("Reset defaults"));
    expect(onReset).toHaveBeenCalled();
  });

  describe("decimation", () => {
    it("rounds to a whole number and never goes below 1", () => {
      const { onChange } = card();
      fireEvent.change(field(0), { target: { value: "2.6" } });
      fireEvent.change(field(0), { target: { value: "0" } });
      fireEvent.change(field(0), { target: { value: "-4" } });
      fireEvent.change(field(0), { target: { value: "" } });
      expect(onChange.mock.calls.map((c) => c[0].decimate)).toEqual([3, 1, 1, 1]);
    });

    it("says how many rows are kept once decimating", () => {
      card({ decimate: 4 }, dataset({ rowCount: 12_345 }));
      expect(screen.getByText("12,345 rows kept")).toBeInTheDocument();
    });

    it("says nothing about rows when not decimating or when there is no dataset", () => {
      card({ decimate: 1 });
      expect(screen.queryByText(/rows kept/)).not.toBeInTheDocument();
    });
  });

  describe("mass smoothing", () => {
    it("names the kg channels it will apply to", () => {
      card({}, dataset({ channels: [channel("MFT", { unit: "kg" }), channel("OXT", { unit: " KG " }), channel("PT1")] }));
      expect(screen.getByText("Applies to MFT, OXT")).toBeInTheDocument();
    });

    it("says when there are none", () => {
      card();
      expect(screen.getByText("No kg channels in this capture")).toBeInTheDocument();
      card({}, null);
    });

    it("toggles smoothing", () => {
      const { onChange } = card();
      fireEvent.click(screen.getByRole("switch"));
      expect(onChange).toHaveBeenCalledWith({ smoothMass: false });
    });

    it("disables the filter settings while smoothing is off", () => {
      card({ smoothMass: false });
      expect(field(1)).toBeDisabled();
      expect(field(2)).toBeDisabled();
      expect(field(0)).toBeEnabled();
    });

    it("keeps the window at 3 or more and the order at 1 or more, with sensible fallbacks when emptied", () => {
      const { onChange } = card();
      fireEvent.change(field(1), { target: { value: "1" } });
      fireEvent.change(field(1), { target: { value: "" } });
      fireEvent.change(field(2), { target: { value: "0" } });
      fireEvent.change(field(2), { target: { value: "" } });
      expect(onChange.mock.calls.map((c) => c[0])).toEqual([{ savgolWindow: 3 }, { savgolWindow: 51 }, { savgolPolyorder: 1 }, { savgolPolyorder: 3 }]);
    });

    it("tells the operator when the window will be coerced to a legal one", () => {
      card({ savgolWindow: 50 });
      expect(screen.getByText("Coerced to 51 (odd, > order)")).toBeInTheDocument();
    });

    it("explains a window that is too small for the order", () => {
      card({ savgolWindow: 3, savgolPolyorder: 5 });
      expect(screen.getByText("Coerced to 7 (odd, > order)")).toBeInTheDocument();
    });

    it("shows no coercion note for a legal window", () => {
      card({ savgolWindow: 51, savgolPolyorder: 3 });
      expect(screen.queryByText(/Coerced/)).not.toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------

describe("StatsTable", () => {
  const colors = new Map([["PT1", "#fff"]]);
  const table = (props: Partial<React.ComponentProps<typeof StatsTable>> = {}) => {
    const ds = props.dataset ?? dataset();
    return renderWithProviders(<StatsTable dataset={ds} channels={ds.channels} window={null} cursorIndex={null} colors={colors} {...props} />);
  };
  const row = (name: string) => screen.getByText(name).closest("tr")!;

  it("asks for a channel when none is selected", () => {
    table({ channels: [] });
    expect(screen.getByText("Select at least one channel to see statistics.")).toBeInTheDocument();
  });

  it("shows min, max and mean per channel, with the unit and rate", () => {
    table();
    const cells = within(row("PT1")).getAllByText(/./).map((n) => n.textContent);
    expect(cells).toEqual(expect.arrayContaining(["PT1", "psi", "10.0", "Hz", "1.00", "4.00", "2.50"]));
  });

  it("labels the window, or the full capture", () => {
    const view = table();
    expect(screen.getByText("full capture")).toBeInTheDocument();
    view.unmount();
    table({ window: { start: 1, end: 2 } });
    expect(screen.getByText("1.00–2.00s")).toBeInTheDocument();
  });

  it("measures only the window", () => {
    table({ window: { start: 1, end: 2 } });
    expect(within(row("PT1")).getByText("2.00")).toBeInTheDocument(); // min
    expect(within(row("PT1")).getByText("3.00")).toBeInTheDocument(); // max
  });

  it("shows a dash for every statistic when the window has no data, never zeros", () => {
    table({ window: { start: 50, end: 60 } });
    const cells = within(row("PT1")).getAllByText("—");
    expect(cells.length).toBeGreaterThanOrEqual(3);
    expect(within(row("PT1")).queryByText("0.0000")).not.toBeInTheDocument();
  });

  it("shows a dash for an unknown unit and rate", () => {
    table({ dataset: dataset({ channels: [channel("PT1", { unit: "", sampleRateHz: null })] }) });
    expect(within(row("PT1")).getAllByText("—").length).toBeGreaterThanOrEqual(2);
    expect(within(row("PT1")).queryByText("Hz")).not.toBeInTheDocument();
  });

  it.each([
    [1500, "1.5k"],
    [250, "250"],
    [12.34, "12.3"],
    [1.234, "1.23"],
  ])("formats a rate of %s Hz as '%s'", (hz, text) => {
    table({ dataset: dataset({ channels: [channel("PT1", { sampleRateHz: hz })] }) });
    expect(within(row("PT1")).getByText(text)).toBeInTheDocument();
  });

  it.each([
    [1234.56, "1234.6"],
    [123.456, "123.5"],
    [12.345, "12.35"],
    [0.5, "0.5000"],
    [0, "0.0000"],
    [0.0001, "1.00e-4"],
    [2_500_000, "2.50e+6"],
    [-250.25, "-250.3"],
  ])("formats the value %s as '%s' (precision follows magnitude)", (value, text) => {
    table({ dataset: dataset({ channels: [channel("PT1", { values: f64(value, value, value, value) })] }) });
    expect(within(row("PT1")).getAllByText(text).length).toBeGreaterThan(0);
  });

  it("adds a cursor column with the value under the chart cursor, and its time", () => {
    table({ cursorIndex: 2 });
    expect(screen.getByText("@ CURSOR")).toBeInTheDocument();
    expect(screen.getByText("t = 2.000s")).toBeInTheDocument();
    expect(within(row("PT1")).getByText("3.00")).toBeInTheDocument();
  });

  it("shows a dash at a cursor over a gap", () => {
    table({ cursorIndex: 1, dataset: dataset({ channels: [channel("PT1", { values: f64(1, NaN, 3, 4) })] }) });
    const cells = within(row("PT1")).getAllByText("—");
    expect(cells.length).toBeGreaterThanOrEqual(1);
  });

  it("ignores a cursor outside the data", () => {
    table({ cursorIndex: 99 });
    expect(screen.queryByText(/^t = /)).not.toBeInTheDocument();
  });

  it("has no cursor column without a cursor", () => {
    table();
    expect(screen.queryByText("@ CURSOR")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------

describe("CaptureSummary", () => {
  const summary = (over: Partial<Dataset> = {}) => renderWithProviders(<CaptureSummary dataset={dataset(over)} />);

  it("shows the sample count, duration, rate and channel count", () => {
    summary({ rowCount: 12_345, sampleRateHz: 100.04, elapsed: f64(0, 30) });
    expect(screen.getByText("12,345")).toBeInTheDocument();
    expect(screen.getByText("30.00")).toBeInTheDocument();
    expect(screen.getByText("s")).toBeInTheDocument();
    expect(screen.getByText("100.0")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("shows long durations as minutes and seconds", () => {
    summary({ elapsed: f64(0, 125.5) });
    expect(screen.getByText("2m 5.5")).toBeInTheDocument();
  });

  // Known gap: a duration just under a whole minute rounds the seconds up to 60.
  it.fails("never shows 60 seconds", () => {
    summary({ elapsed: f64(0, 119.97) });
    expect(screen.queryByText("1m 60.0")).not.toBeInTheDocument();
  });

  it("shows dashes for the duration and rate of a single-sample or unclocked capture", () => {
    summary({ elapsed: f64(0), sampleRateHz: null });
    expect(screen.getAllByText("—")).toHaveLength(2);
  });

  it("names the timeline source", () => {
    summary({ primarySource: "TCS" });
    expect(screen.getByText(/novaThermo \(TCS\) timeline/)).toBeInTheDocument();
  });

  it("counts calibrated channels and warns about raw counts separately", () => {
    summary({ channels: [channel("a"), channel("b"), channel("c", { origin: "raw" })] });
    expect(screen.getByText(/2 calibrated/)).toBeInTheDocument();
    expect(screen.getByText(/1 uncalibrated \(raw counts\)/)).toBeInTheDocument();
  });

  it("shows no calibration chips when there are no channels", () => {
    summary({ channels: [] });
    expect(screen.queryByText(/calibrated/)).not.toBeInTheDocument();
  });

  it("reports events and unresolved sensors when there are some", () => {
    summary({ events: [{} as never, {} as never], skipped: [{ name: "x", colKey: "c", source: "GCS", reason: "missing-column" }] });
    expect(screen.getByText(/2 actuation events/)).toBeInTheDocument();
    expect(screen.getByText(/1 sensors unresolved/)).toBeInTheDocument();
  });

  it("flags a source that could not be merged for lack of a timestamp", () => {
    summary({ unalignedSources: ["FAS"] });
    expect(screen.getByText(/FAS not merged — no timestamp/)).toBeInTheDocument();
  });

  it("describes how each secondary log was aligned, and warns on a large skew", () => {
    summary({
      alignments: [
        { source: "TCS", mode: "epoch", columns: ["TCS:a", "TCS:b"], worstSkewS: 0.1234 },
        { source: "FAS", mode: "elapsed", columns: ["FAS:a"], worstSkewS: 0.9 },
      ],
    });
    expect(screen.getByText("2 channels merged by wall clock")).toBeInTheDocument();
    expect(screen.getByText("1 channel merged by elapsed time")).toBeInTheDocument();
    expect(screen.getByText("worst skew 0.123s")).toBeInTheDocument();
    expect(screen.getByText("worst skew 0.900s")).toBeInTheDocument();
  });

  it("shows the first sample's UTC time, or warns that the axis is a sample index", () => {
    const view = summary();
    expect(screen.getByText("First sample 2023-11-14 22:13:20.000 UTC")).toBeInTheDocument();
    view.unmount();
    summary({ epochMs: null });
    expect(screen.getByText(/No usable timestamp column/)).toBeInTheDocument();
    expect(screen.queryByText(/First sample/)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------

describe("ChannelPicker", () => {
  const colors = new Map([["PT1", "#f00"], ["PT2", "#0f0"], ["MFT", "#00f"]]);
  const picker = (ds: Dataset, selected: string[] = [], over: Partial<React.ComponentProps<typeof ChannelPicker>> = {}) => {
    const onToggle = vi.fn();
    const onSetAll = vi.fn();
    renderWithProviders(<ChannelPicker dataset={ds} selected={new Set(selected)} onToggle={onToggle} onSetAll={onSetAll} colors={colors} {...over} />);
    return { onToggle, onSetAll };
  };
  const three = dataset({ channels: [channel("PT1"), channel("PT2"), channel("MFT", { unit: "kg", origin: "raw" })] });

  it("says so when no sensor matched a column", () => {
    picker(dataset({ channels: [] }));
    expect(screen.getByText("No configured sensor matched a column in this file.")).toBeInTheDocument();
  });

  it("groups channels by unit, each as a switch showing its state", () => {
    picker(three, ["PT1"]);
    expect(screen.getByText("PSI")).toBeInTheDocument();
    expect(screen.getByText("KG")).toBeInTheDocument();
    const switches = screen.getAllByRole("switch");
    expect(switches).toHaveLength(3);
    expect(within(switches[0]).getByText("PT1")).toBeInTheDocument();
    expect(switches.map((s) => s.getAttribute("aria-checked"))).toEqual(["true", "false", "false"]);
  });

  it("shows each channel's subsystem, processing state and unit, with the unit 'unitless' when blank", () => {
    picker(dataset({ channels: [channel("A", { unit: "", binding: { source: "TCS", colKey: "hat0_ch0" } })] }));
    expect(screen.getByText("UNITLESS")).toBeInTheDocument();
    expect(screen.getByText("TCS")).toBeInTheDocument();
    expect(screen.getByText("cal")).toBeInTheDocument();
  });

  it("explains how a channel was processed in its tooltip", () => {
    picker(dataset({ channels: [channel("A", { applied: ["calibration (3 pts)", "Savitzky-Golay (w=51, p=3)"] }), channel("B")] }));
    expect(screen.getByTitle("calibration (3 pts) → Savitzky-Golay (w=51, p=3)")).toBeInTheDocument();
    expect(screen.getByTitle("No processing applied")).toBeInTheDocument();
  });

  it("toggles a single channel", () => {
    const { onToggle } = picker(three);
    fireEvent.click(screen.getAllByRole("switch")[1]);
    expect(onToggle).toHaveBeenCalledWith("PT2");
  });

  it("selects all and none, each disabled when it would change nothing", () => {
    const { onSetAll } = picker(three, []);
    expect(screen.getByText("None")).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(screen.getByText("All"));
    expect(onSetAll).toHaveBeenCalledWith(["PT1", "PT2", "MFT"]);
  });

  it("disables All when everything is already selected", () => {
    picker(three, ["PT1", "PT2", "MFT"]);
    expect(screen.getByText("All")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("None")).toHaveAttribute("aria-disabled", "false");
  });

  it("toggles a whole unit group on, keeping the rest of the selection", () => {
    const { onSetAll } = picker(three, ["MFT"]);
    fireEvent.click(screen.getAllByText("toggle")[0]); // psi
    expect(new Set(onSetAll.mock.calls[0][0])).toEqual(new Set(["MFT", "PT1", "PT2"]));
  });

  it("toggles a unit group off when all of it is selected", () => {
    const { onSetAll } = picker(three, ["PT1", "PT2", "MFT"]);
    fireEvent.click(screen.getAllByText("toggle")[0]);
    expect(onSetAll.mock.calls[0][0]).toEqual(["MFT"]);
  });

  it("fills in a half-selected unit group", () => {
    const { onSetAll } = picker(three, ["PT1"]);
    fireEvent.click(screen.getAllByText("toggle")[0]);
    expect(new Set(onSetAll.mock.calls[0][0])).toEqual(new Set(["PT1", "PT2"]));
  });

  describe("unresolved sensors", () => {
    it("lists every one with its subsystem, column and reason, rather than dropping it", () => {
      picker(
        dataset({
          skipped: [
            { name: "S1", colKey: "hat9_ch9", source: "GCS", reason: "missing-column" },
            { name: "S2", colKey: "hat0_ch0", source: "TCS", reason: "source-not-loaded" },
            { name: "S3", colKey: "hat1_ch1", source: "GCS", reason: "invalid-calibration" },
          ],
        }),
      );
      expect(screen.getByText("UNRESOLVED SENSORS (3)")).toBeInTheDocument();
      expect(screen.getByText("no column")).toBeInTheDocument();
      expect(screen.getByText("no log")).toBeInTheDocument();
      expect(screen.getByText("bad cal")).toBeInTheDocument();
      expect(screen.getByText("GCS hat9_ch9")).toBeInTheDocument();
      expect(screen.getByTitle(/no such column — check the binding in Config/)).toBeInTheDocument();
      expect(screen.getByTitle("The sensor's calibration table in the config is malformed.")).toBeInTheDocument();
    });

    it("has no unresolved section when everything resolved", () => {
      picker(three);
      expect(screen.queryByText(/UNRESOLVED/)).not.toBeInTheDocument();
    });
  });

  it("lists columns no sensor referenced, naming their subsystem", () => {
    picker(dataset({ unboundColumns: ["TCS:hat0_ch5", "GCS:extra"] }));
    expect(screen.getByText("UNBOUND COLUMNS (2)")).toBeInTheDocument();
    expect(screen.getByText("TCS hat0_ch5")).toBeInTheDocument();
    expect(screen.getByText("GCS extra")).toBeInTheDocument();
  });
});

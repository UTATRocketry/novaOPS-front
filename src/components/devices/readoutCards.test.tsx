import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { FasBoard, FasBoardPower, PmbStatus } from "@/lib/flight/types";
import { renderWithProviders } from "@/test/render";
import { BoardFleetStrip } from "./BoardFleetStrip";
import { DiagnosticsCard } from "./DiagnosticsCard";
import { EpbPowerCard } from "./EpbPowerCard";
import { PmbPowerCard } from "./PmbPowerCard";
import { FlagDot, Readout, num, uptime } from "./shared";

// The live charts draw on a canvas jsdom does not have; replace them with a
// stub that exposes what each card hands to them.
vi.mock("@/components/flight", () => ({
  LiveChartCard: (p: { title: string; values: Array<number | undefined>; yMin?: number; yMax?: number; unit: string; noDataLabel: string }) => (
    <div data-testid={`chart-${p.title}`} data-values={JSON.stringify(p.values)} data-ymin={p.yMin} data-ymax={p.yMax} data-unit={p.unit}>
      {p.noDataLabel}
    </div>
  ),
}));

describe("shared formatters", () => {
  describe("num", () => {
    it.each([
      [1.234, " V", 2, "1.23 V"],
      [0, "", 2, "0.00"],
      [-5.5, "", 1, "-5.5"],
    ])("%s -> '%s'", (v, suffix, digits, expected) => {
      expect(num(v, suffix, digits)).toBe(expected);
    });

    it.each([undefined, null, NaN, Infinity, -Infinity])("shows a dash for %s, never a number", (v) => {
      expect(num(v as never, " V")).toBe("—");
    });

    it("keeps a real zero as 0, not a dash", () => {
      expect(num(0)).toBe("0.00");
    });
  });

  describe("uptime", () => {
    it.each([
      [0, "00:00:00"],
      [59_000, "00:00:59"],
      [3_661_000, "01:01:01"],
      [86_400_000, "1d 00:00:00"],
      [90_061_000, "1d 01:01:01"],
    ])("%d ms -> %s", (ms, text) => {
      expect(uptime(ms)).toBe(text);
    });

    it.each([undefined, NaN, Infinity])("shows a dash for %s", (v) => {
      expect(uptime(v as never)).toBe("—");
    });
  });

  it("Readout shows a label and its value", () => {
    renderWithProviders(<Readout label="VBAT" value="15.2 V" />);
    expect(screen.getByText("VBAT")).toBeInTheDocument();
    expect(screen.getByText("15.2 V")).toBeInTheDocument();
  });

  describe("FlagDot", () => {
    it("shows a dash, not a dot, for an unknown flag", () => {
      renderWithProviders(<FlagDot label="charger" value={undefined} />);
      expect(screen.getByText("—")).toBeInTheDocument();
      expect(screen.getByText("charger")).toBeInTheDocument();
    });

    it("shows a dot for a known flag, true or false", () => {
      const view = renderWithProviders(<FlagDot label="a" value />);
      expect(screen.queryByText("—")).not.toBeInTheDocument();
      view.unmount();
      renderWithProviders(<FlagDot label="a" value={false} />);
      expect(screen.queryByText("—")).not.toBeInTheDocument();
    });

    it("highlights the label of an asserted danger flag, and only then", () => {
      const view = renderWithProviders(<FlagDot label="protect" value danger />);
      const danger = getComputedStyle(screen.getByText("protect")).color;
      view.unmount();
      renderWithProviders(<FlagDot label="protect" value={false} danger />);
      expect(getComputedStyle(screen.getByText("protect")).color).not.toBe(danger);
    });
  });
});

describe("BoardFleetStrip", () => {
  const board = (over: Partial<FasBoard> = {}): FasBoard => ({ key: "EPB:0", kind: "EPB", boardId: 0, online: true, ...over });

  it("says so when no board is reported", () => {
    renderWithProviders(<BoardFleetStrip boards={[]} />);
    expect(screen.getByText("No boards reported on the bus.")).toBeInTheDocument();
    expect(screen.getByText("0 boards")).toBeInTheDocument();
  });

  it("counts the boards and shows each one's details", () => {
    renderWithProviders(
      <BoardFleetStrip boards={[board({ uptimeMs: 3_661_000, fwVersion: 4, numChannels: 8, numSensors: 6 }), board({ key: "PMB:0", kind: "PMB" })]} />,
    );
    expect(screen.getByText("2 boards")).toBeInTheDocument();
    expect(screen.getByText("EPB:0")).toBeInTheDocument();
    expect(screen.getByText("01:01:01")).toBeInTheDocument();
    expect(screen.getByText("v4")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();
  });

  it("shows dashes for details a board did not report", () => {
    renderWithProviders(<BoardFleetStrip boards={[board()]} />);
    expect(within(screen.getByText("EPB:0").closest("div")!.parentElement!.parentElement!).getAllByText("—")).toHaveLength(4);
  });

  it("shows online and offline boards", () => {
    renderWithProviders(<BoardFleetStrip boards={[board(), board({ key: "X:1", online: false })]} />);
    expect(screen.getByText("online")).toBeInTheDocument();
    expect(screen.getByText("offline")).toBeInTheDocument();
  });

  it("does not claim a board is online when the flight stream is stale", () => {
    renderWithProviders(<BoardFleetStrip boards={[board(), board({ key: "X:1", online: false })]} stale />);
    expect(screen.queryByText("online")).not.toBeInTheDocument();
    expect(screen.getByText("stale")).toBeInTheDocument();
    expect(screen.getByText("offline")).toBeInTheDocument();
  });
});

describe("EpbPowerCard", () => {
  const power = (over: Partial<FasBoardPower> = {}): FasBoardPower => over;
  const chart = (title: string) => screen.getByTestId(`chart-${title}`);

  it("shows both rails' voltage and current", () => {
    renderWithProviders(<EpbPowerCard boardKey="EPB:0" power={power({ v8v4: 8.41, i8v4: 0.5, v24v: 24.1, i24v: 1.25 })} />);
    expect(screen.getByText("EPB:0 · bus power")).toBeInTheDocument();
    expect(screen.getByText("8.41 V")).toBeInTheDocument();
    expect(screen.getByText("0.50 A")).toBeInTheDocument();
    expect(screen.getByText("24.10 V")).toBeInTheDocument();
    expect(screen.getByText("1.25 A")).toBeInTheDocument();
  });

  it("shows dashes where a rail is missing", () => {
    renderWithProviders(<EpbPowerCard boardKey="EPB:0" power={power()} />);
    expect(screen.getAllByText("—")).toHaveLength(4);
  });

  it("hands the charts the live values, leaving gaps as undefined", () => {
    renderWithProviders(<EpbPowerCard boardKey="EPB:0" power={power({ v8v4: 8.4, i24v: 2 })} />);
    expect(JSON.parse(chart("Rail voltage").dataset.values!)).toEqual([8.4, null]);
    expect(JSON.parse(chart("Rail current").dataset.values!)).toEqual([null, 2]);
    expect(chart("Rail voltage")).toHaveAttribute("data-unit", "V");
    expect(chart("Rail current")).toHaveAttribute("data-unit", "A");
  });

  it("pins the chart axes from the configured ranges, and leaves them to autoscale otherwise", () => {
    const view = renderWithProviders(<EpbPowerCard boardKey="EPB:0" power={power()} ranges={{ voltage: [0, 30], current: [0, 5] }} />);
    expect(chart("Rail voltage")).toHaveAttribute("data-ymin", "0");
    expect(chart("Rail voltage")).toHaveAttribute("data-ymax", "30");
    expect(chart("Rail current")).toHaveAttribute("data-ymax", "5");
    view.unmount();
    renderWithProviders(<EpbPowerCard boardKey="EPB:0" power={power()} />);
    expect(chart("Rail voltage")).not.toHaveAttribute("data-ymin");
  });
});

describe("PmbPowerCard", () => {
  const pmb = (over: Partial<PmbStatus> = {}): PmbStatus => over;
  const chart = (title: string) => screen.getByTestId(`chart-${title}`);

  it("shows rails, inputs and temperatures", () => {
    renderWithProviders(
      <PmbPowerCard
        boardKey="PMB:0"
        pmb={pmb({
          pwr: { v8v4: 8.4, i8v4: 1, p8v4: 8.4, v24v0: 24, i24v0: 2, p24v0: 48 },
          vmon: { vMain: 24.5, vBatt: 15.2, vGse: 0 },
          temp: { ambient: 21.25, buck: 40, boost: 45.5 },
        })}
      />,
    );
    expect(screen.getByText("PMB:0 · power management")).toBeInTheDocument();
    expect(screen.getByText("48.00 W")).toBeInTheDocument();
    expect(screen.getByText("15.20 V")).toBeInTheDocument();
    expect(screen.getByText("0.00 V")).toBeInTheDocument(); // a real 0 V GSE, not a dash
    expect(screen.getByText("21.3 °C")).toBeInTheDocument();
    expect(screen.getByText("45.5 °C")).toBeInTheDocument();
  });

  it("shows only dashes for a board that has reported nothing", () => {
    renderWithProviders(<PmbPowerCard boardKey="PMB:0" pmb={pmb()} />);
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(12);
    expect(screen.queryByText(/BATTERY PROTECT/)).not.toBeInTheDocument();
  });

  it("raises a banner when the battery protect has cut the converters", () => {
    renderWithProviders(<PmbPowerCard boardKey="PMB:0" pmb={pmb({ vmon: { protect: true } })} />);
    expect(screen.getByText("BATTERY PROTECT — converters cut")).toBeInTheDocument();
  });

  it("shows no banner when protect is off or unknown", () => {
    const view = renderWithProviders(<PmbPowerCard boardKey="PMB:0" pmb={pmb({ vmon: { protect: false } })} />);
    expect(screen.queryByText(/BATTERY PROTECT/)).not.toBeInTheDocument();
    view.unmount();
    renderWithProviders(<PmbPowerCard boardKey="PMB:0" pmb={pmb({ vmon: {} })} />);
    expect(screen.queryByText(/BATTERY PROTECT/)).not.toBeInTheDocument();
  });

  it("labels every power-good flag", () => {
    renderWithProviders(<PmbPowerCard boardKey="PMB:0" pmb={pmb({ vmon: { buckOn: true } })} />);
    for (const label of ["buck", "boost", "3V3", "8V4", "24V0", "charger", "batt src", "protect"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it("hands the charts the input voltages and temperatures", () => {
    renderWithProviders(<PmbPowerCard boardKey="PMB:0" pmb={pmb({ vmon: { vMain: 24, vBatt: 15 }, temp: { buck: 40 } })} ranges={{ voltage: [0, 30], temperature: [-10, 90] }} />);
    expect(JSON.parse(chart("Input voltages").dataset.values!)).toEqual([24, 15, null]);
    expect(JSON.parse(chart("Temperatures").dataset.values!)).toEqual([null, 40, null]);
    expect(chart("Temperatures")).toHaveAttribute("data-ymin", "-10");
    expect(chart("Input voltages")).toHaveAttribute("data-ymax", "30");
  });
});

describe("DiagnosticsCard", () => {
  it("states the backend dependency and fabricates no values", () => {
    renderWithProviders(<DiagnosticsCard />);
    expect(screen.getByText("awaiting backend")).toBeInTheDocument();
    expect(screen.getByText(/no values are/)).toBeInTheDocument();
  });
});

import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AXIS3_SERIES, LiveChartCard, axis3Values } from "./LiveChartCard";
import { AltitudeTrendPlaceholder } from "./AltitudeTrendPlaceholder";
import { AxisChart } from "./AxisChart";
import { EnvironmentCard } from "./EnvironmentCard";
import { FlightGraph } from "./FlightGraph";
import { FlightKpiStrip } from "./FlightKpiStrip";
import { FlightStatusCard } from "./FlightStatusCard";
import { FmcHealthStrip } from "./FmcHealthStrip";
import { GpsReadout } from "./GpsReadout";
import { IncomingPacketCard } from "./IncomingPacketCard";
import { clearFlightRecord, getFlightSeries, startFlightRecorder, stopFlightRecorder } from "@/lib/flight/recorder";
import type { FlightMilestones, FlightTelemetry } from "@/lib/flight/types";
import { useNovaStore } from "@/lib/store";
import { FakeUPlot } from "@/test/uplotMock";
import { renderWithProviders } from "@/test/render";

const none: FlightMilestones = {
  launchDetected: false,
  motorBurnout: false,
  apogeeDetected: false,
  drogueDeployed: false,
  mainDeployed: false,
  landingDetected: false,
};

describe("axis3Values / AXIS3_SERIES", () => {
  it("lines the values up with the X, Y, Z, Mag series", () => {
    expect(AXIS3_SERIES.map((s) => s.label)).toEqual(["X", "Y", "Z", "Mag"]);
    expect(axis3Values({ x: 1, y: 2, z: 3, magnitude: 3.7 })).toEqual([1, 2, 3, 3.7]);
  });

  it("gives four gaps, not zeros, when there is no vector", () => {
    expect(axis3Values(undefined)).toEqual([null, null, null, null]);
  });
});

describe("LiveChartCard", () => {
  const series = [{ label: "P", colorToken: "info" }, { label: "T", colorToken: "fault" }];

  it("shows a title, the unit and each series' value to a magnitude-appropriate precision", () => {
    renderWithProviders(<LiveChartCard title="Env" series={series} values={[1234.5, 12.345]} unit="hPa" />);
    expect(screen.getByText("Env")).toBeInTheDocument();
    expect(screen.getByText("1235")).toBeInTheDocument();
    expect(screen.getByText("12.35")).toBeInTheDocument();
    expect(screen.getByText("hPa")).toBeInTheDocument();
  });

  it.each([
    [150.55, "150.6"],
    [-250.25, "-250.3"],
    [0, "0.00"],
  ])("formats %s as %s", (v, text) => {
    renderWithProviders(<LiveChartCard title="x" series={[series[0]]} values={[v]} unit="u" />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it("shows a dash for a missing or non-finite value", () => {
    renderWithProviders(<LiveChartCard title="x" series={series} values={[null, NaN]} unit="u" />);
    expect(screen.getAllByText("—")).toHaveLength(2);
  });

  it("explains the lack of data only while there is none", () => {
    const view = renderWithProviders(<LiveChartCard title="x" series={series} values={[null, undefined]} unit="u" noDataLabel="No telemetry" />);
    expect(screen.getByText("No telemetry")).toBeInTheDocument();
    view.unmount();
    renderWithProviders(<LiveChartCard title="x" series={series} values={[1, undefined]} unit="u" noDataLabel="No telemetry" />);
    expect(screen.queryByText("No telemetry")).not.toBeInTheDocument();
  });

  it("draws the chart with the given range, height and series", () => {
    renderWithProviders(<LiveChartCard title="x" series={series} values={[1, 2]} unit="u" yMin={0} yMax={5} height={150} />);
    expect(FakeUPlot.last.opts.height).toBe(150);
    expect(FakeUPlot.last.opts.scales.y).toEqual({ range: [0, 5] });
    expect(FakeUPlot.last.opts.series).toHaveLength(3);
  });
});

describe("AxisChart", () => {
  it("shows a dash and the reason when there is no vector", () => {
    renderWithProviders(<AxisChart title="Accel" data={undefined} unit="g" noDataLabel="No IMU" />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("No IMU")).toBeInTheDocument();
  });

  it("shows X, Y, Z and magnitude with the unit", () => {
    renderWithProviders(<AxisChart title="Accel" data={{ x: 0.1234, y: -2, z: 150.55, magnitude: 1500 }} unit="g" />);
    expect(screen.getByText("0.123")).toBeInTheDocument();
    expect(screen.getByText("-2.000")).toBeInTheDocument();
    expect(screen.getByText("150.6")).toBeInTheDocument();
    expect(screen.getByText("1500")).toBeInTheDocument();
    expect(screen.getAllByText("g")).toHaveLength(4);
    for (const l of ["X", "Y", "Z", "Mag"]) expect(screen.getByText(l)).toBeInTheDocument();
  });

  it("shows a real zero as 0.000", () => {
    renderWithProviders(<AxisChart title="x" data={{ x: 0, y: 0, z: 0, magnitude: 0 }} unit="g" />);
    expect(screen.getAllByText("0.000")).toHaveLength(4);
  });
});

describe("FlightKpiStrip", () => {
  const tel = (t: Partial<FlightTelemetry>) => t as FlightTelemetry;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000_000);
  });
  afterEach(() => vi.useRealTimers());

  it("shows dashes for everything unknown, and a placeholder mission time", () => {
    renderWithProviders(<FlightKpiStrip telemetry={null} launchEpochMs={null} />);
    expect(screen.getByText("T+--:--:--")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(4);
  });

  it("shows altitude, velocity, inclination and state with their units", () => {
    renderWithProviders(<FlightKpiStrip telemetry={tel({ altitude: 1234.56 })} launchEpochMs={null} velocity={-3.04} inclination={12.25} fsmState="coast" />);
    expect(screen.getByText("1234.6")).toBeInTheDocument();
    expect(screen.getByText("-3.0")).toBeInTheDocument();
    expect(screen.getByText("12.3")).toBeInTheDocument();
    expect(screen.getByText("coast")).toBeInTheDocument();
    expect(screen.getByText("m/s")).toBeInTheDocument();
    expect(screen.getByText("°")).toBeInTheDocument();
  });

  it("shows a real zero velocity and altitude as 0.0, not a dash", () => {
    renderWithProviders(<FlightKpiStrip telemetry={tel({ altitude: 0 })} launchEpochMs={null} velocity={0} inclination={0} />);
    expect(screen.getAllByText("0.0")).toHaveLength(3);
  });

  it("prefers the derived values over the backend's, and falls back to them", () => {
    const view = renderWithProviders(<FlightKpiStrip telemetry={tel({ velocity: 99, inclination: 88, state: "boost" })} launchEpochMs={null} velocity={5} inclination={6} fsmState="coast" />);
    expect(screen.getByText("5.0")).toBeInTheDocument();
    expect(screen.getByText("6.0")).toBeInTheDocument();
    expect(screen.getByText("coast")).toBeInTheDocument();
    view.unmount();
    renderWithProviders(<FlightKpiStrip telemetry={tel({ velocity: 99, inclination: 88, state: "boost" })} launchEpochMs={null} />);
    expect(screen.getByText("99.0")).toBeInTheDocument();
    expect(screen.getByText("88.0")).toBeInTheDocument();
    expect(screen.getByText("boost")).toBeInTheDocument();
  });

  it("runs the mission clock from launch, ticking each second", () => {
    renderWithProviders(<FlightKpiStrip telemetry={null} launchEpochMs={10_000_000 - 3_723_000} />);
    expect(screen.getByText("T+01:02:03")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText("T+01:02:04")).toBeInTheDocument();
  });

  it("never shows a negative mission time for a launch stamp in the future", () => {
    renderWithProviders(<FlightKpiStrip telemetry={null} launchEpochMs={10_000_000 + 5000} />);
    expect(screen.getByText("T+00:00:00")).toBeInTheDocument();
  });
});

describe("FlightStatusCard", () => {
  it("shows every milestone as FALSE, and dashes for phase and state, by default", () => {
    renderWithProviders(<FlightStatusCard milestones={none} />);
    expect(screen.getAllByText("FALSE")).toHaveLength(6);
    expect(screen.queryByText("TRUE")).not.toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(2);
  });

  it("shows achieved milestones as TRUE, each against its own label", () => {
    renderWithProviders(<FlightStatusCard milestones={{ ...none, launchDetected: true, apogeeDetected: true }} phase="coast" state="armed" />);
    expect(screen.getAllByText("TRUE")).toHaveLength(2);
    expect(within(screen.getByText("Launch Detected").parentElement!).getByText("TRUE")).toBeInTheDocument();
    expect(within(screen.getByText("Motor Burnout").parentElement!).getByText("FALSE")).toBeInTheDocument();
    expect(screen.getByText("coast")).toBeInTheDocument();
    expect(screen.getByText("armed")).toBeInTheDocument();
  });
});

describe("GpsReadout", () => {
  it("says there is no fix when there is no GPS block", () => {
    renderWithProviders(<GpsReadout gps={undefined} />);
    expect(screen.getByText("No GPS fix")).toBeInTheDocument();
  });

  it("shows position to six places and the extras with units", () => {
    renderWithProviders(<GpsReadout gps={{ lat: 43.6532, lon: -79.3832, alt: 120.56, fix: true, satellites: 9, hdop: 1.5, speed: 4.25 }} />);
    expect(screen.getByText("43.653200")).toBeInTheDocument();
    expect(screen.getByText("-79.383200")).toBeInTheDocument();
    expect(screen.getByText("120.6 m")).toBeInTheDocument();
    expect(screen.getByText("yes")).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();
    expect(screen.getByText("1.5")).toBeInTheDocument();
    expect(screen.getByText("4.3 m/s")).toBeInTheDocument();
  });

  it("shows dashes for the fields a partial fix lacks, and 'no' when the fix is lost", () => {
    renderWithProviders(<GpsReadout gps={{ lat: 1, lon: 2, fix: false }} />);
    expect(screen.getByText("no")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(4);
  });

  it("shows a real zero altitude, not a dash", () => {
    renderWithProviders(<GpsReadout gps={{ lat: 1, lon: 2, alt: 0, speed: 0 }} />);
    expect(screen.getByText("0.0 m")).toBeInTheDocument();
    expect(screen.getByText("0.0 m/s")).toBeInTheDocument();
  });
});

describe("EnvironmentCard", () => {
  it("shows two gauges with their units and labels", () => {
    renderWithProviders(<EnvironmentCard pressure={1013.25} temperature={21.5} />);
    expect(screen.getByText("1013")).toBeInTheDocument();
    expect(screen.getByText("21.50")).toBeInTheDocument();
    expect(screen.getByText("hPa")).toBeInTheDocument();
    expect(screen.getByText("°C")).toBeInTheDocument();
    expect(screen.getByText("Pressure")).toBeInTheDocument();
    expect(screen.getByText("Temperature")).toBeInTheDocument();
  });

  it("shows dashes, not zeros, when there is no reading", () => {
    renderWithProviders(<EnvironmentCard />);
    expect(screen.getAllByText("—")).toHaveLength(2);
  });

  it("shows a real 0 °C", () => {
    renderWithProviders(<EnvironmentCard temperature={0} />);
    expect(screen.getByText("0.00")).toBeInTheDocument();
  });
});

describe("FmcHealthStrip", () => {
  it("says there is no beacon, rather than showing every sensor as failed", () => {
    renderWithProviders(<FmcHealthStrip health={undefined} />);
    expect(screen.getByText("No health beacon")).toBeInTheDocument();
    expect(screen.queryByText("IMU")).not.toBeInTheDocument();
  });

  it("lists every sensor, with ok, failed and unknown told apart", () => {
    const { container } = renderWithProviders(<FmcHealthStrip health={{ imuOk: true, accelOk: false, gpsPresent: true }} />);
    for (const label of ["IMU", "Hi-G", "Mag", "Baro", "GPS"]) expect(screen.getByText(label)).toBeInTheDocument();
    const dots = Array.from(container.querySelectorAll("span[class]")).filter((s) => s.textContent === "");
    expect(dots.length).toBeGreaterThanOrEqual(5);
  });
});

describe("IncomingPacketCard", () => {
  it("shows the packet text and LIVE", () => {
    renderWithProviders(<IncomingPacketCard rawPacket="12,34,56" live />);
    expect(screen.getByText("12,34,56")).toBeInTheDocument();
    expect(screen.getByText("LIVE")).toBeInTheDocument();
  });

  it("shows a dash and OFFLINE with no packet", () => {
    renderWithProviders(<IncomingPacketCard live={false} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("OFFLINE")).toBeInTheDocument();
  });
});

describe("AltitudeTrendPlaceholder", () => {
  it("shows the altitude with a unit, or a dash", () => {
    const view = renderWithProviders(<AltitudeTrendPlaceholder altitude={1234.56} />);
    expect(screen.getByText("1234.6")).toBeInTheDocument();
    expect(screen.getByText("m")).toBeInTheDocument();
    view.unmount();
    renderWithProviders(<AltitudeTrendPlaceholder />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("m")).not.toBeInTheDocument();
  });

  it("shows a real zero altitude", () => {
    renderWithProviders(<AltitudeTrendPlaceholder altitude={0} />);
    expect(screen.getByText("0.0")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------

describe("FlightGraph", () => {
  const initial = useNovaStore.getInitialState();
  const event = (name: string, timestamp?: number) => ({ name, timestamp });

  /** Record `n` seconds of telemetry, one sample per 100 ms. */
  function record(seconds: number, make: (i: number) => Partial<FlightTelemetry>) {
    startFlightRecorder();
    for (let i = 0; i < seconds * 10; i++) {
      useNovaStore.getState().ingestFlightData(make(i) as FlightTelemetry);
      vi.advanceTimersByTime(100);
    }
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000_000);
    useNovaStore.setState(initial, true);
    clearFlightRecord();
  });
  afterEach(() => {
    stopFlightRecorder();
    clearFlightRecord();
    vi.useRealTimers();
  });

  // The chart is created after an async import, and data is pushed on the next
  // 200 ms record tick, so let both happen.
  const settle = async () => {
    await act(async () => {});
    await act(async () => {
      vi.advanceTimersByTime(250);
    });
  };

  it("says nothing has been recorded yet", () => {
    renderWithProviders(<FlightGraph events={[]} launchEpochMs={null} />);
    expect(screen.getByText("No flight data recorded yet")).toBeInTheDocument();
    expect(FakeUPlot.instances).toHaveLength(0);
  });

  it("shows a rolling 60 s window before launch and the T+ clock after", () => {
    const view = renderWithProviders(<FlightGraph events={[]} launchEpochMs={null} />);
    expect(screen.getByText("Rolling 60s")).toBeInTheDocument();
    view.rerender(<FlightGraph events={[]} launchEpochMs={Date.now()} />);
    expect(screen.getByText("T+ mission clock")).toBeInTheDocument();
  });

  it("draws a chart once there is more than one sample, with the default series", async () => {
    record(3, (i) => ({ altitude: i, pressure: 1000 }));
    renderWithProviders(<FlightGraph events={[]} launchEpochMs={null} />);
    await settle();
    expect(FakeUPlot.instances.length).toBeGreaterThan(0);
    expect(FakeUPlot.last.opts.series.slice(1).map((s: { label: string }) => s.label)).toEqual(["Altitude", "Velocity", "Accel Magnitude"]);
  });

  it("scales each series to a percentage of its own range, leaving a gap where there is no data", async () => {
    record(3, (i) => ({ altitude: i * 10 }));
    renderWithProviders(<FlightGraph events={[]} launchEpochMs={null} />);
    await settle();
    const data = FakeUPlot.last.setDataCalls.at(-1)! as unknown as Float64Array[];
    const altitude = Array.from(data[1]);
    expect(Math.min(...altitude)).toBeCloseTo(0);
    expect(Math.max(...altitude)).toBeCloseTo(100);
    expect(Array.from(data[3]).every(Number.isNaN)).toBe(true); // no accelerometer was recorded
  });

  it("lists each series' range in the legend, or a dash", async () => {
    record(3, (i) => ({ altitude: i }));
    renderWithProviders(<FlightGraph events={[]} launchEpochMs={null} />);
    await settle();
    expect(screen.getByText(/0\.0–29\.0 m/)).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("rebuilds the chart when a series is switched on or off", async () => {
    record(3, (i) => ({ altitude: i, pressure: 1000 + i }));
    renderWithProviders(<FlightGraph events={[]} launchEpochMs={null} />);
    await settle();
    const before = FakeUPlot.instances.length;
    const pressure = screen.getAllByText("Pressure").map((n) => n.closest("label")).find(Boolean)!.querySelector("input")!;
    fireEvent.click(pressure);
    await settle();
    expect(FakeUPlot.instances.length).toBeGreaterThan(before);
    expect(FakeUPlot.last.opts.series.map((s: { label: string }) => s.label)).toContain("Pressure");
  });

  it("marks launch on the chart once it is detected", async () => {
    record(3, (i) => ({ altitude: i }));
    renderWithProviders(<FlightGraph events={[]} launchEpochMs={Date.now() - 1500} />);
    await settle();
    expect(FakeUPlot.last.over.querySelector(".nova-event-marker")?.textContent).toBe("LAUNCH");
  });

  it("marks backend events, and lets each kind be switched off", async () => {
    record(3, (i) => ({ altitude: i }));
    renderWithProviders(<FlightGraph events={[event("apogee", Date.now() - 1000)]} launchEpochMs={null} />);
    await settle();
    expect(FakeUPlot.last.over.textContent).toContain("apogee");
    expect(screen.getByText("Events")).toBeInTheDocument();
    fireEvent.click(screen.getAllByText("apogee").map((n) => n.closest("label")).find(Boolean)!.querySelector("input")!);
    await settle();
    expect(FakeUPlot.last.over.textContent).not.toContain("apogee");
  });

  it("ignores events that have no time", async () => {
    record(3, (i) => ({ altitude: i }));
    renderWithProviders(<FlightGraph events={[event("mystery")]} launchEpochMs={null} />);
    await settle();
    expect(FakeUPlot.last.over.textContent).not.toContain("mystery");
  });

  it("shows no events section without events", () => {
    renderWithProviders(<FlightGraph events={[]} launchEpochMs={null} />);
    expect(screen.queryByText("Events")).not.toBeInTheDocument();
  });

  it("labels the time axis relative to launch", async () => {
    record(3, (i) => ({ altitude: i }));
    const launch = Date.now() - 1000;
    renderWithProviders(<FlightGraph events={[]} launchEpochMs={launch} />);
    await settle();
    const values = FakeUPlot.last.opts.axes[0].values;
    const t0 = launch / 1000;
    expect(values({}, [t0 - 65, t0, t0 + 125])).toEqual(["T-01:05", "T+00:00", "T+02:05"]);
    expect(FakeUPlot.last.opts.axes[1].values({}, [0, 50, 100])).toEqual(["0%", "50%", "100%"]);
  });

  it("clears the recorded history", async () => {
    record(3, (i) => ({ altitude: i }));
    renderWithProviders(<FlightGraph events={[]} launchEpochMs={null} />);
    expect(getFlightSeries().tsSec.length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText("Clear history"));
    expect(getFlightSeries().tsSec).toHaveLength(0);
  });

  // Known gap: one click discards the whole recorded flight history with no
  // confirmation; it cannot be recovered afterwards.
  it.fails("asks before discarding the recorded history", () => {
    record(3, (i) => ({ altitude: i }));
    renderWithProviders(<FlightGraph events={[]} launchEpochMs={null} />);
    fireEvent.click(screen.getByText("Clear history"));
    expect(getFlightSeries().tsSec.length).toBeGreaterThan(0);
  });
});

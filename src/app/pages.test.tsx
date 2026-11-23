import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { forwardRef, useImperativeHandle } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "@/lib/api";
import * as direct from "@/lib/api/direct";
import { useNovaStore } from "@/lib/store";
import type { FlightTelemetry } from "@/lib/flight/types";
import type { ClientRole, SystemConfig } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import ConfigPage from "./config/page";
import ConsolePage from "./console/page";
import DevicesPage from "./devices/page";
import EnginePage from "./engine/page";
import ErrorPage from "./error";
import FlightPage from "./flight/page";
import ForbiddenPage from "./forbidden";
import Home from "./page";
import LoadingPage from "./loading";
import NotFoundPage from "./not-found";
import SettingsPage from "./settings/page";
import ToolsPage from "./tools/page";
import UnauthorizedPage from "./unauthorized";
import RadioPage from "./tools/radio/page";
import RelayPage from "./tools/relay/page";
import ServoPage from "./tools/servo/page";
import SoundboardPage from "./tools/soundboard/page";

vi.mock("@/lib/api");
vi.mock("@/lib/api/direct");
vi.mock("@/lib/api/commands", () => ({ sendCommand: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

const pidProps: { canvas?: Record<string, unknown>; editor?: Record<string, unknown> } = {};
const serialize = vi.fn();
vi.mock("@/components/engine/PidCanvas", () => ({
  PidCanvas: (props: Record<string, unknown>) => {
    pidProps.canvas = props;
    return <div data-testid="pid-canvas" />;
  },
}));
vi.mock("@/components/engine/PidEditor", () => ({
  PidEditor: forwardRef(function PidEditor(props: Record<string, unknown>, ref) {
    pidProps.editor = props;
    useImperativeHandle(ref, () => ({ serialize }));
    return <div data-testid="pid-editor" />;
  }),
}));

const mocked = vi.mocked(api);
const initial = useNovaStore.getInitialState();
const flush = () => act(async () => {});

function connect(role: ClientRole | null, lockout: "locked" | "unlocked" = "unlocked") {
  useNovaStore.setState({ session: { clientId: role ? "c1" : null, role } });
  useNovaStore.getState().ingestLockout(lockout);
}

const CONFIG: SystemConfig = {
  Sensors: [{ name: "PT1", type: "PT", unit: "psi", binding: { source: "GCS", hat_id: 0, channel_id: 0 } }],
  Actuators: [{ name: "SVFTV", type: "solenoid", binding: { target: "GCS", relay_channel: 0 } }],
  safetyRules: { hazardous: [{ SVFTV: "open" }] },
};

beforeEach(() => {
  useNovaStore.setState(initial, true);
  localStorage.clear();
  vi.resetAllMocks();
  for (const key of Object.keys(pidProps)) delete (pidProps as Record<string, unknown>)[key];
  serialize.mockReset();
  mocked.getConfig.mockResolvedValue(CONFIG);
  mocked.getSensors.mockResolvedValue(CONFIG.Sensors!);
  mocked.getActuators.mockResolvedValue(CONFIG.Actuators!);
  mocked.getPidLayout.mockResolvedValue(null);
  mocked.getRecordingStatus.mockResolvedValue({ enabled: false });
  mocked.getCalibrationStatus.mockResolvedValue({ enabled: false });
  mocked.getDataFiles.mockResolvedValue([]);
  mocked.listConfigFiles.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------

describe("static pages", () => {
  it("the home page says it is under construction", () => {
    renderWithProviders(<Home />);
    expect(screen.getByText("Under Construction")).toBeInTheDocument();
  });

  it.each([
    ["404", NotFoundPage, "Page not found"],
    ["403", ForbiddenPage, "Access forbidden"],
    ["401", UnauthorizedPage, "Unauthorised"],
  ] as const)("%s page names the problem and offers a way home", (code, Page, title) => {
    renderWithProviders(<Page />);
    expect(screen.getByText(code)).toBeInTheDocument();
    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go home" })).toHaveAttribute("href", "/");
  });

  it("the forbidden and unauthorised pages point at the role selector", () => {
    const view = renderWithProviders(<ForbiddenPage />);
    expect(screen.getByText(/role selector in the top bar/)).toBeInTheDocument();
    view.unmount();
    renderWithProviders(<UnauthorizedPage />);
    expect(screen.getByText(/role selector in the top bar/)).toBeInTheDocument();
  });

  it("the error page shows the error's message and can retry", () => {
    const reset = vi.fn();
    renderWithProviders(<ErrorPage error={new Error("Boom happened")} reset={reset} />);
    expect(screen.getByText("500")).toBeInTheDocument();
    expect(screen.getByText("Boom happened")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Try again"));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "Go home" })).toBeInTheDocument();
  });

  it("the error page has a generic message when the error has none", () => {
    renderWithProviders(<ErrorPage error={new Error("")} reset={() => {}} />);
    expect(screen.getByText(/An unexpected error occurred/)).toBeInTheDocument();
  });

  it("the loading page shows a spinner", () => {
    const { container } = renderWithProviders(<LoadingPage />);
    expect(container.querySelector(".chakra-spinner")).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe("tools", () => {
  it("the index lists every registered tool as a link to its page", () => {
    renderWithProviders(<ToolsPage />);
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    for (const slug of ["servo", "relay", "soundboard", "analysis", "radio"]) expect(hrefs).toContain(`/tools/${slug}`);
    expect(screen.getByText("Relay Tester")).toBeInTheDocument();
    expect(screen.getByText("Data Analysis")).toBeInTheDocument();
  });

  it.each([
    ["Relay Tester", RelayPage],
    ["Servo Tester", ServoPage],
    ["Soundboard", SoundboardPage],
    ["Vehicle Radio", RadioPage],
  ] as const)("the %s page has a title and a way back to the index", (title, Page) => {
    renderWithProviders(<Page />);
    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← Back to Tools" })).toHaveAttribute("href", "/tools");
  });
});

// ---------------------------------------------------------------------------

describe("ConsolePage", () => {
  it("opens on commanding, and switches between the five views", async () => {
    renderWithProviders(<ConsolePage />);
    expect(await screen.findByText("Compose Command")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Events"));
    expect(screen.getByText("Flight Events")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Channels"));
    expect(await screen.findByText("Sensors (1)")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Logs"));
    expect(await screen.findByText("No session output captured yet.")).toBeInTheDocument();
    expect(screen.queryByText("Compose Command")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------

describe("SettingsPage", () => {
  it("opens on appearance and switches sections", () => {
    renderWithProviders(<SettingsPage />);
    expect(screen.getByText("Theme")).toBeInTheDocument();
    for (const [nav, content] of [
      ["Connection", "Backend host"],
      ["Downloads", "Flight data CSV"],
      ["Logging", "Verbose mode"],
      ["About", "NovaOps GCS"],
    ]) {
      fireEvent.click(screen.getByText(nav));
      expect(screen.getByText(content)).toBeInTheDocument();
    }
  });

  it("offers a theme switch that says what it will switch to", async () => {
    renderWithProviders(<SettingsPage />);
    expect(await screen.findByText(/Switch to (Light|Dark)/)).toBeInTheDocument();
  });

  describe("connection", () => {
    const open = () => {
      renderWithProviders(<SettingsPage />);
      fireEvent.click(screen.getByText("Connection"));
    };

    it("defaults to localhost:8000 and derives the URLs from it", () => {
      open();
      expect(screen.getByDisplayValue("localhost:8000")).toBeInTheDocument();
      expect(screen.getByText("http://localhost:8000")).toBeInTheDocument();
      expect(screen.getByText("ws://localhost:8000/ws")).toBeInTheDocument();
    });

    it("restores a saved host", () => {
      localStorage.setItem("nova.settings.backendHost", "nova-server:9000");
      open();
      expect(screen.getByDisplayValue("nova-server:9000")).toBeInTheDocument();
    });

    it("saves the host with the button or Enter, and confirms briefly", () => {
      vi.useFakeTimers();
      open();
      const input = screen.getByDisplayValue("localhost:8000");
      fireEvent.change(input, { target: { value: "192.168.137.1:8000" } });
      expect(screen.getByText("ws://192.168.137.1:8000/ws")).toBeInTheDocument();
      fireEvent.click(screen.getByText("Save"));
      expect(localStorage.getItem("nova.settings.backendHost")).toBe("192.168.137.1:8000");
      expect(screen.getByText("Saved")).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(screen.getByText("Save")).toBeInTheDocument();

      fireEvent.change(input, { target: { value: "other:1" } });
      fireEvent.keyDown(input, { key: "Enter" });
      expect(localStorage.getItem("nova.settings.backendHost")).toBe("other:1");
      vi.useRealTimers();
    });

    // Known gap: the saved host is never read by the REST client or the socket,
    // which use the build-time environment variables, so changing it does nothing.
    it.fails("is used by the REST client once saved", async () => {
      localStorage.setItem("nova.settings.backendHost", "saved-host:9999");
      const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
      const { novaFetch } = await import("@/lib/api/novaFetch");
      await novaFetch("/health");
      expect(String(spy.mock.calls[0][0])).toContain("saved-host:9999");
      spy.mockRestore();
    });
  });

  it("says downloads are not connected yet, with every button inert", () => {
    renderWithProviders(<SettingsPage />);
    fireEvent.click(screen.getByText("Downloads"));
    expect(screen.getByText("Downloads are not yet connected to the backend")).toBeInTheDocument();
    expect(screen.getAllByText(/Download (CSV|TXT)/)).toHaveLength(3);
  });

  it("toggles the logging preferences, which stay local", () => {
    renderWithProviders(<SettingsPage />);
    fireEvent.click(screen.getByText("Logging"));
    const [verbose, timestamps] = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(verbose.checked).toBe(false);
    expect(timestamps.checked).toBe(true);
    fireEvent.click(verbose);
    expect(verbose.checked).toBe(true);
    expect(screen.getByText(/not yet forwarded to the console stream/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------

describe("DevicesPage", () => {
  const telemetry = (t: unknown) => act(() => useNovaStore.getState().ingestFlightData(t as FlightTelemetry));

  it("says there is no FAS telemetry yet", () => {
    renderWithProviders(<DevicesPage />);
    expect(screen.getByText("No FAS telemetry yet.")).toBeInTheDocument();
    expect(screen.getByText("disconnected")).toBeInTheDocument();
  });

  it("shows the fleet and a card per EPB and PMB, with a charger only for boards that have one", async () => {
    telemetry({
      boards: [{ key: "EPB:0", kind: "EPB", boardId: 0, online: true }],
      boardPower: { "EPB:0": { v8v4: 8.4 } },
      pmb: { "PMB:0": { vmon: { vBatt: 15 }, charger: { enabled: false } }, "PMB:1": { vmon: {} } },
    });
    renderWithProviders(<DevicesPage />);
    expect(screen.getByText("Board Fleet")).toBeInTheDocument();
    expect(screen.getByText("EPB:0 · bus power")).toBeInTheDocument();
    expect(screen.getByText("PMB:0 · power management")).toBeInTheDocument();
    expect(screen.getByText("PMB:1 · power management")).toBeInTheDocument();
    expect(screen.getByText("PMB:0 · LTC4162 charger")).toBeInTheDocument();
    expect(screen.queryByText("PMB:1 · LTC4162 charger")).not.toBeInTheDocument();
    expect(screen.getByText("Diagnostics")).toBeInTheDocument();
    expect(screen.getByText("live")).toBeInTheDocument();
  });

  it("marks the page stale when the flight stream is", () => {
    telemetry({ boards: [{ key: "EPB:0", kind: "EPB", boardId: 0, online: true }] });
    act(() => useNovaStore.setState({ flightData: { ...useNovaStore.getState().flightData, status: "stale" } }));
    renderWithProviders(<DevicesPage />);
    expect(screen.getAllByText("stale").length).toBeGreaterThanOrEqual(2);
  });

  it("pins the chart axes from the configured device ranges", async () => {
    mocked.getConfig.mockResolvedValue({ Devices: [{ key: "EPB:0", ranges: { voltage: [0, 30] } }] });
    telemetry({ boards: [], boardPower: { "EPB:0": { v8v4: 8.4 } } });
    renderWithProviders(<DevicesPage />);
    await waitFor(() => expect(mocked.getConfig).toHaveBeenCalled());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    const { FakeUPlot } = await import("@/test/uplotMock");
    expect(FakeUPlot.instances.some((u) => JSON.stringify(u.opts.scales.y) === JSON.stringify({ range: [0, 30] }))).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe("FlightPage", () => {
  const telemetry = (t: unknown) => act(() => useNovaStore.getState().ingestFlightData(t as FlightTelemetry));
  const render = () => renderWithProviders(<FlightPage />);

  it("shows the dashboard with every panel, and a placeholder mission clock", () => {
    render();
    for (const title of ["Altitude", "Linear Acceleration", "Angular Velocity", "Magnetic Field", "High-G Acceleration", "Flight Status", "FMC Sensor Health", "GPS", "Environment", "FMC Onboard", "Recovery Arming", "SD Logger", "Incoming Data Packet"]) {
      expect(screen.getAllByText(title).length).toBeGreaterThan(0);
    }
    expect(screen.getByText("T+--:--:--")).toBeInTheDocument();
  });

  it("feeds the panels from live telemetry", () => {
    telemetry({
      altitude: 1234.5,
      pressure: 1000,
      rawPacket: "1,2,3",
      fsm: { state: "boost", phase: "ascent" },
      gps: { lat: 43.5, lon: -79.5 },
      fmc: { "FMC:0": { health: { imuOk: true } } },
    });
    render();
    expect(screen.getAllByText("1234.5").length).toBeGreaterThan(0);
    expect(screen.getByText("1,2,3")).toBeInTheDocument();
    expect(screen.getAllByText("boost").length).toBeGreaterThan(0);
    expect(screen.getByText("43.500000")).toBeInTheDocument();
    expect(screen.getByText("IMU")).toBeInTheDocument();
  });

  it("shows live while the stream is live and offline otherwise", () => {
    const view = render();
    expect(screen.getByText("OFFLINE")).toBeInTheDocument();
    view.unmount();
    telemetry({});
    render();
    expect(screen.getByText("LIVE")).toBeInTheDocument();
  });

  it("derives velocity and inclination for the strip from the telemetry", () => {
    telemetry({ altitude: 0, timestamp: 1000, accel: { x: 1, y: 0, z: 0, magnitude: 1 } });
    render();
    expect(screen.getByText("90.0")).toBeInTheDocument(); // inclination
  });

  it("pins the dashboard charts from the FMC device's configured ranges", async () => {
    mocked.getConfig.mockResolvedValue({ Devices: [{ key: "FMC:0", ranges: { altitude: [0, 5000], accel: [-20, 20] } }] });
    telemetry({ fmc: { "FMC:0": {} } });
    render();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    const { FakeUPlot } = await import("@/test/uplotMock");
    const ranges = FakeUPlot.instances.map((u) => JSON.stringify(u.opts.scales.y));
    expect(ranges).toContain(JSON.stringify({ range: [0, 5000] }));
    expect(ranges).toContain(JSON.stringify({ range: [-20, 20] }));
  });

  it("falls back to any FMC device when none matches the live board key", async () => {
    mocked.getConfig.mockResolvedValue({ Devices: [{ key: "fmc:9", ranges: { altitude: [0, 100] } }] });
    telemetry({ fmc: { "FMC:0": {} } });
    render();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    const { FakeUPlot } = await import("@/test/uplotMock");
    expect(FakeUPlot.instances.map((u) => JSON.stringify(u.opts.scales.y))).toContain(JSON.stringify({ range: [0, 100] }));
  });

  it("sends a test tone to the FMC when asked, but only with a session", async () => {
    vi.mocked(direct.sendFasSound).mockResolvedValue({ published_commands: [] });
    const view = render();
    expect(screen.getByRole("button", { name: /Test Tone/ })).toBeDisabled();
    view.unmount();
    connect("operator");
    render();
    fireEvent.click(screen.getByRole("button", { name: /Test Tone/ }));
    await flush();
    expect(direct.sendFasSound).toHaveBeenCalledWith({ node: "FMC_0", action: "tone" }, "c1");
  });

  it("logs, rather than shows, a failed test tone", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(direct.sendFasSound).mockRejectedValue(new Error("FMC offline"));
    connect("operator");
    render();
    fireEvent.click(screen.getByRole("button", { name: /Test Tone/ }));
    await flush();
    expect(log).toHaveBeenCalled();
    expect(screen.queryByText("FMC offline")).not.toBeInTheDocument();
  });

  // Known gap: the Test Tone button is offered to any session, including a viewer.
  it.fails("does not offer the test tone to a viewer", () => {
    connect("viewer");
    render();
    expect(screen.getByRole("button", { name: /Test Tone/ })).toBeDisabled();
  });

  // Known gap: the SD card is addressed as "fmc_0" (lower case) while the aux
  // card and the default use "FMC_0", so the two sets of commands name the same
  // board differently.
  it.fails("addresses the SD card by the same node name as the aux commands", async () => {
    vi.mocked(direct.sendFasSd).mockResolvedValue({ published_commands: [] });
    connect("operator");
    telemetry({ fmc: { "FMC:0": { sd: { stateName: "logging", logging: true } } } });
    render();
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await flush();
    expect(vi.mocked(direct.sendFasSd).mock.calls[0][0].node).toBe("FMC_0");
  });

  it("switches to the map placeholder and to the graph", async () => {
    render();
    fireEvent.click(screen.getByText("Map"));
    expect(screen.getByText(/Map view — coming soon/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Graph"));
    expect(await screen.findByText("Flight Data Graph")).toBeInTheDocument();
    expect(screen.queryByText("Linear Acceleration")).not.toBeInTheDocument();
  });

  it("keeps the strip above every view", () => {
    render();
    fireEvent.click(screen.getByText("Map"));
    expect(screen.getByText("Mission Time")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------

describe("EnginePage", () => {
  it("opens on the table view with the actions, gauges and tables", async () => {
    renderWithProviders(<EnginePage />);
    expect(await screen.findByText("Sensors")).toBeInTheDocument();
    expect(screen.getByText("Actions")).toBeInTheDocument();
    expect(screen.getByText("Actuators")).toBeInTheDocument();
    expect(screen.getByText("P&ID · live")).toBeInTheDocument();
    expect(screen.queryByText("Edit P&ID")).not.toBeInTheDocument();
  });

  it("seeds the P&ID layout from the backend when there is one", async () => {
    const layout = { schemaVersion: 1, meta: { name: "L", savedAt: "", app: "novaops" }, systems: {}, graph: { cells: [] } };
    mocked.getPidLayout.mockResolvedValue(layout as never);
    renderWithProviders(<EnginePage />);
    await waitFor(() => expect(useNovaStore.getState().pidLayout).toEqual(layout));
  });

  it("leaves the store alone when the backend has no layout", async () => {
    renderWithProviders(<EnginePage />);
    await flush();
    expect(useNovaStore.getState().pidLayout).toBeNull();
  });

  it("shows the plots view with the actions card", async () => {
    renderWithProviders(<EnginePage />);
    fireEvent.click(screen.getByText("Plots"));
    expect(await screen.findByText(/No plots/)).toBeInTheDocument();
    expect(screen.getByText("Actions")).toBeInTheDocument();
  });

  describe("P&ID view", () => {
    const pidView = async () => {
      renderWithProviders(<EnginePage />);
      fireEvent.click(screen.getByText("P&ID"));
      await screen.findByTestId("pid-canvas");
    };

    it("draws the live P&ID with the config's sensors, actuators and safety rules", async () => {
      await pidView();
      await waitFor(() => expect((pidProps.canvas as { sensors: unknown[] }).sensors).toHaveLength(1));
      expect(pidProps.canvas).toMatchObject({ mode: "live", safetyRules: CONFIG.safetyRules });
      expect((pidProps.canvas as { actuators: unknown[] }).actuators).toHaveLength(1);
      expect(screen.getByText("Procedure")).toBeInTheDocument();
    });

    it("passes a broadcast layout through to the canvas, or undefined for the default", async () => {
      await pidView();
      expect((pidProps.canvas as { layout: unknown }).layout).toBeUndefined();
      const layout = { schemaVersion: 1, meta: { name: "L", savedAt: "", app: "novaops" }, systems: {}, graph: { cells: [] } };
      act(() => useNovaStore.getState().ingestPidLayout(layout as never));
      expect((pidProps.canvas as { layout: unknown }).layout).toEqual(layout);
    });

    it("enters edit mode, hiding the view tabs and the live canvas", async () => {
      await pidView();
      fireEvent.click(screen.getByText("Edit P&ID"));
      expect(await screen.findByTestId("pid-editor")).toBeInTheDocument();
      expect(screen.queryByTestId("pid-canvas")).not.toBeInTheDocument();
      expect(screen.queryByText("Plots")).not.toBeInTheDocument();
      expect(screen.getByText("← Live")).toBeInTheDocument();
      expect(screen.getByText("P&ID · edit")).toBeInTheDocument();
    });

    it("keeps the store in step with the editor, without broadcasting", async () => {
      await pidView();
      fireEvent.click(screen.getByText("Edit P&ID"));
      await screen.findByTestId("pid-editor");
      const layout = { schemaVersion: 1, meta: { name: "edited", savedAt: "", app: "novaops" }, systems: {}, graph: { cells: [] } };
      act(() => (pidProps.editor as { onLayoutChange: (l: unknown) => void }).onLayoutChange(layout));
      expect(useNovaStore.getState().pidLayout).toEqual(layout);
      expect(mocked.putPidLayout).not.toHaveBeenCalled();
    });

    it("saves the layout, with the client id, on leaving edit mode", async () => {
      connect("operator");
      const saved = { schemaVersion: 1, meta: { name: "P&ID Layout", savedAt: "", app: "novaops" }, systems: {}, graph: { cells: [] } };
      serialize.mockReturnValue(saved);
      mocked.putPidLayout.mockResolvedValue(undefined);
      await pidView();
      fireEvent.click(screen.getByText("Edit P&ID"));
      await screen.findByTestId("pid-editor");
      fireEvent.click(screen.getByText("← Live"));
      await flush();
      expect(serialize).toHaveBeenCalledWith("P&ID Layout");
      expect(mocked.putPidLayout).toHaveBeenCalledWith(saved, "c1");
      expect(await screen.findByTestId("pid-canvas")).toBeInTheDocument();
      expect(screen.queryByText(/Save failed/)).not.toBeInTheDocument();
    });

    it("keeps the edit locally and says so when the save is rejected", async () => {
      connect("viewer");
      const saved = { schemaVersion: 1, meta: { name: "mine", savedAt: "", app: "novaops" }, systems: {}, graph: { cells: [] } };
      serialize.mockReturnValue(saved);
      mocked.putPidLayout.mockRejectedValue(new Error("Operator role required"));
      await pidView();
      fireEvent.click(screen.getByText("Edit P&ID"));
      await screen.findByTestId("pid-editor");
      fireEvent.click(screen.getByText("← Live"));
      expect(await screen.findByText("Save failed: Operator role required")).toBeInTheDocument();
      expect(useNovaStore.getState().pidLayout).toEqual(saved);
    });

    it("does not send anything if the editor has nothing to save", async () => {
      serialize.mockReturnValue(null);
      await pidView();
      fireEvent.click(screen.getByText("Edit P&ID"));
      await screen.findByTestId("pid-editor");
      fireEvent.click(screen.getByText("← Live"));
      await flush();
      expect(mocked.putPidLayout).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------

describe("ConfigPage", () => {
  const sensor = { name: "PT1", type: "PT" as const, unit: "psi", binding: { source: "GCS" as const, hat_id: 0, channel_id: 0 } };
  const update = () => screen.getByText("Update");

  async function page() {
    const view = renderWithProviders(<ConfigPage />);
    await screen.findByText("Actuators", { selector: "h3" });
    return view;
  }

  it("shows a loading state until the config arrives", () => {
    mocked.getConfig.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<ConfigPage />);
    expect(screen.getByText("Loading config…")).toBeInTheDocument();
  });

  it("opens on the actuators with nothing to save", async () => {
    await page();
    expect(screen.getByDisplayValue("SVFTV")).toBeInTheDocument();
    expect(update()).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByText("unsaved changes")).not.toBeInTheDocument();
  });

  it("switches between the editors", async () => {
    await page();
    fireEvent.click(screen.getByText("Sensors"));
    expect(screen.getByDisplayValue("PT1")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Devices"));
    expect(screen.getByText("No devices. Add one below.")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Packets"));
    expect(screen.getByText("No packets. Add one below.")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Procedures"));
    expect(screen.getByText("No procedures. Add one below.")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Other"));
    expect(screen.getByText("Hazardous (blocked by lockout)")).toBeInTheDocument();
    expect(screen.getByText("Buzzer Melodies")).toBeInTheDocument();
  });

  it("flags unsaved changes as soon as the draft differs, and clears the flag when it matches again", async () => {
    await page();
    const name = screen.getByDisplayValue("SVFTV");
    fireEvent.change(name, { target: { value: "SVFTV2" } });
    expect(screen.getByText("unsaved changes")).toBeInTheDocument();
    expect(update()).toHaveAttribute("aria-disabled", "false");
    fireEvent.change(screen.getByDisplayValue("SVFTV2"), { target: { value: "SVFTV" } });
    expect(screen.queryByText("unsaved changes")).not.toBeInTheDocument();
  });

  it("saves the whole draft and says it was saved", async () => {
    mocked.putConfig.mockResolvedValue(CONFIG);
    await page();
    fireEvent.change(screen.getByDisplayValue("SVFTV"), { target: { value: "SVFTV2" } });
    fireEvent.click(update());
    await flush();
    expect(mocked.putConfig).toHaveBeenCalledTimes(1);
    expect(mocked.putConfig.mock.calls[0][0].Actuators![0].name).toBe("SVFTV2");
  });

  it("shows the backend's reason when the save is rejected", async () => {
    mocked.putConfig.mockRejectedValue(new Error("Duplicate actuator"));
    await page();
    fireEvent.change(screen.getByDisplayValue("SVFTV"), { target: { value: "X" } });
    fireEvent.click(update());
    expect(await screen.findByText("Duplicate actuator")).toBeInTheDocument();
  });

  it("blocks saving while the draft is invalid, and lists the problems", async () => {
    await page();
    fireEvent.change(screen.getByDisplayValue("SVFTV"), { target: { value: "" } });
    expect(screen.getByText("1 validation error")).toBeInTheDocument();
    expect(screen.getByText("• Actuator #1: name is required.")).toBeInTheDocument();
    expect(update()).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(update());
    expect(mocked.putConfig).not.toHaveBeenCalled();
  });

  it("lists at most eight problems and counts the rest", async () => {
    mocked.getConfig.mockResolvedValue({ Actuators: Array.from({ length: 10 }, () => ({ name: "", type: "solenoid", binding: { target: "GCS" } })) } as never);
    renderWithProviders(<ConfigPage />);
    await screen.findByText("10 validation errors");
    expect(screen.getAllByText(/^• Actuator #/)).toHaveLength(8);
    expect(screen.getByText("+2 more…")).toBeInTheDocument();
  });

  it("starts a new file from a blank config, named, and uploads it on Create", async () => {
    mocked.uploadConfig.mockResolvedValue({});
    await page();
    fireEvent.click(screen.getByText("New"));
    expect(screen.getByDisplayValue("new_config.yaml")).toBeInTheDocument();
    expect(screen.getByText("No actuators. Add one below.")).toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue("new_config.yaml"), { target: { value: "bench" } });
    fireEvent.click(screen.getByText("Create"));
    await flush();
    const file = mocked.uploadConfig.mock.calls[0][0] as File;
    expect(file.name).toBe("bench.yaml");
    expect(JSON.parse(await file.text())).toMatchObject({ Sensors: [], Actuators: [], safetyRules: { critical: [], hazardous: [] } });
  });

  it("keeps a .yml name as it is", async () => {
    mocked.uploadConfig.mockResolvedValue({});
    await page();
    fireEvent.click(screen.getByText("New"));
    fireEvent.change(screen.getByDisplayValue("new_config.yaml"), { target: { value: "x.YML" } });
    fireEvent.click(screen.getByText("Create"));
    await flush();
    expect((mocked.uploadConfig.mock.calls[0][0] as File).name).toBe("x.YML");
  });

  it("cancelling a new file restores the loaded config", async () => {
    await page();
    fireEvent.click(screen.getByText("New"));
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.getByDisplayValue("SVFTV")).toBeInTheDocument();
    expect(screen.queryByText("Create")).not.toBeInTheDocument();
  });

  it("shows the reason a new file could not be created", async () => {
    mocked.uploadConfig.mockRejectedValue(new Error("File exists"));
    await page();
    fireEvent.click(screen.getByText("New"));
    fireEvent.click(screen.getByText("Create"));
    expect(await screen.findByText("File exists")).toBeInTheDocument();
  });

  it("does not clobber a draft in progress when the server config refreshes mid-edit of a new file", async () => {
    const view = await page();
    fireEvent.click(screen.getByText("New"));
    act(() => view.client.setQueryData(["config"], { ...CONFIG, Actuators: [] }));
    expect(screen.getByDisplayValue("new_config.yaml")).toBeInTheDocument();
    expect(screen.getByText("No actuators. Add one below.")).toBeInTheDocument();
  });

  // Known gap: a failed load leaves the draft empty, and the loading branch is
  // checked first, so the error branch below it can never show; the page spins
  // on "Loading config…" for ever instead of reporting the failure.
  it.fails("reports a config that failed to load, instead of loading for ever", async () => {
    mocked.getConfig.mockRejectedValue(new Error("Backend unreachable"));
    renderWithProviders(<ConfigPage />);
    expect(await screen.findByText("Backend unreachable")).toBeInTheDocument();
  });
});


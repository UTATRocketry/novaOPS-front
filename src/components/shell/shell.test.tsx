import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { adaptFlightEvents, resetFlightSession } from "@/lib/flight";
import type { FlightTelemetry } from "@/lib/flight/types";
import { useNovaStore } from "@/lib/store";
import { renderWithProviders } from "@/test/render";
import { BatteryIndicator } from "./BatteryIndicator";
import { NavRail } from "./NavRail";
import { TopStatusBar } from "./TopStatusBar";

vi.mock("@/lib/api", () => ({
  assignRole: vi.fn(),
  getConfig: vi.fn(() => new Promise(() => {})),
  fasListPorts: vi.fn(),
  fasLinkStatus: vi.fn(),
  fasConfigurePort: vi.fn(),
  fasDisconnectPort: vi.fn(),
}));

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

const initial = useNovaStore.getInitialState();

const flight = (pmb: unknown) => ({ pmb }) as unknown as FlightTelemetry;
const setFlight = (data: FlightTelemetry | null) =>
  act(() => {
    if (data) useNovaStore.getState().ingestFlightData(data);
  });

beforeEach(() => {
  useNovaStore.setState(initial, true);
  resetFlightSession();
  pathname = "/";
});

afterEach(() => {
  vi.useRealTimers();
  resetFlightSession();
});

describe("BatteryIndicator", () => {
  const pmb = (vmon: Record<string, unknown>, extra: Record<string, unknown> = {}) => flight({ PMB_0: { vmon, ...extra } });

  it("shows a dash, not 0 V, when there is no reading", () => {
    renderWithProviders(<BatteryIndicator />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByTitle("Battery voltage unavailable")).toBeInTheDocument();
  });

  it("shows a dash while flight data exists but no PMB carries a voltage", () => {
    setFlight(flight({ PMB_0: { vmon: {} } }));
    renderWithProviders(<BatteryIndicator />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows the pack voltage to two decimals with its per-cell breakdown", () => {
    setFlight(pmb({ vBatt: 16.8 }, { charger: { cells: 4 } }));
    renderWithProviders(<BatteryIndicator />);
    expect(screen.getByText("16.80")).toBeInTheDocument();
    expect(screen.getByTitle("Battery 16.80 V · 4.20 V/cell × 4")).toBeInTheDocument();
  });

  it("shows the voltage without a per-cell figure when the cell count is unknown", () => {
    setFlight(pmb({ vBatt: 12.34 }));
    renderWithProviders(<BatteryIndicator />);
    expect(screen.getByTitle("Battery 12.34 V")).toBeInTheDocument();
  });

  it("takes the cell count from the charger config when the charger omits it", () => {
    setFlight(pmb({ vBatt: 12 }, { chgCfg: { cells: 3 } }));
    renderWithProviders(<BatteryIndicator />);
    expect(screen.getByTitle(/4\.00 V\/cell × 3/)).toBeInTheDocument();
  });

  it.each([
    [4.2, "battery_full"],
    [3.9, "battery_6_bar"],
    [3.6, "battery_4_bar"],
    [3.5, "battery_2_bar"], // at the warn threshold
    [3.3, "battery_alert"], // at the critical threshold
  ])("a %s V/cell pack on 4 cells shows %s", (perCell, glyph) => {
    setFlight(pmb({ vBatt: perCell * 4 }, { charger: { cells: 4 } }));
    renderWithProviders(<BatteryIndicator />);
    expect(screen.getByText(glyph)).toBeInTheDocument();
  });

  it("uses a neutral glyph when the cell count is unknown rather than guessing a level", () => {
    setFlight(pmb({ vBatt: 10 }));
    renderWithProviders(<BatteryIndicator />);
    expect(screen.getByText("battery_horiz_075")).toBeInTheDocument();
  });

  it("shows charging, and says so", () => {
    setFlight(pmb({ vBatt: 15 }, { charger: { cells: 4, charging: true } }));
    renderWithProviders(<BatteryIndicator />);
    expect(screen.getByText("battery_charging_full")).toBeInTheDocument();
    expect(screen.getByTitle(/· charging$/)).toBeInTheDocument();
  });

  it("reads the first board that has a voltage", () => {
    setFlight(flight({ A: { vmon: {} }, B: { vmon: { vBatt: 11.1 } } }));
    renderWithProviders(<BatteryIndicator />);
    expect(screen.getByText("11.10")).toBeInTheDocument();
  });

  it("updates as telemetry arrives", () => {
    renderWithProviders(<BatteryIndicator />);
    setFlight(pmb({ vBatt: 15.5 }));
    expect(screen.getByText("15.50")).toBeInTheDocument();
    setFlight(pmb({ vBatt: 14.9 }));
    expect(screen.getByText("14.90")).toBeInTheDocument();
  });
});

describe("TopStatusBar", () => {
  it("shows a placeholder mission clock until launch is detected", () => {
    renderWithProviders(<TopStatusBar />);
    expect(screen.getByText("T+--:--:--")).toBeInTheDocument();
  });

  it("shows the local time as HH:MM:SS and ticks every second", () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    vi.setSystemTime(new Date(2026, 0, 1, 9, 5, 7));
    renderWithProviders(<TopStatusBar />);
    expect(screen.getByText("09:05:07")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText("09:05:08")).toBeInTheDocument();
  });

  it("runs the mission clock from the detected launch", () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    vi.setSystemTime(new Date(2026, 0, 1, 12, 0, 0));
    adaptFlightEvents([{ name: "launch_detected" }]);
    renderWithProviders(<TopStatusBar />);
    expect(screen.getByText("T+00:00:00")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(3_723_000); // 1 h 2 min 3 s
    });
    expect(screen.getByText("T+01:02:03")).toBeInTheDocument();
  });

  it("goes back to the placeholder when the flight session resets", () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    adaptFlightEvents([{ name: "launch" }]);
    renderWithProviders(<TopStatusBar />);
    expect(screen.queryByText("T+--:--:--")).not.toBeInTheDocument();
    resetFlightSession();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText("T+--:--:--")).toBeInTheDocument();
  });

  it.each([
    ["disconnected", "OFFLINE"],
    ["connecting", "CONNECTING"],
    ["open", "CONNECTED"],
    ["error", "ERROR"],
  ] as const)("shows socket status %s as %s", (status, label) => {
    useNovaStore.setState({ socket: { status, lastError: null, reconnectAttempt: 0 } });
    renderWithProviders(<TopStatusBar />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("follows the connection live", () => {
    renderWithProviders(<TopStatusBar />);
    expect(screen.getByText("OFFLINE")).toBeInTheDocument();
    act(() => useNovaStore.getState().markOpen());
    expect(screen.getByText("CONNECTED")).toBeInTheDocument();
  });

  it("shows a dash for signal strength while the backend does not report one", () => {
    renderWithProviders(<TopStatusBar />);
    // Signal, battery and the role pill all fall back to a dash with no data.
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });

  it("shows the session role, or a dash with no session", () => {
    renderWithProviders(<TopStatusBar />);
    expect(screen.queryByText("OPERATOR")).not.toBeInTheDocument();
    act(() => useNovaStore.getState().ingestSession({ type: "session", role: "operator", client_id: "c1" }));
    expect(screen.getByText("OPERATOR")).toBeInTheDocument();
  });

  it("opens the role dialog from the role pill", async () => {
    act(() => useNovaStore.getState().ingestSession({ type: "session", role: "viewer", client_id: "c1" }));
    renderWithProviders(<TopStatusBar />);
    expect(screen.queryByText("Change Session Role")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("VIEWER"));
    expect(await screen.findByText("Change Session Role")).toBeInTheDocument();
  });

  it("shows the alert chips, and opening them sets the alert center open", () => {
    renderWithProviders(<TopStatusBar />);
    fireEvent.click(screen.getByRole("button", { name: "No active alerts" }));
    expect(useNovaStore.getState().alertCenterOpen).toBe(true);
  });

  it("has a colour-mode toggle", () => {
    renderWithProviders(<TopStatusBar />);
    expect(screen.getByRole("button", { name: "Toggle light / dark mode" })).toBeInTheDocument();
  });
});

describe("NavRail", () => {
  /** jsdom is 1024 px wide, under the 1100 px breakpoint, so the rail starts collapsed. */
  const expand = () => fireEvent.click(screen.getByRole("button", { name: "Expand navigation" }));

  it("links every page", () => {
    renderWithProviders(<NavRail />);
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/", "/engine", "/flight", "/devices", "/console", "/config", "/tools", "/settings"]);
  });

  it("starts collapsed on a narrow window, showing icons only", () => {
    renderWithProviders(<NavRail />);
    expect(screen.queryByText("Engine")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand navigation" })).toBeInTheDocument();
  });

  it("expands to show every label, and collapses again", () => {
    renderWithProviders(<NavRail />);
    expand();
    for (const label of ["Home", "Engine", "Flight", "Devices", "Console", "Config", "Tools", "Settings"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("button", { name: "Collapse navigation" }));
    expect(screen.queryByText("Engine")).not.toBeInTheDocument();
  });

  it("starts expanded on a wide window", () => {
    const original = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1600 });
    try {
      renderWithProviders(<NavRail />);
      expect(screen.getByText("Engine")).toBeInTheDocument();
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: original });
    }
  });

  // Known gap: collapsed links are icon-only with the icon hidden from assistive
  // technology, so a screen reader hears eight unlabeled links; the current page
  // is also shown by colour alone (no aria-current).
  it.fails("gives every link an accessible name, even when collapsed", () => {
    renderWithProviders(<NavRail />);
    for (const a of screen.getAllByRole("link")) expect(a).toHaveAccessibleName();
  });

  it.fails("marks the current page with aria-current", () => {
    pathname = "/engine";
    renderWithProviders(<NavRail />);
    expect(document.querySelector('a[href="/engine"]')).toHaveAttribute("aria-current", "page");
  });
});

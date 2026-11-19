import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationCenter } from "@/components/alerts";
import { AlertToaster } from "@/components/alerts/AlertToaster";
import { queryKeys } from "@/hooks/queryKeys";
import * as api from "@/lib/api";
import { emitAlertEvent } from "@/lib/alerts";
import type { FlightTelemetry } from "@/lib/flight/types";
import { useNovaStore } from "@/lib/store";
import type { ClientRole, SystemConfig } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { AppShell } from "./AppShell";
import { FasLinkControl } from "./FasLinkControl";

vi.mock("@/lib/api");

const sockets: Array<{ options: { onConfigUpdate?: (c: SystemConfig) => void }; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> = [];
vi.mock("@/lib/ws", () => ({
  NovaSocket: class {
    connect = vi.fn();
    disconnect = vi.fn();
    constructor(public options: { onConfigUpdate?: (c: SystemConfig) => void }) {
      sockets.push(this);
    }
  },
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

const mocked = vi.mocked(api);
const initial = useNovaStore.getInitialState();
const flush = () => act(async () => {});

function connect(role: ClientRole | null) {
  useNovaStore.setState({ session: { clientId: role ? "c1" : null, role } });
}

beforeEach(() => {
  vi.resetAllMocks();
  sockets.length = 0;
  useNovaStore.setState(initial, true);
  for (const fn of [mocked.fasListPorts, mocked.fasLinkStatus, mocked.fasConfigurePort, mocked.fasDisconnectPort]) {
    fn.mockResolvedValue({ published: true, action: "status" });
  }
  mocked.getConfig.mockResolvedValue({});
});

// ---------------------------------------------------------------------------

describe("FasLinkControl", () => {
  const open = async () => {
    fireEvent.click(screen.getByRole("button", { name: "Configure the FAS serial link" }));
    await screen.findByText("FAS Serial Link");
  };
  const portSelect = () => screen.getAllByRole("combobox")[0] as HTMLSelectElement;
  const baudSelect = () => screen.getAllByRole("combobox")[1] as HTMLSelectElement;

  describe("top-bar indicator", () => {
    it("shows an unknown link as a dash", () => {
      renderWithProviders(<FasLinkControl />);
      expect(screen.getByText("—")).toBeInTheDocument();
      expect(screen.getByTitle(/Link state unknown/)).toBeInTheDocument();
    });

    it.each([
      [{ connected: true, port: "COM3", baud: 9600, error: null }, "COM3"],
      [{ connected: false, port: "COM3", baud: null, error: "unplugged" }, "FAULT"],
      [{ connected: false, port: null, baud: null, error: null }, "NO PORT"],
    ])("shows link %j as '%s'", (link, label) => {
      act(() => useNovaStore.getState().ingestFasLink(link));
      renderWithProviders(<FasLinkControl />);
      expect(screen.getByText(label)).toBeInTheDocument();
    });

    it("updates live", () => {
      renderWithProviders(<FasLinkControl />);
      act(() => useNovaStore.getState().ingestFasLink({ connected: true, port: "COM7", baud: 9600, error: null }));
      expect(screen.getByText("COM7")).toBeInTheDocument();
    });

    it("does not open the dialog, or query the bridge, until clicked", () => {
      connect("operator");
      renderWithProviders(<FasLinkControl />);
      expect(screen.queryByText("FAS Serial Link")).not.toBeInTheDocument();
      expect(mocked.fasListPorts).not.toHaveBeenCalled();
    });
  });

  describe("dialog", () => {
    it("asks the bridge for its ports and link state every time it opens", async () => {
      connect("operator");
      renderWithProviders(<FasLinkControl />);
      await open();
      await waitFor(() => expect(mocked.fasListPorts).toHaveBeenCalledWith("c1"));
      expect(mocked.fasLinkStatus).toHaveBeenCalledWith("c1");
    });

    it("asks nothing and disables every control for a viewer, and says why", async () => {
      connect("viewer");
      renderWithProviders(<FasLinkControl />);
      await open();
      expect(mocked.fasListPorts).not.toHaveBeenCalled();
      expect(portSelect()).toBeDisabled();
      expect(baudSelect()).toBeDisabled();
      expect(screen.getByText("Operator or admin role required")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Connect" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Disconnect" })).toBeDisabled();
    });

    it("shows the state, the streaming badge and the explanation", async () => {
      connect("operator");
      act(() => {
        useNovaStore.getState().ingestFasLink({ connected: true, port: "COM3", baud: 115200, error: null });
        useNovaStore.getState().setFasStreaming(true);
      });
      renderWithProviders(<FasLinkControl />);
      await open();
      expect(screen.getByText("streaming")).toBeInTheDocument();
      expect(screen.getByText("Connected on COM3 @ 115200.")).toBeInTheDocument();
    });

    it("defaults the port to the one the bridge is on and the baud to what it reports", async () => {
      connect("operator");
      act(() => {
        useNovaStore.getState().ingestFasPorts([{ device: "COM4" }]);
        useNovaStore.getState().ingestFasLink({ connected: true, port: "COM9", baud: 115200, error: null });
      });
      renderWithProviders(<FasLinkControl />);
      await open();
      expect(portSelect().value).toBe("COM9");
      expect(Array.from(portSelect().options).map((o) => o.value)).toEqual(["COM9", "COM4", "__custom__"]);
      expect(baudSelect().value).toBe("115200");
    });

    it("falls back to the first enumerated port", async () => {
      connect("operator");
      act(() => useNovaStore.getState().ingestFasPorts([{ device: "COM3", description: "USB Serial" }, { device: "COM4" }]));
      renderWithProviders(<FasLinkControl />);
      await open();
      expect(portSelect().value).toBe("COM3");
      expect(screen.getByText("USB Serial")).toBeInTheDocument();
    });

    it("says no ports were found, and starts at the FAS default baud", async () => {
      connect("operator");
      renderWithProviders(<FasLinkControl />);
      await open();
      expect(screen.getByRole("option", { name: "No ports found" })).toBeInTheDocument();
      expect(baudSelect().value).toBe("460800");
    });

    it("connects with the chosen port and baud", async () => {
      connect("operator");
      act(() => useNovaStore.getState().ingestFasPorts([{ device: "COM3" }, { device: "COM4" }]));
      renderWithProviders(<FasLinkControl />);
      await open();
      fireEvent.change(portSelect(), { target: { value: "COM4" } });
      fireEvent.change(baudSelect(), { target: { value: "9600" } });
      fireEvent.click(screen.getByRole("button", { name: "Connect" }));
      await flush();
      expect(mocked.fasConfigurePort).toHaveBeenCalledWith("COM4", 9600, "c1");
    });

    it("lets a port that was not enumerated be typed, trimmed, and will not connect with it blank", async () => {
      connect("operator");
      renderWithProviders(<FasLinkControl />);
      await open();
      fireEvent.change(portSelect(), { target: { value: "__custom__" } });
      expect(screen.getByRole("button", { name: "Connect" })).toBeDisabled();
      fireEvent.change(screen.getByPlaceholderText("COM3 or /dev/ttyUSB0"), { target: { value: "  /dev/ttyUSB1 " } });
      fireEvent.click(screen.getByRole("button", { name: "Connect" }));
      await flush();
      expect(mocked.fasConfigurePort).toHaveBeenCalledWith("/dev/ttyUSB1", 460800, "c1");
    });

    it("does not connect with no port selected", async () => {
      connect("operator");
      renderWithProviders(<FasLinkControl />);
      await open();
      expect(screen.getByRole("button", { name: "Connect" })).toBeDisabled();
    });

    it("offers Reconnect and Disconnect only while connected", async () => {
      connect("operator");
      const view = renderWithProviders(<FasLinkControl />);
      await open();
      expect(screen.getByRole("button", { name: "Disconnect" })).toBeDisabled();
      act(() => useNovaStore.getState().ingestFasLink({ connected: true, port: "COM3", baud: 9600, error: null }));
      expect(screen.getByRole("button", { name: "Reconnect" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
      await flush();
      expect(mocked.fasDisconnectPort).toHaveBeenCalledWith("c1");
      view.unmount();
    });

    it("re-enumerates the ports on Refresh", async () => {
      connect("operator");
      renderWithProviders(<FasLinkControl />);
      await open();
      await waitFor(() => expect(mocked.fasListPorts).toHaveBeenCalledTimes(1));
      fireEvent.click(screen.getByText("Refresh"));
      await waitFor(() => expect(mocked.fasListPorts).toHaveBeenCalledTimes(2));
    });

    it("closes from the close button", async () => {
      connect("operator");
      renderWithProviders(<FasLinkControl />);
      await open();
      fireEvent.click(screen.getByRole("button", { name: "Close FAS link panel" }));
      await waitFor(() => expect(screen.queryByText("FAS Serial Link")).not.toBeInTheDocument());
    });
  });
});

// ---------------------------------------------------------------------------

describe("AlertToaster", () => {
  /** A dismissed toast animates out; jsdom never finishes that, so look at its state. */
  const gone = (title: string) => () => {
    const node = screen.queryByText(title);
    if (!node) return;
    expect(node.closest('[data-part="root"]')?.getAttribute("data-state")).toBe("closed");
  };

  const raise = (id: string, over: Record<string, unknown> = {}) =>
    act(() => useNovaStore.getState().reconcileConditionAlerts([{ id, severity: "warn", title: `${id} title`, source: "t", ...over }] as never));

  it("raises a toast for a new alert, with its title and detail", async () => {
    renderWithProviders(<AlertToaster />);
    raise("a", { detail: "something is wrong" });
    expect(await screen.findByText("a title")).toBeInTheDocument();
    expect(screen.getByText("something is wrong")).toBeInTheDocument();
  });

  it("raises each alert only once", async () => {
    renderWithProviders(<AlertToaster />);
    raise("dup");
    await screen.findByText("dup title");
    raise("dup", { detail: "changed" });
    await flush();
    expect(screen.getAllByText("dup title")).toHaveLength(1);
  });

  it("takes the toast down when the alert clears", async () => {
    renderWithProviders(<AlertToaster />);
    raise("gone");
    await screen.findByText("gone title");
    act(() => useNovaStore.getState().reconcileConditionAlerts([]));
    await waitFor(gone("gone title"));
  });

  it("takes the toast down when the alert is acknowledged elsewhere", async () => {
    renderWithProviders(<AlertToaster />);
    raise("ack");
    await screen.findByText("ack title");
    act(() => useNovaStore.getState().acknowledgeAlert("ack"));
    await waitFor(gone("ack title"));
  });

  it("raises no toast for an alert that is already acknowledged", async () => {
    act(() => {
      useNovaStore.getState().reconcileConditionAlerts([{ id: "old", severity: "warn", title: "old title", source: "t" }] as never);
      useNovaStore.getState().acknowledgeAlert("old");
    });
    renderWithProviders(<AlertToaster />);
    await flush();
    expect(screen.queryByText("old title")).not.toBeInTheDocument();
  });

  it("opens the alert center when a toast is clicked", async () => {
    renderWithProviders(<AlertToaster />);
    raise("click");
    fireEvent.click(await screen.findByText("click title"));
    expect(useNovaStore.getState().alertCenterOpen).toBe(true);
    await waitFor(gone("click title"));
  });
});

// ---------------------------------------------------------------------------

describe("NotificationCenter and the alert monitor", () => {
  const alertIds = () => useNovaStore.getState().alerts.map((a) => a.id);
  const pmb = (vmon: Record<string, unknown>, charger?: Record<string, unknown>) =>
    ({ pmb: { PMB_0: { vmon, charger } } }) as unknown as FlightTelemetry;

  it("turns live telemetry into condition alerts, and clears them when it recovers", async () => {
    renderWithProviders(<NotificationCenter />);
    act(() => useNovaStore.getState().ingestFlightData(pmb({ protect: true })));
    await waitFor(() => expect(alertIds()).toContain("battery:PMB_0:protect"));
    act(() => useNovaStore.getState().ingestFlightData(pmb({ protect: false })));
    await waitFor(() => expect(alertIds()).not.toContain("battery:PMB_0:protect"));
  });

  it("raises an alert for a transport error", async () => {
    renderWithProviders(<NotificationCenter />);
    act(() => useNovaStore.getState().setSocketError("boom"));
    await waitFor(() => expect(alertIds()).toContain("stream:link:error"));
  });

  it("raises an alert for a stale telemetry stream, but not for a plain disconnect", async () => {
    renderWithProviders(<NotificationCenter />);
    act(() => useNovaStore.getState().ingestEngineData([{ name: "PT1", value: 1, avg: 1, unit: "psi", timestamp: 0 }]));
    act(() => useNovaStore.setState({ engineData: { ...useNovaStore.getState().engineData, status: "stale" } }));
    await waitFor(() => expect(alertIds()).toContain("stream:engine:stale"));
    act(() => useNovaStore.getState().markDisconnected());
    await waitFor(() => expect(alertIds()).not.toContain("stream:engine:stale"));
  });

  it("turns bus events, such as an API error, into event alerts", async () => {
    renderWithProviders(<NotificationCenter />);
    act(() => emitAlertEvent({ severity: "error", title: "API error 503", source: "api" }));
    await waitFor(() => expect(useNovaStore.getState().alerts.some((a) => a.kind === "event" && a.title === "API error 503")).toBe(true));
  });

  it("stops listening to the bus when it unmounts", async () => {
    const view = renderWithProviders(<NotificationCenter />);
    view.unmount();
    act(() => emitAlertEvent({ severity: "error", title: "late", source: "api" }));
    expect(alertIds()).toEqual([]);
  });

  it("renders the alert center along with the toaster", async () => {
    renderWithProviders(<NotificationCenter />);
    act(() => useNovaStore.getState().setAlertCenterOpen(true));
    expect(await screen.findByText("No active alerts")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------

describe("AppShell", () => {
  afterEach(() => vi.useRealTimers());

  it("renders its page content between the navigation and the status bar", () => {
    renderWithProviders(
      <AppShell>
        <p>page body</p>
      </AppShell>,
    );
    expect(screen.getByText("page body")).toBeInTheDocument();
    expect(screen.getByRole("navigation")).toBeInTheDocument();
    expect(screen.getByRole("banner")).toBeInTheDocument();
  });

  it("opens one socket on mount and closes it on unmount", () => {
    const view = renderWithProviders(<AppShell><p /></AppShell>);
    expect(sockets).toHaveLength(1);
    expect(sockets[0].connect).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(sockets[0].disconnect).toHaveBeenCalledTimes(1);
  });

  it("writes a broadcast config straight into the REST cache, with no refetch", () => {
    const { client } = renderWithProviders(<AppShell><p /></AppShell>);
    const config: SystemConfig = {
      Sensors: [{ name: "PT9", type: "PT", binding: { source: "GCS", hat_id: 0, channel_id: 0 } }],
      Actuators: [{ name: "V9", type: "solenoid", binding: { target: "GCS", relay_channel: 0 } }],
    };
    act(() => sockets[0].options.onConfigUpdate!(config));
    expect(client.getQueryData(queryKeys.config)).toEqual(config);
    expect(client.getQueryData(queryKeys.sensors)).toEqual(config.Sensors);
    expect(client.getQueryData(queryKeys.actuators)).toEqual(config.Actuators);
  });

  it("caches empty lists for a broadcast config without sensors or actuators", () => {
    const { client } = renderWithProviders(<AppShell><p /></AppShell>);
    act(() => sockets[0].options.onConfigUpdate!({}));
    expect(client.getQueryData(queryKeys.sensors)).toEqual([]);
    expect(client.getQueryData(queryKeys.actuators)).toEqual([]);
  });

  it("runs the alert monitor, so telemetry problems reach the top bar", async () => {
    renderWithProviders(<AppShell><p /></AppShell>);
    act(() => useNovaStore.getState().setSocketError("down"));
    await waitFor(() => expect(screen.getByRole("button", { name: /active alert/ })).toBeInTheDocument());
  });
});

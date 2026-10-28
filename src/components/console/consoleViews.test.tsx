import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "@/lib/api";
import type { ConsoleLogEntry } from "@/lib/console";
import type { FlightTelemetry } from "@/lib/flight/types";
import { useNovaStore } from "@/lib/store";
import type { ActuatorEntry, SensorEntry } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { ChannelsTable } from "./ChannelsTable";
import { ConsoleStream } from "./ConsoleStream";
import { EventsLog } from "./EventsLog";
import { LogsViewer } from "./LogsViewer";
import { WsViewer } from "./WsViewer";

vi.mock("@/lib/api");
const mocked = vi.mocked(api);
const initial = useNovaStore.getInitialState();

const entry = (id: number, text: string, ts = new Date(2026, 0, 1, 9, 5, 7).getTime()): ConsoleLogEntry => ({
  id,
  ts,
  status: "info",
  kind: "activity",
  text,
});

beforeEach(() => {
  useNovaStore.setState(initial, true);
  useNovaStore.getState().clearConsole();
  vi.resetAllMocks();
});

// ---------------------------------------------------------------------------

describe("ConsoleStream", () => {
  it("shows the empty message", () => {
    renderWithProviders(<ConsoleStream entries={[]} emptyMessage="Waiting…" />);
    expect(screen.getByText("Waiting…")).toBeInTheDocument();
  });

  it("uses a default empty message", () => {
    renderWithProviders(<ConsoleStream entries={[]} />);
    expect(screen.getByText("No output.")).toBeInTheDocument();
  });

  it("shows each line with its HH:MM:SS time, in order", () => {
    renderWithProviders(<ConsoleStream entries={[entry(1, "first"), entry(2, "second", new Date(2026, 0, 1, 23, 59, 1).getTime())]} />);
    expect(screen.getByText("09:05:07")).toBeInTheDocument();
    expect(screen.getByText("23:59:01")).toBeInTheDocument();
    const text = document.body.textContent!;
    expect(text.indexOf("first")).toBeLessThan(text.indexOf("second"));
  });

  it("follows the newest line by scrolling to the bottom", () => {
    const view = renderWithProviders(<ConsoleStream entries={[entry(1, "a")]} />);
    const box = view.container.querySelector("div div") as HTMLElement;
    Object.defineProperty(box, "scrollHeight", { configurable: true, value: 500 });
    view.rerender(<ConsoleStream entries={[entry(1, "a"), entry(2, "b")]} />);
    expect(box.scrollTop).toBe(500);
  });

  it("leaves the scroll position alone when following is off", () => {
    const view = renderWithProviders(<ConsoleStream entries={[entry(1, "a")]} follow={false} />);
    const box = view.container.querySelector("div div") as HTMLElement;
    Object.defineProperty(box, "scrollHeight", { configurable: true, value: 500 });
    view.rerender(<ConsoleStream entries={[entry(1, "a"), entry(2, "b")]} follow={false} />);
    expect(box.scrollTop).toBe(0);
  });
});

// ---------------------------------------------------------------------------

describe("EventsLog", () => {
  const events = (list: Array<Record<string, unknown>>) =>
    act(() =>
      useNovaStore.getState().ingestFlightEvents({
        events: list as never,
        milestones: {} as never,
        launchEpochMs: null,
      }),
    );

  it("says no events were received", () => {
    renderWithProviders(<EventsLog />);
    expect(screen.getByText("No flight events received.")).toBeInTheDocument();
  });

  it("shows the stream's state in the header", () => {
    renderWithProviders(<EventsLog />);
    expect(screen.getByText("disconnected")).toBeInTheDocument();
    events([]);
    expect(screen.getByText("live")).toBeInTheDocument();
  });

  it("lists events newest first with their time, name and extra fields", () => {
    renderWithProviders(<EventsLog />);
    events([
      { name: "launch", timestamp: 100 },
      { name: "apogee", timestamp: 250, altitude: 3000 },
    ]);
    const names = screen.getAllByText(/^(launch|apogee)$/).map((n) => n.textContent);
    expect(names).toEqual(["apogee", "launch"]);
    expect(screen.getByText('{"altitude":3000}')).toBeInTheDocument();
    expect(screen.getByText("250")).toBeInTheDocument();
  });

  it("shows a dash for a missing time, and for an event with no extra fields", () => {
    renderWithProviders(<EventsLog />);
    events([{ name: "launch" }]);
    expect(screen.getAllByText("—")).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------

describe("LogsViewer", () => {
  const select = () => screen.getByRole("combobox") as HTMLSelectElement;
  const exportBtn = () => screen.getByText("Export CSV");

  beforeEach(() => {
    mocked.getDataFiles.mockResolvedValue(["a.csv", "b.csv"]);
    mocked.downloadDataFile.mockResolvedValue(new Blob(["x"]));
  });

  afterEach(() => {
    Reflect.deleteProperty(URL, "createObjectURL");
    Reflect.deleteProperty(URL, "revokeObjectURL");
  });

  it("says there is no session output yet", async () => {
    renderWithProviders(<LogsViewer />);
    expect(screen.getByText("No session output captured yet.")).toBeInTheDocument();
    await waitFor(() => expect(select().value).toBe("b.csv"));
  });

  it("shows the session's console output", () => {
    renderWithProviders(<LogsViewer />);
    act(() => {
      useNovaStore.setState({ consoleMessages: [entry(1, "hello from the bridge")] });
    });
    expect(screen.getByText("hello from the bridge")).toBeInTheDocument();
  });

  it("selects the newest file and says when there are none", async () => {
    mocked.getDataFiles.mockResolvedValue([]);
    renderWithProviders(<LogsViewer />);
    expect(await screen.findByText("No CSV files on the backend yet.")).toBeInTheDocument();
    expect(exportBtn().closest("button")).toHaveAttribute("aria-disabled", "true");
  });

  it("downloads the selected file under its own name", async () => {
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: revoke });
    let saved = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      saved = this.download;
    });
    renderWithProviders(<LogsViewer />);
    await waitFor(() => expect(select().value).toBe("b.csv"));
    fireEvent.change(select(), { target: { value: "a.csv" } });
    fireEvent.click(exportBtn());
    await waitFor(() => expect(saved).toBe("a.csv"));
    expect(mocked.downloadDataFile).toHaveBeenCalledWith("a.csv");
    expect(revoke).toHaveBeenCalledWith("blob:x");
  });

  it("shows why a download failed", async () => {
    mocked.downloadDataFile.mockRejectedValue(new Error("NovaOps API error 404"));
    renderWithProviders(<LogsViewer />);
    await waitFor(() => expect(select().value).toBe("b.csv"));
    fireEvent.click(exportBtn());
    expect(await screen.findByText("NovaOps API error 404")).toBeInTheDocument();
  });

  it("toggles auto-scroll", () => {
    renderWithProviders(<LogsViewer />);
    fireEvent.click(screen.getByText(/Auto-scroll on/));
    expect(screen.getByText(/Auto-scroll off/)).toBeInTheDocument();
  });

  it("refreshes the file list when the picker is focused", async () => {
    renderWithProviders(<LogsViewer />);
    await waitFor(() => expect(select().value).toBe("b.csv"));
    const calls = mocked.getDataFiles.mock.calls.length;
    fireEvent.focus(select());
    await waitFor(() => expect(mocked.getDataFiles.mock.calls.length).toBeGreaterThan(calls));
  });
});

// ---------------------------------------------------------------------------

describe("ChannelsTable", () => {
  const sensors: SensorEntry[] = [{ name: "PT1", type: "PT", unit: "psi", binding: { source: "GCS", hat_id: 0, channel_id: 0 } }];
  const actuators: ActuatorEntry[] = [{ name: "SVFTV", type: "solenoid", binding: { target: "GCS", relay_channel: 0 } }];

  beforeEach(() => {
    mocked.getSensors.mockResolvedValue(sensors);
    mocked.getActuators.mockResolvedValue(actuators);
    mocked.getConfig.mockResolvedValue({});
  });

  const rowOf = (text: string) => screen.getByText(text).closest("tr")!;

  it("lists configured sensors and actuators with counts, and starts with no values", async () => {
    renderWithProviders(<ChannelsTable />);
    expect(await screen.findByText("Sensors (1)")).toBeInTheDocument();
    expect(screen.getByText("Actuators (1)")).toBeInTheDocument();
    expect(within(rowOf("PT1")).getAllByText("—").length).toBeGreaterThan(0);
  });

  it("shows a sensor's value and unit, and marks it live", async () => {
    act(() => useNovaStore.getState().ingestEngineData([{ name: "PT1", value: 101.5, avg: 101.5, unit: "bar", timestamp: 1 }]));
    renderWithProviders(<ChannelsTable />);
    await screen.findByText("PT1");
    expect(within(rowOf("PT1")).getByText("101.5 bar")).toBeInTheDocument();
    expect(within(rowOf("PT1")).getByText("live")).toBeInTheDocument();
  });

  it("marks a reading stale when the stream has gone quiet, and neutral when disconnected", async () => {
    act(() => useNovaStore.getState().ingestEngineData([{ name: "PT1", value: 5, avg: 5, unit: "psi", timestamp: 1 }]));
    renderWithProviders(<ChannelsTable />);
    await screen.findByText("PT1");
    act(() => useNovaStore.setState({ engineData: { ...useNovaStore.getState().engineData, status: "stale" } }));
    expect(within(rowOf("PT1")).getByText("stale")).toBeInTheDocument();
    act(() => useNovaStore.getState().markDisconnected());
    expect(within(rowOf("PT1")).queryByText("stale")).not.toBeInTheDocument();
    expect(within(rowOf("PT1")).queryByText("live")).not.toBeInTheDocument();
  });

  it("summarises an actuator's reported state", async () => {
    act(() =>
      useNovaStore.getState().ingestActuatorStates({
        type: "actuator_states",
        actuator_states: { SVFTV: { position: "open", power: "on" } } as never,
      }),
    );
    renderWithProviders(<ChannelsTable />);
    await screen.findByText("SVFTV");
    expect(within(rowOf("SVFTV")).getByText("open · on")).toBeInTheDocument();
  });

  it("lists FAS boards, calling a board online only while the flight stream is live", async () => {
    const boards = [{ key: "EPB:0", kind: "EPB", boardId: 0, online: true, fwVersion: 3, numChannels: 8, numSensors: 6, uptimeMs: 3_661_000 }];
    act(() => useNovaStore.getState().ingestFlightData({ boards } as unknown as FlightTelemetry));
    renderWithProviders(<ChannelsTable />);
    expect(await screen.findByText("Devices (1)")).toBeInTheDocument();
    expect(within(rowOf("EPB:0")).getByText("01:01:01")).toBeInTheDocument();
    expect(within(rowOf("EPB:0")).getByText("online")).toBeInTheDocument();
    act(() => useNovaStore.setState({ flightData: { ...useNovaStore.getState().flightData, status: "stale" } }));
    expect(within(rowOf("EPB:0")).getByText("stale")).toBeInTheDocument();
  });

  it("says when no boards are reported", async () => {
    renderWithProviders(<ChannelsTable />);
    expect(await screen.findByText("No FAS boards reported.")).toBeInTheDocument();
  });

  it("lists the configured packets, or says how to add some", async () => {
    mocked.getConfig.mockResolvedValue({ Packets: [{ name: "PWM", op: "pwm_set", fields: [{ key: "channel", type: "number" }, { key: "pulse_us", type: "number" }] }] });
    const view = renderWithProviders(<ChannelsTable />);
    expect(await screen.findByText("Packets (1)")).toBeInTheDocument();
    expect(screen.getByText("channel, pulse_us")).toBeInTheDocument();
    view.unmount();
    mocked.getConfig.mockResolvedValue({});
    renderWithProviders(<ChannelsTable />);
    expect(await screen.findByText(/No packets defined/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------

describe("WsViewer", () => {
  class FakeWebSocket {
    static instances: FakeWebSocket[] = [];
    onopen: (() => void) | null = null;
    onmessage: ((e: { data: string }) => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;
    closed = false;
    constructor(readonly url: string) {
      FakeWebSocket.instances.push(this);
    }
    close() {
      this.closed = true;
    }
    open() {
      act(() => this.onopen?.());
    }
    send(msg: unknown) {
      act(() => this.onmessage?.({ data: typeof msg === "string" ? msg : JSON.stringify(msg) }));
    }
    drop() {
      act(() => this.onclose?.());
    }
  }
  const current = () => FakeWebSocket.instances[FakeWebSocket.instances.length - 1];

  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("connects read-only as a viewer", () => {
    renderWithProviders(<WsViewer />);
    expect(current().url).toBe(`ws://${window.location.host}/ws?role=viewer`);
    expect(screen.getByText("connecting")).toBeInTheDocument();
  });

  it("shows when it is connected", () => {
    renderWithProviders(<WsViewer />);
    current().open();
    expect(screen.getByText("connected")).toBeInTheDocument();
  });

  it("shows the latest message of any type in an unfiltered column", () => {
    renderWithProviders(<WsViewer />);
    current().open();
    current().send({ type: "lockout", state: "locked" });
    expect(document.body.textContent).toContain('"state": "locked"');
  });

  it("collects the message types seen, sorted, and filters a column to one", () => {
    renderWithProviders(<WsViewer />);
    current().open();
    current().send({ type: "lockout", state: "locked" });
    current().send({ type: "engine_data", data: [] });
    const select = screen.getAllByRole("combobox")[0] as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).toEqual(["", "engine_data", "lockout"]);
    fireEvent.change(select, { target: { value: "lockout" } });
    current().send({ type: "engine_data", data: [1] });
    expect(document.body.textContent).toContain('"state": "locked"');
    expect(document.body.textContent).not.toContain('"data": [');
  });

  it("switches to MQTT topics and lists the topics seen", () => {
    renderWithProviders(<WsViewer />);
    current().open();
    current().send({ type: "mqtt_message", topic: "nova/telemetry/gcs", payload: {} });
    current().send({ type: "mqtt_message", topic: "nova/command", payload: {} });
    fireEvent.click(screen.getByText("MQTT Topics"));
    const select = screen.getAllByRole("combobox")[0] as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).toEqual(["", "nova/command", "nova/telemetry/gcs"]);
  });

  it("ignores messages that are not JSON", () => {
    renderWithProviders(<WsViewer />);
    current().open();
    expect(() => current().send("not json")).not.toThrow();
    expect(screen.getByText("connected")).toBeInTheDocument();
  });

  it("allows up to three columns, and removes one", () => {
    renderWithProviders(<WsViewer />);
    fireEvent.click(screen.getByText("+ Add column"));
    fireEvent.click(screen.getByText("+ Add column"));
    expect(screen.getAllByRole("combobox")).toHaveLength(3);
    expect(screen.getByText("+ Add column").closest("button")).toBeDisabled();
  });

  it("reconnects every two seconds after a drop, reporting the attempt, and stops after ten", () => {
    renderWithProviders(<WsViewer />);
    current().open();
    current().drop();
    expect(screen.getByText("disconnected (attempt 1/10)")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(FakeWebSocket.instances).toHaveLength(2);

    for (let i = 0; i < 12; i++) {
      current().drop();
      act(() => {
        vi.advanceTimersByTime(2000);
      });
    }
    expect(FakeWebSocket.instances).toHaveLength(11); // the first plus ten retries, then it gives up
  });

  it("resets the attempt count once it reconnects", () => {
    renderWithProviders(<WsViewer />);
    current().drop();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    current().open();
    expect(screen.getByText("connected")).toBeInTheDocument();
    current().drop();
    expect(screen.getByText("disconnected (attempt 1/10)")).toBeInTheDocument();
  });

  it("closes the socket and stops reconnecting when unmounted", () => {
    const view = renderWithProviders(<WsViewer />);
    const ws = current();
    view.unmount();
    expect(ws.closed).toBe(true);
    ws.drop();
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("shows an error state", () => {
    renderWithProviders(<WsViewer />);
    act(() => current().onerror?.());
    expect(screen.getByText("error")).toBeInTheDocument();
  });
});

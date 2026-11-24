import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearFlightRecord, getFlightSeries, stopFlightRecorder } from "../flight/recorder";
import { useNovaStore } from "../store";
import { NovaSocket } from "./NovaSocket";

/** Just enough of the browser WebSocket for the socket class under test. */
class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  closeCalls = 0;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.closeCalls++;
    this.readyState = FakeWebSocket.CLOSED;
  }

  // ---- test controls ----
  serverOpens() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }
  serverSends(msg: unknown) {
    this.onmessage?.({ data: typeof msg === "string" ? msg : JSON.stringify(msg) });
  }
  serverErrors() {
    this.onerror?.();
  }
  serverCloses() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }
  sentMessages() {
    return this.sent.map((s) => JSON.parse(s));
  }
}

const initial = useNovaStore.getInitialState();
const store = () => useNovaStore.getState();
const sockets = () => FakeWebSocket.instances;
const current = () => sockets()[sockets().length - 1];

let socket: NovaSocket | undefined;

/** Create, connect, and complete the handshake. */
function connected(options?: ConstructorParameters<typeof NovaSocket>[0]) {
  socket = new NovaSocket(options);
  socket.connect();
  current().serverOpens();
  return current();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  vi.stubGlobal("WebSocket", FakeWebSocket);
  vi.spyOn(Math, "random").mockReturnValue(0); // no reconnect jitter
  FakeWebSocket.instances = [];
  useNovaStore.setState(initial, true);
  store().clearConsole();
  clearFlightRecord();
});

afterEach(() => {
  socket?.disconnect();
  socket = undefined;
  stopFlightRecorder();
  clearFlightRecord();
  store().clearConsole();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("connect", () => {
  it("opens one socket to /ws on the page's host and marks the store connecting", () => {
    socket = new NovaSocket();
    socket.connect();
    expect(sockets()).toHaveLength(1);
    expect(current().url).toBe(`ws://${window.location.host}/ws`);
    expect(store().socket.status).toBe("connecting");
  });

  it("uses the configured base URL and path", () => {
    vi.stubEnv("NEXT_PUBLIC_NOVA_WS_BASE_URL", "ws://backend.test:9000");
    socket = new NovaSocket({ path: "/live" });
    socket.connect();
    expect(current().url).toBe("ws://backend.test:9000/live");
  });

  it("ignores a second connect while one is in flight or open", () => {
    socket = new NovaSocket();
    socket.connect();
    socket.connect();
    current().serverOpens();
    socket.connect();
    expect(sockets()).toHaveLength(1);
  });

  it("does nothing where there is no WebSocket (server rendering)", () => {
    vi.stubGlobal("WebSocket", undefined);
    socket = new NovaSocket();
    socket.connect();
    expect(sockets()).toHaveLength(0);
    expect(store().socket.status).toBe("disconnected");
  });

  it("marks the store open on handshake and starts the flight recorder", () => {
    connected();
    expect(store().socket.status).toBe("open");
    vi.advanceTimersByTime(300);
    expect(getFlightSeries().tsSec.length).toBeGreaterThanOrEqual(2);
  });

  it("starts the staleness sweep on open", () => {
    connected();
    store().ingestEngineData([{ name: "PT1", value: 1, avg: 1, unit: "psi", timestamp: 0 }]);
    vi.advanceTimersByTime(3000);
    expect(store().engineData.status).toBe("stale");
  });

  it("applies freshness window overrides", () => {
    connected({ freshnessWindows: { engineData: 60_000 } });
    store().ingestEngineData([{ name: "PT1", value: 1, avg: 1, unit: "psi", timestamp: 0 }]);
    vi.advanceTimersByTime(10_000);
    expect(store().engineData.status).toBe("live");
  });
});

describe("message routing", () => {
  it("routes session and snapshot messages", () => {
    const ws = connected();
    ws.serverSends({ type: "session", role: "viewer", client_id: "c1" });
    expect(store().session).toEqual({ clientId: "c1", role: "viewer" });
    ws.serverSends({ type: "snapshot", role: "operator", client_id: "c2", actuator_states: { V1: "open" } });
    expect(store().session).toEqual({ clientId: "c2", role: "operator" });
    expect(store().actuatorStates.data).toEqual({ V1: "open" });
  });

  it("routes actuator_states", () => {
    connected().serverSends({ type: "actuator_states", actuator_states: { V1: "closed" } });
    expect(store().actuatorStates.data).toEqual({ V1: "closed" });
  });

  it("routes engine_data and its parsed_data alias", () => {
    const ws = connected();
    const reading = (name: string, value: number) => ({ name, value, avg: value, unit: "psi", timestamp: 1 });
    ws.serverSends({ type: "engine_data", data: [reading("PT1", 1)] });
    ws.serverSends({ type: "parsed_data", sensors: [reading("PT2", 2)] });
    expect(Object.keys(store().engineData.data ?? {})).toEqual(["PT1", "PT2"]);
  });

  it("ignores engine_data whose payload is not a list", () => {
    connected().serverSends({ type: "engine_data", data: { PT1: 1 } });
    expect(store().engineData.data).toBeNull();
  });

  it("adapts flight_data before storing it, and mirrors the FAS link", () => {
    connected().serverSends({
      type: "flight_data",
      data: {
        fas_fmc: { FMC_0: { baro: { altitude_m: 123, pressure_hpa: 1000, temp_c: 20 } } },
        fas_link: { connected: true, port: "COM3", baud: 9600 },
      },
    });
    expect(store().flightData.data?.altitude).toBe(123);
    expect(store().fasLink).toEqual({ connected: true, port: "COM3", baud: 9600, error: null });
  });

  it("stores an empty telemetry object for a malformed flight_data payload and leaves the link unknown", () => {
    const ws = connected();
    ws.serverSends({ type: "flight_data", data: [1, 2] });
    ws.serverSends({ type: "flight_data" });
    expect(store().flightData.data).toEqual({});
    expect(store().fasLink).toBeNull();
  });

  it("does not overwrite the known link with a flight frame that has no fas_link", () => {
    const ws = connected();
    ws.serverSends({ type: "flight_data", data: { fas_link: { connected: true, port: "COM3", baud: 9600 } } });
    ws.serverSends({ type: "flight_data", data: {} });
    expect(store().fasLink?.connected).toBe(true);
  });

  it("adapts flight_events", () => {
    connected().serverSends({ type: "flight_events", events: [{ name: "apogee_detected" }] });
    expect(store().flightEvents.data?.events).toHaveLength(1);
  });

  it("treats a non-list flight_events payload as no events", () => {
    connected().serverSends({ type: "flight_events", events: "nope" });
    expect(store().flightEvents.data?.events).toEqual([]);
  });

  it.each(["locked", "unlocked"] as const)("accepts lockout state %s", (state) => {
    connected().serverSends({ type: "lockout", state });
    expect(store().lockout).toMatchObject({ data: state, status: "live" });
  });

  it.each(["", "LOCKED", "open", null, 1])("ignores the lockout state %j, leaving the system locked", (state) => {
    connected().serverSends({ type: "lockout", state });
    expect(store().lockout.data).toBeNull();
    expect(useNovaStore.getState().lockout.status).not.toBe("live");
  });

  it("surfaces a server error in the socket state and the console", () => {
    connected().serverSends({ type: "error", detail: "Viewer cannot command" });
    expect(store().socket.lastError).toBe("Viewer cannot command");
    vi.advanceTimersByTime(200);
    expect(store().consoleMessages.at(-1)).toMatchObject({ kind: "error", text: "Viewer cannot command" });
  });

  it("uses a generic message for an error without detail", () => {
    connected().serverSends({ type: "error" });
    expect(store().socket.lastError).toBe("Unknown server error");
  });

  it("stores a valid pid_layout and clears it for an invalid one", () => {
    const ws = connected();
    const layout = { schemaVersion: 1, meta: { name: "L", savedAt: "", app: "novaops" }, systems: {}, graph: { cells: [] } };
    ws.serverSends({ type: "pid_layout", layout });
    expect(store().pidLayout).toEqual(layout);
    ws.serverSends({ type: "pid_layout", layout: { junk: true } });
    expect(store().pidLayout).toBeNull();
  });

  it("hands a config_update to the host's callback, only for an object", () => {
    const onConfigUpdate = vi.fn();
    const ws = connected({ onConfigUpdate });
    ws.serverSends({ type: "config_update", config: { Sensors: [] } });
    ws.serverSends({ type: "config_update", config: [] });
    ws.serverSends({ type: "config_update", config: null });
    expect(onConfigUpdate).toHaveBeenCalledTimes(1);
    expect(onConfigUpdate).toHaveBeenCalledWith({ Sensors: [] });
  });

  it("copes with a config_update when no callback was given", () => {
    expect(() => connected().serverSends({ type: "config_update", config: {} })).not.toThrow();
  });

  describe("FAS console messages", () => {
    it("console_serial updates the link and is also logged", () => {
      connected().serverSends({ type: "console_serial", connected: true, port: "COM3", baud: 115200 });
      expect(store().fasLink).toEqual({ connected: true, port: "COM3", baud: 115200, error: null });
      vi.advanceTimersByTime(200);
      expect(store().consoleMessages.at(-1)?.text).toContain("Serial link up");
    });

    it("console_config failure records the link as down with its error", () => {
      connected().serverSends({ type: "console_config", ok: false, port: "COM3", error: "busy", connected: true });
      expect(store().fasLink).toMatchObject({ connected: false, error: "busy" });
    });

    it("console_config success leaves the link to the console_serial that follows", () => {
      connected().serverSends({ type: "console_config", ok: true, port: "COM3", baud: 9600 });
      expect(store().fasLink).toBeNull();
    });

    it("console_ports stores the port list", () => {
      connected().serverSends({ type: "console_ports", ports: [{ device: "COM3" }, { nope: 1 }] });
      expect(store().fasPorts).toEqual([{ device: "COM3" }]);
    });

    it("console_status sets streaming only for literal true", () => {
      const ws = connected();
      ws.serverSends({ type: "console_status", active: true });
      expect(store().fasStreaming).toBe(true);
      ws.serverSends({ type: "console_status", active: "yes" });
      expect(store().fasStreaming).toBe(false);
    });
  });

  it("logs unrecognised and untyped messages in the console", () => {
    const ws = connected();
    ws.serverSends({ type: "fas_frame", board_kind: 2, board_id: 0, msg_type: 1 });
    ws.serverSends({ level: "info", message: "hello" });
    ws.serverSends({ type: "something_new" });
    vi.advanceTimersByTime(200);
    expect(store().consoleMessages).toHaveLength(3);
  });

  it.each([["not json"], ["{broken"], [""], ["[1,2]"], ["null"], ["42"], ['"str"']])(
    "ignores the non-object payload %j without touching the store",
    (raw) => {
      const ws = connected();
      const before = store();
      expect(() => ws.serverSends(raw)).not.toThrow();
      vi.advanceTimersByTime(200);
      expect(store().consoleMessages).toEqual([]);
      expect(store().engineData).toBe(before.engineData);
    },
  );
});

describe("reconnect", () => {
  it("backs off 1s, 2s, 4s ... up to the cap", () => {
    socket = new NovaSocket({ baseReconnectDelayMs: 1000, maxReconnectDelayMs: 10_000 });
    socket.connect();

    const delays: number[] = [];
    for (let i = 0; i < 6; i++) {
      const count = sockets().length;
      current().serverCloses();
      let waited = 0;
      while (sockets().length === count && waited < 60_000) {
        vi.advanceTimersByTime(100);
        waited += 100;
      }
      delays.push(waited);
    }
    expect(delays).toEqual([1000, 2000, 4000, 8000, 10_000, 10_000]);
  });

  it("adds up to 500 ms of jitter", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999);
    socket = new NovaSocket();
    socket.connect();
    current().serverCloses();
    vi.advanceTimersByTime(1498);
    expect(sockets()).toHaveLength(1);
    vi.advanceTimersByTime(2);
    expect(sockets()).toHaveLength(2);
  });

  it("marks everything disconnected and drops the session as soon as the socket closes", () => {
    const ws = connected();
    ws.serverSends({ type: "session", role: "operator", client_id: "c1" });
    ws.serverCloses();
    expect(store().socket.status).toBe("disconnected");
    expect(store().session).toEqual({ clientId: null, role: null });
  });

  it("stops the flight recorder on drop but keeps its history", () => {
    const ws = connected();
    vi.advanceTimersByTime(300);
    const before = getFlightSeries().tsSec.length;
    ws.serverCloses();
    vi.advanceTimersByTime(300);
    expect(getFlightSeries().tsSec.length).toBe(before);
  });

  it("resets the backoff after a successful reconnect", () => {
    socket = new NovaSocket();
    socket.connect();
    current().serverCloses();
    vi.advanceTimersByTime(1000);
    current().serverCloses();
    vi.advanceTimersByTime(2000);
    expect(store().socket.reconnectAttempt).toBe(2);
    current().serverOpens();
    expect(store().socket.reconnectAttempt).toBe(0);
    current().serverCloses();
    vi.advanceTimersByTime(999);
    const count = sockets().length;
    vi.advanceTimersByTime(1);
    expect(sockets().length).toBe(count + 1);
  });

  it("records a transport error, then lets the close drive the reconnect", () => {
    const ws = connected();
    ws.serverErrors();
    expect(store().socket).toMatchObject({ status: "error", lastError: "WebSocket connection error" });
    ws.serverCloses();
    vi.advanceTimersByTime(1000);
    expect(sockets()).toHaveLength(2);
  });

  it("does not open a second socket while the first reconnect is still connecting", () => {
    socket = new NovaSocket();
    socket.connect();
    current().serverCloses();
    vi.advanceTimersByTime(1000);
    expect(sockets()).toHaveLength(2);
    socket.connect();
    expect(sockets()).toHaveLength(2);
  });
});

describe("roles", () => {
  it("sends a role request and restores viewer/pad/operator after a reconnect", () => {
    const ws = connected();
    socket!.requestRole("operator");
    expect(ws.sentMessages()).toEqual([{ type: "role_request", role: "operator" }]);

    ws.serverCloses();
    vi.advanceTimersByTime(1000);
    current().serverOpens();
    expect(current().sentMessages()).toEqual([{ type: "role_request", role: "operator" }]);
  });

  it("sends the admin password once and never re-requests admin after a reconnect", () => {
    const ws = connected();
    socket!.requestRole("operator");
    socket!.requestRole("admin", "s3cret");
    expect(ws.sentMessages()[1]).toEqual({ type: "role_request", role: "admin", password: "s3cret" });

    ws.serverCloses();
    vi.advanceTimersByTime(1000);
    current().serverOpens();
    const resent = current().sentMessages();
    expect(resent).toEqual([{ type: "role_request", role: "operator" }]);
    expect(JSON.stringify(resent)).not.toContain("s3cret");
  });

  it("requests nothing after a reconnect when no role was ever requested", () => {
    const ws = connected();
    ws.serverCloses();
    vi.advanceTimersByTime(1000);
    current().serverOpens();
    expect(current().sent).toEqual([]);
  });

  it("omits the password field for an admin request without one", () => {
    const ws = connected();
    socket!.requestRole("admin");
    expect(ws.sentMessages()[0]).toEqual({ type: "role_request", role: "admin" });
  });
});

describe("send", () => {
  it("serialises a message when the socket is open", () => {
    const ws = connected();
    socket!.send({ type: "role_request", role: "viewer" });
    expect(ws.sent).toEqual(['{"type":"role_request","role":"viewer"}']);
  });

  it("silently drops a message before the socket is open or after it closes", () => {
    socket = new NovaSocket();
    socket.send({ type: "role_request", role: "viewer" });
    socket.connect();
    socket.send({ type: "role_request", role: "viewer" });
    expect(current().sent).toEqual([]);
    current().serverOpens();
    current().serverCloses();
    socket.send({ type: "role_request", role: "viewer" });
    expect(current().sent).toEqual([]);
  });
});

describe("disconnect", () => {
  it("closes the socket, marks the store disconnected and never reconnects", () => {
    const ws = connected();
    socket!.disconnect();
    expect(ws.closeCalls).toBe(1);
    expect(store().socket.status).toBe("disconnected");
    vi.advanceTimersByTime(120_000);
    expect(sockets()).toHaveLength(1);
  });

  it("cancels a reconnect that is already scheduled", () => {
    socket = new NovaSocket();
    socket.connect();
    current().serverCloses();
    socket.disconnect();
    vi.advanceTimersByTime(120_000);
    expect(sockets()).toHaveLength(1);
  });

  it("cannot be connected again afterwards", () => {
    socket = new NovaSocket();
    socket.connect();
    socket.disconnect();
    socket.connect();
    expect(sockets()).toHaveLength(1);
  });

  it("stops the flight recorder and the staleness sweep", () => {
    connected();
    socket!.disconnect();
    store().ingestEngineData([{ name: "PT1", value: 1, avg: 1, unit: "psi", timestamp: 0 }]);
    const samples = getFlightSeries().tsSec.length;
    vi.advanceTimersByTime(5000);
    expect(getFlightSeries().tsSec.length).toBe(samples);
    expect(store().engineData.status).toBe("live");
  });

  it("is safe to call before connecting, and twice", () => {
    socket = new NovaSocket();
    expect(() => {
      socket!.disconnect();
      socket!.disconnect();
    }).not.toThrow();
  });
});

describe("pi_config_status", () => {
  const status = {
    node: "novaThermo",
    target: "TCS",
    expected_hash: "aa",
    received: true,
    config_hash: "aa",
    applied_ms: 1,
    rejected: [],
    reserved_pins: [],
    thermocouples: {},
    tripped: [{ output: "gpio:17", reason: "max_on_time", time_ms: 2, actuators: ["H"] }],
    mismatch: false,
    mismatch_reasons: [],
  };

  it("stores each Pi's status by node and does not log it", () => {
    const ws = connected();
    ws.serverSends({ type: "pi_config_status", node: "novaThermo", status });
    ws.serverSends({ type: "pi_config_status", node: "novaGround", status: { ...status, node: "novaGround", target: "GCS", tripped: [] } });
    expect(Object.keys(store().piConfigStatus).sort()).toEqual(["novaGround", "novaThermo"]);
    expect(store().piConfigStatus.novaThermo.tripped[0].reason).toBe("max_on_time");
    expect(store().consoleMessages).toHaveLength(0);
  });

  it("ignores a message without a status", () => {
    const ws = connected();
    ws.serverSends({ type: "pi_config_status", node: "novaThermo" });
    expect(store().piConfigStatus).toEqual({});
  });

  it("forgets the statuses when the socket drops, since they're unknown until resent", () => {
    const ws = connected();
    ws.serverSends({ type: "pi_config_status", node: "novaThermo", status });
    ws.serverCloses();
    expect(store().piConfigStatus).toEqual({});
  });
});

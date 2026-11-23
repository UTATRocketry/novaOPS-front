import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ConditionAlert } from "../alerts/types";
import type { ParsedSensorValue } from "../types";
import { DEFAULT_FRESHNESS_WINDOWS, createStalenessTimer } from "./freshness";
import { sel } from "./selectors";
import { useNovaStore } from "./store";
import type { FlightTelemetry, FreshnessWindows } from "./types";

const initial = useNovaStore.getInitialState();
const get = () => useNovaStore.getState();

const reading = (name: string, value: number): ParsedSensorValue => ({ name, value, avg: value, unit: "psi", timestamp: 0 });

const condition = (id: string, over: Partial<ConditionAlert> = {}): ConditionAlert => ({
  id,
  severity: "warn",
  title: id,
  source: "test",
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  useNovaStore.setState(initial, true);
  get().clearConsole();
});

afterEach(() => {
  get().clearConsole();
  vi.useRealTimers();
});

describe("socket lifecycle", () => {
  it("starts disconnected with no data anywhere", () => {
    const s = get();
    expect(s.socket).toEqual({ status: "disconnected", lastError: null, reconnectAttempt: 0 });
    for (const slice of [s.actuatorStates, s.engineData, s.flightData, s.flightEvents, s.lockout]) {
      expect(slice).toEqual({ data: null, status: "disconnected", lastSeen: null });
    }
    expect(s.session).toEqual({ clientId: null, role: null });
  });

  it("markConnecting keeps prior data as stale and empty slices as connecting", () => {
    get().ingestLockout("unlocked");
    get().markConnecting();
    expect(get().socket.status).toBe("connecting");
    expect(get().lockout).toMatchObject({ data: "unlocked", status: "stale" });
    expect(get().engineData).toMatchObject({ data: null, status: "connecting" });
  });

  it("markOpen opens the socket and resets the reconnect counter", () => {
    get().incrementReconnect();
    get().incrementReconnect();
    expect(get().socket.reconnectAttempt).toBe(2);
    get().markOpen();
    expect(get().socket).toMatchObject({ status: "open", reconnectAttempt: 0 });
  });

  it("setSocketError records the error without clearing data", () => {
    get().ingestEngineData([reading("PT1", 5)]);
    get().setSocketError("boom");
    expect(get().socket).toMatchObject({ status: "error", lastError: "boom" });
    expect(get().engineData.data).not.toBeNull();
  });

  it("markDisconnected drops the session so nobody can command on a dead link", () => {
    get().ingestSession({ type: "session", role: "operator", client_id: "c1" });
    expect(sel.canCommand(get())).toBe(true);
    get().markDisconnected();
    expect(get().session).toEqual({ clientId: null, role: null });
    expect(sel.canCommand(get())).toBe(false);
  });

  it("markDisconnected keeps last data but marks every slice disconnected", () => {
    get().ingestEngineData([reading("PT1", 5)]);
    get().ingestLockout("unlocked");
    get().markDisconnected();
    expect(get().engineData).toMatchObject({ status: "disconnected" });
    expect(get().engineData.data).toEqual({ PT1: reading("PT1", 5) });
    expect(get().lockout.status).toBe("disconnected");
  });

  it("markDisconnected returns the FAS link to unknown, not closed", () => {
    get().ingestFasLink({ connected: true, port: "COM3", baud: 9600, error: null });
    get().ingestFasPorts([{ device: "COM3" }]);
    get().setFasStreaming(true);
    get().markDisconnected();
    expect(get()).toMatchObject({ fasLink: null, fasPorts: null, fasStreaming: false });
  });
});

describe("ingest", () => {
  it("ingestSession sets the client and role", () => {
    get().ingestSession({ type: "session", role: "viewer", client_id: "abc" });
    expect(get().session).toEqual({ clientId: "abc", role: "viewer" });
  });

  it("ingestSnapshot sets the session and actuators, and clears every other stream", () => {
    get().ingestEngineData([reading("PT1", 5)]);
    get().ingestFlightData({ altitude: 10 } as FlightTelemetry);
    get().ingestLockout("unlocked");
    get().ingestSnapshot({ type: "snapshot", role: "operator", client_id: "c2", actuator_states: { V1: "open" } as never });

    const s = get();
    expect(s.session).toEqual({ clientId: "c2", role: "operator" });
    expect(s.actuatorStates).toMatchObject({ data: { V1: "open" }, status: "live", lastSeen: 1_000_000 });
    expect(s.engineData).toEqual({ data: null, status: "connecting", lastSeen: null });
    expect(s.flightData.data).toBeNull();
    // A previous session's lock state must never leak into the new one.
    expect(s.lockout).toEqual({ data: null, status: "connecting", lastSeen: null });
    expect(sel.isLocked(s)).toBe(true);
  });

  it("ingestActuatorStates replaces the map and stamps it", () => {
    get().ingestActuatorStates({ type: "actuator_states", actuator_states: { V1: "closed" } as never });
    expect(get().actuatorStates).toMatchObject({ data: { V1: "closed" }, status: "live", lastSeen: 1_000_000 });
  });

  it("ingestEngineData merges partial updates and keeps the rest", () => {
    get().ingestEngineData([reading("PT1", 1), reading("PT2", 2)]);
    get().ingestEngineData([reading("PT2", 3)]);
    expect(get().engineData.data).toEqual({ PT1: reading("PT1", 1), PT2: reading("PT2", 3) });
    expect(get().engineData.status).toBe("live");
  });

  it("ingestEngineData stores a real zero, not a missing value", () => {
    get().ingestEngineData([reading("PT1", 0)]);
    expect(sel.engineValue("PT1")(get())?.value).toBe(0);
    expect(sel.engineValue("PT9")(get())).toBeNull();
  });

  it("ingestLockout, flight data and events are stamped live", () => {
    get().ingestLockout("locked");
    get().ingestFlightData({ phase: "boost" } as FlightTelemetry);
    expect(get().lockout).toMatchObject({ data: "locked", status: "live", lastSeen: 1_000_000 });
    expect(get().flightData.data).toEqual({ phase: "boost" });
  });

  it("ingestPidLayout stores and survives a disconnect", () => {
    const layout = { nodes: [] } as never;
    get().ingestPidLayout(layout);
    get().markDisconnected();
    expect(get().pidLayout).toBe(layout);
  });
});

describe("FAS link", () => {
  const link = { connected: true, port: "COM3", baud: 9600, error: null };

  it("does not replace the object when nothing changed", () => {
    get().ingestFasLink(link);
    const first = get().fasLink;
    get().ingestFasLink({ ...link });
    expect(get().fasLink).toBe(first);
  });

  it.each([
    { connected: false },
    { port: "COM4" },
    { baud: 115200 },
    { error: "x" },
  ])("replaces the object when %j changes", (change) => {
    get().ingestFasLink(link);
    const first = get().fasLink;
    get().ingestFasLink({ ...link, ...change });
    expect(get().fasLink).not.toBe(first);
  });

  it("only updates streaming on a real change", () => {
    const listener = vi.fn();
    const unsubscribe = useNovaStore.subscribe(listener);
    get().setFasStreaming(false);
    expect(listener).not.toHaveBeenCalled();
    get().setFasStreaming(true);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});

describe("console buffer", () => {
  it("batches entries into one update per flush", () => {
    const listener = vi.fn();
    const unsubscribe = useNovaStore.subscribe(listener);
    for (let i = 0; i < 50; i++) get().ingestConsoleMessage({ message: `m${i}` });
    expect(get().consoleMessages).toHaveLength(0);
    vi.advanceTimersByTime(120);
    expect(get().consoleMessages).toHaveLength(50);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("classifies messages, stamps the time and assigns increasing ids", () => {
    get().ingestConsoleMessage({ level: "warn", message: "hot" });
    get().pushConsoleEntry({ status: "nominal", kind: "command", text: "sent" });
    vi.advanceTimersByTime(120);
    const [a, b] = get().consoleMessages;
    expect(a).toMatchObject({ status: "warn", kind: "warning", text: "hot", ts: 1_000_000 });
    expect(b).toMatchObject({ kind: "command", text: "sent" });
    expect(b.msgType).toBeUndefined();
    expect(b.id).toBeGreaterThan(a.id);
  });

  it("keeps only the most recent 1000 lines", () => {
    for (let i = 0; i < 1005; i++) get().pushConsoleEntry({ status: "info", kind: "activity", text: `m${i}` });
    vi.advanceTimersByTime(120);
    const lines = get().consoleMessages;
    expect(lines).toHaveLength(1000);
    expect(lines[0].text).toBe("m5");
    expect(lines[999].text).toBe("m1004");
  });

  it("clearConsole discards pending entries as well as flushed ones", () => {
    get().pushConsoleEntry({ status: "info", kind: "activity", text: "a" });
    vi.advanceTimersByTime(120);
    get().pushConsoleEntry({ status: "info", kind: "activity", text: "pending" });
    get().clearConsole();
    vi.advanceTimersByTime(500);
    expect(get().consoleMessages).toEqual([]);
  });
});

describe("alerts", () => {
  it("reconcile adds conditions, stamping ts and unacknowledged", () => {
    get().reconcileConditionAlerts([condition("a")]);
    expect(get().alerts).toEqual([
      { id: "a", severity: "warn", title: "a", detail: undefined, source: "test", kind: "condition", ts: 1_000_000, acknowledged: false },
    ]);
  });

  it("keeps ts and acknowledgement for a condition that persists", () => {
    get().reconcileConditionAlerts([condition("a")]);
    get().acknowledgeAlert("a");
    vi.setSystemTime(2_000_000);
    get().reconcileConditionAlerts([condition("a", { severity: "fault" })]);
    expect(get().alerts[0]).toMatchObject({ severity: "fault", ts: 1_000_000, acknowledged: true });
  });

  it("drops conditions that are no longer active", () => {
    get().reconcileConditionAlerts([condition("a"), condition("b")]);
    get().reconcileConditionAlerts([condition("b")]);
    expect(get().alerts.map((a) => a.id)).toEqual(["b"]);
  });

  it("does not touch the store when nothing changed", () => {
    get().reconcileConditionAlerts([condition("a", { detail: "d" })]);
    const before = get().alerts;
    get().reconcileConditionAlerts([condition("a", { detail: "d" })]);
    expect(get().alerts).toBe(before);
  });

  it("leaves event alerts alone when reconciling", () => {
    get().pushEventAlert({ severity: "error", title: "API", source: "api" });
    get().reconcileConditionAlerts([condition("a")]);
    expect(get().alerts.map((a) => a.kind)).toEqual(["condition", "event"]);
  });

  it("generates unique ids for event alerts but honours a supplied one", () => {
    get().pushEventAlert({ severity: "info", title: "x", source: "s" });
    get().pushEventAlert({ severity: "info", title: "y", source: "s" });
    get().pushEventAlert({ severity: "info", title: "z", source: "s", id: "mine" });
    const ids = get().alerts.map((a) => a.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids[2]).toBe("mine");
  });

  it("keeps only the 50 newest event alerts", () => {
    for (let i = 0; i < 55; i++) get().pushEventAlert({ severity: "info", title: `e${i}`, source: "s" });
    const titles = get().alerts.map((a) => a.title);
    expect(titles).toHaveLength(50);
    expect(titles[0]).toBe("e5");
    expect(titles[49]).toBe("e54");
  });

  it("acknowledges one alert, or all of them", () => {
    get().reconcileConditionAlerts([condition("a"), condition("b")]);
    get().acknowledgeAlert("a");
    expect(get().alerts.map((a) => a.acknowledged)).toEqual([true, false]);
    get().acknowledgeAllAlerts();
    expect(get().alerts.every((a) => a.acknowledged)).toBe(true);
  });

  it("dismisses one alert and clears only events", () => {
    get().reconcileConditionAlerts([condition("a"), condition("b")]);
    get().pushEventAlert({ severity: "info", title: "e", source: "s", id: "e1" });
    get().dismissAlert("a");
    expect(get().alerts.map((a) => a.id)).toEqual(["b", "e1"]);
    get().clearEventAlerts();
    expect(get().alerts.map((a) => a.id)).toEqual(["b"]);
  });

  it("opens and closes the alert center", () => {
    get().setAlertCenterOpen(true);
    expect(sel.alertCenterOpen(get())).toBe(true);
  });
});

describe("tickStaleness", () => {
  const windows: FreshnessWindows = { actuatorStates: 100, engineData: 100, flightData: 100, flightEvents: 100, lockout: 100 };

  it("marks a live slice stale only after its window has passed", () => {
    get().ingestEngineData([reading("PT1", 1)]);
    vi.setSystemTime(1_000_100);
    get().tickStaleness(windows);
    expect(get().engineData.status).toBe("live");
    vi.setSystemTime(1_000_101);
    get().tickStaleness(windows);
    expect(get().engineData.status).toBe("stale");
    expect(get().engineData.data).not.toBeNull();
  });

  it("applies each slice's own window", () => {
    get().ingestEngineData([reading("PT1", 1)]);
    get().ingestLockout("unlocked");
    vi.setSystemTime(1_000_500);
    get().tickStaleness({ ...windows, engineData: 100, lockout: 10_000 });
    expect(get().engineData.status).toBe("stale");
    expect(get().lockout.status).toBe("live");
  });

  it("leaves slices that are not live alone", () => {
    vi.setSystemTime(9_000_000);
    const listener = vi.fn();
    const unsubscribe = useNovaStore.subscribe(listener);
    get().tickStaleness(windows);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("a stale lockout reads as locked", () => {
    get().ingestLockout("unlocked");
    expect(sel.isLocked(get())).toBe(false);
    vi.setSystemTime(1_000_000 + DEFAULT_FRESHNESS_WINDOWS.lockout + 1);
    get().tickStaleness(DEFAULT_FRESHNESS_WINDOWS);
    expect(sel.isLocked(get())).toBe(true);
  });
});

describe("createStalenessTimer", () => {
  it("sweeps on its interval with the default windows until stopped", () => {
    get().ingestEngineData([reading("PT1", 1)]);
    const stop = createStalenessTimer();
    vi.advanceTimersByTime(DEFAULT_FRESHNESS_WINDOWS.engineData + 600);
    expect(get().engineData.status).toBe("stale");

    stop();
    get().ingestEngineData([reading("PT1", 2)]);
    vi.advanceTimersByTime(DEFAULT_FRESHNESS_WINDOWS.engineData + 600);
    expect(get().engineData.status).toBe("live");
  });

  it("lets a caller override one window", () => {
    get().ingestEngineData([reading("PT1", 1)]);
    const stop = createStalenessTimer({ engineData: 10_000 }, 100);
    vi.advanceTimersByTime(5_000);
    expect(get().engineData.status).toBe("live");
    stop();
  });
});

describe("selectors", () => {
  it.each([
    ["viewer", false],
    ["pad", true],
    ["operator", true],
    ["admin", true],
    [null, false],
  ] as const)("canCommand for role %s is %s", (role, expected) => {
    useNovaStore.setState({ session: { clientId: "c", role } });
    expect(sel.canCommand(get())).toBe(expected);
  });

  it("isLocked is false only when the lockout is live and unlocked", () => {
    get().ingestLockout("unlocked");
    expect(sel.isLocked(get())).toBe(false);
    get().ingestLockout("locked");
    expect(sel.isLocked(get())).toBe(true);
    useNovaStore.setState({ lockout: { data: "unlocked", status: "stale", lastSeen: 0 } });
    expect(sel.isLocked(get())).toBe(true);
    useNovaStore.setState({ lockout: { data: "unlocked", status: "disconnected", lastSeen: 0 } });
    expect(sel.isLocked(get())).toBe(true);
    useNovaStore.setState({ lockout: { data: null, status: "live", lastSeen: 0 } });
    expect(sel.isLocked(get())).toBe(true);
  });

  it("is locked before anything has been received", () => {
    expect(sel.isLocked(get())).toBe(true);
  });

  it("actuatorState returns null for an unknown actuator", () => {
    expect(sel.actuatorState("V1")(get())).toBeNull();
    get().ingestActuatorStates({ type: "actuator_states", actuator_states: { V1: "open" } as never });
    expect(sel.actuatorState("V1")(get())).toBe("open");
    expect(sel.actuatorState("V2")(get())).toBeNull();
  });

  it("isSocketOpen follows the socket status", () => {
    expect(sel.isSocketOpen(get())).toBe(false);
    get().markOpen();
    expect(sel.isSocketOpen(get())).toBe(true);
  });

  it("exposes the stream statuses and last-seen times", () => {
    get().ingestEngineData([reading("PT1", 1)]);
    expect(sel.engineDataStatus(get())).toBe("live");
    expect(sel.engineDataLastSeen(get())).toBe(1_000_000);
    expect(sel.actuatorStatesStatus(get())).toBe("disconnected");
  });
});

import { create } from "zustand";
import type {
  EngineDataMap,
  FreshnessWindows,
  LiveSlice,
  NovaStore,
  NovaStoreState,
} from "./types";
import type { ConsoleLogEntry } from "../console/types";
import { classifyConsoleMessage } from "../console/classify";

/** Hard cap on retained console lines — oldest are dropped past this. */
const CONSOLE_BUFFER_LIMIT = 1000;

/**
 * Console ingest is BATCHED. A flood of inbound messages (e.g. mqtt_message
 * passthrough) would otherwise cause one Zustand `set` — and therefore one
 * re-render of every console subscriber — per message, saturating the main
 * thread and starving UI interactions (the Stop button became unresponsive).
 * Instead, entries accumulate in a module-level buffer and flush at most once
 * per CONSOLE_FLUSH_MS, collapsing N messages into a single state update.
 */
const CONSOLE_FLUSH_MS = 120;

/** Monotonic console entry id. Module-level so it never triggers re-renders. */
let nextConsoleId = 0;
/** Pending entries awaiting the next batched flush. */
let pendingConsole: ConsoleLogEntry[] = [];
let consoleFlushTimer: ReturnType<typeof setTimeout> | null = null;

/** Apply all pending console entries in a single state update. */
function flushConsole(): void {
  consoleFlushTimer = null;
  if (pendingConsole.length === 0) return;
  const batch = pendingConsole;
  pendingConsole = [];
  useNovaStore.setState((s) => {
    const merged = s.consoleMessages.concat(batch);
    return {
      consoleMessages:
        merged.length > CONSOLE_BUFFER_LIMIT
          ? merged.slice(merged.length - CONSOLE_BUFFER_LIMIT)
          : merged,
    };
  });
}

/** Schedule a batched flush if one isn't already pending. */
function scheduleConsoleFlush(): void {
  if (consoleFlushTimer) return;
  consoleFlushTimer = setTimeout(flushConsole, CONSOLE_FLUSH_MS);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function disconnected<T>(): LiveSlice<T> {
  return { data: null, status: "disconnected", lastSeen: null };
}

/**
 * If `slice` is `live` and has been silent past `windowMs`, return a copy
 * marked `stale`. Otherwise return undefined (no change needed).
 */
function markStaleIfExpired<T>(
  slice: LiveSlice<T>,
  windowMs: number,
  now: number,
): LiveSlice<T> | undefined {
  if (
    slice.status === "live" &&
    slice.lastSeen !== null &&
    now - slice.lastSeen > windowMs
  ) {
    return { ...slice, status: "stale" };
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const INITIAL_STATE: NovaStoreState = {
  socket: { status: "disconnected", lastError: null, reconnectAttempt: 0 },
  actuatorStates: disconnected(),
  engineData: disconnected<EngineDataMap>(),
  flightData: disconnected(),
  flightEvents: disconnected(),
  physicalLockout: disconnected(),
  session: { clientId: null, role: null },
  pidLayout: null,
  consoleMessages: [],
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useNovaStore = create<NovaStore>()((set, get) => ({
  ...INITIAL_STATE,

  // ---- Socket lifecycle ----

  markConnecting: () =>
    set((s) => ({
      socket: { ...s.socket, status: "connecting" },
      // Preserve non-null data as "stale" so the UI can dim-but-show prior
      // values during a transient reconnect. Null data stays "connecting".
      actuatorStates: { ...s.actuatorStates, status: s.actuatorStates.data !== null ? "stale" : "connecting" },
      engineData:     { ...s.engineData,     status: s.engineData.data     !== null ? "stale" : "connecting" },
      flightData:     { ...s.flightData,     status: s.flightData.data     !== null ? "stale" : "connecting" },
      flightEvents:   { ...s.flightEvents,   status: s.flightEvents.data   !== null ? "stale" : "connecting" },
      physicalLockout:{ ...s.physicalLockout,status: s.physicalLockout.data !== null ? "stale" : "connecting" },
    })),

  markOpen: () =>
    set((s) => ({ socket: { ...s.socket, status: "open", reconnectAttempt: 0 } })),

  markDisconnected: () =>
    set((s) => ({
      socket: { ...s.socket, status: "disconnected" },
      // Clear session so stale clientId/role cannot be used while disconnected.
      // canCommand returns false; useCommandGate returns "Not connected".
      session: { clientId: null, role: null },
      actuatorStates: { ...s.actuatorStates, status: "disconnected" },
      engineData: { ...s.engineData, status: "disconnected" },
      flightData: { ...s.flightData, status: "disconnected" },
      flightEvents: { ...s.flightEvents, status: "disconnected" },
      physicalLockout: { ...s.physicalLockout, status: "disconnected" },
    })),

  setSocketError: (error) =>
    set((s) => ({ socket: { ...s.socket, status: "error", lastError: error } })),

  incrementReconnect: () =>
    set((s) => ({
      socket: { ...s.socket, reconnectAttempt: s.socket.reconnectAttempt + 1 },
    })),

  // ---- WS message ingest ----

  ingestSession: (msg) => {
    set({ session: { clientId: msg.client_id, role: msg.role } });
  },

  ingestSnapshot: (msg) => {
    set({
      session: { clientId: msg.client_id, role: msg.role },
      actuatorStates: { data: msg.actuator_states, status: "live", lastSeen: Date.now() },
      // Null out streams that were not reset by markDisconnected so pre-reconnect
      // values from the previous session cannot leak into the new one.
      engineData:      { data: null, status: "connecting", lastSeen: null },
      flightData:      { data: null, status: "connecting", lastSeen: null },
      flightEvents:    { data: null, status: "connecting", lastSeen: null },
      physicalLockout: { data: null, status: "connecting", lastSeen: null },
    });
  },

  ingestActuatorStates: (msg) => {
    set({ actuatorStates: { data: msg.actuator_states, status: "live", lastSeen: Date.now() } });
  },

  ingestEngineData: (values) => {
    const now = Date.now();
    set((s) => ({
      engineData: {
        // Merge into the existing map — messages may not include every sensor
        data: {
          ...(s.engineData.data ?? {}),
          ...Object.fromEntries(values.map((v) => [v.name, v])),
        },
        status: "live",
        lastSeen: now,
      },
    }));
  },

  ingestFlightData: (data) => {
    set({ flightData: { data, status: "live", lastSeen: Date.now() } });
  },

  ingestFlightEvents: (events) => {
    set({ flightEvents: { data: events, status: "live", lastSeen: Date.now() } });
  },

  ingestPhysicalLockout: (state) => {
    set({ physicalLockout: { data: state, status: "live", lastSeen: Date.now() } });
  },

  ingestPidLayout: (layout) => {
    set({ pidLayout: layout });
  },

  // ---- Console / event log ----

  ingestConsoleMessage: (raw) => {
    pendingConsole.push({ ...classifyConsoleMessage(raw), id: nextConsoleId++, ts: Date.now() });
    scheduleConsoleFlush();
  },

  pushConsoleEntry: (entry) => {
    pendingConsole.push({ ...entry, id: nextConsoleId++, ts: Date.now() });
    scheduleConsoleFlush();
  },

  clearConsole: () => {
    pendingConsole = [];
    if (consoleFlushTimer) { clearTimeout(consoleFlushTimer); consoleFlushTimer = null; }
    set({ consoleMessages: [] });
  },

  // ---- Staleness sweep ----

  tickStaleness: (windows: FreshnessWindows) => {
    const now = Date.now();
    const s = get();
    const patch: Partial<NovaStoreState> = {};

    const a = markStaleIfExpired(s.actuatorStates, windows.actuatorStates, now);
    if (a) patch.actuatorStates = a;

    const e = markStaleIfExpired(s.engineData, windows.engineData, now);
    if (e) patch.engineData = e;

    const fd = markStaleIfExpired(s.flightData, windows.flightData, now);
    if (fd) patch.flightData = fd;

    const fe = markStaleIfExpired(s.flightEvents, windows.flightEvents, now);
    if (fe) patch.flightEvents = fe;

    const pl = markStaleIfExpired(s.physicalLockout, windows.physicalLockout, now);
    if (pl) patch.physicalLockout = pl;

    if (Object.keys(patch).length > 0) set(patch);
  },
}));

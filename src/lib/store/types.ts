import type {
  ActuatorStateMap,
  ActuatorStatesMessage,
  ClientRole,
  ParsedSensorValue,
  PhysicalLockoutState,
  SessionMessage,
  SnapshotMessage,
} from "../types";
import type { AdaptedFlightEvents, FlightTelemetry as FlightTelemetryShape } from "../flight/types";
import type { NovaPidLayout } from "../pid/serializer";
import type { ConsoleLogEntry } from "../console/types";

// ---------------------------------------------------------------------------
// Core primitives
// ---------------------------------------------------------------------------

export type StreamStatus = "disconnected" | "connecting" | "live" | "stale" | "error";

/**
 * Uniform envelope for every WS-pushed data stream.
 *
 * Safety rule: components render `—` iff `data === null`, never by checking
 * `status`. This makes the "no fabricated value" invariant enforceable in one
 * place (the ingest action) rather than scattered across the UI.
 *
 * `stale`: socket open, stream silent past its freshness window — retain last
 *   data, but UI must de-emphasise it (dim + age badge).
 * `error`: message arrived but was malformed/rejected — data set to null, UI
 *   shows `—`. A corrupt value is more dangerous than no value on a control surface.
 */
export interface LiveSlice<T> {
  data: T | null;
  status: StreamStatus;
  lastSeen: number | null; // epoch ms of last successful ingest
}

export interface SocketMeta {
  status: "disconnected" | "connecting" | "open" | "error";
  lastError: string | null;
  reconnectAttempt: number;
}

// ---------------------------------------------------------------------------
// Slice payload types
// ---------------------------------------------------------------------------

/** Engine sensor readings keyed by name for O(1) lookup and per-sensor freshness. */
export type EngineDataMap = Record<string, ParsedSensorValue>;

/** Typed flight telemetry — output of the flight adapter. All fields optional. */
export type FlightTelemetry = FlightTelemetryShape;

/** Typed flight events — output of the flight adapter. Includes milestones + T-0. */
export type FlightEvents = AdaptedFlightEvents;

export interface SessionState {
  clientId: string | null;
  /** null until the first `session` or `snapshot` WS message is received. */
  role: ClientRole | null;
}

// ---------------------------------------------------------------------------
// Staleness window configuration
// ---------------------------------------------------------------------------

/** Names of store slices that participate in the staleness sweep. */
export type LiveSliceName =
  | "actuatorStates"
  | "engineData"
  | "flightData"
  | "flightEvents"
  | "physicalLockout";

/** Per-stream freshness windows in milliseconds. */
export type FreshnessWindows = Record<LiveSliceName, number>;

// ---------------------------------------------------------------------------
// Full store shape
// ---------------------------------------------------------------------------

export interface NovaStoreState {
  socket: SocketMeta;
  actuatorStates: LiveSlice<ActuatorStateMap>;
  engineData: LiveSlice<EngineDataMap>;
  flightData: LiveSlice<FlightTelemetry>;
  flightEvents: LiveSlice<FlightEvents>;
  physicalLockout: LiveSlice<PhysicalLockoutState>;
  session: SessionState;
  /**
   * Most-recently-received P&ID layout (from WS broadcast or REST seed).
   * Not a LiveSlice — layout is event-driven config, not a polled telemetry stream.
   * null = not yet received; use DEFAULT_LAYOUT as fallback at render time.
   * Intentionally NOT cleared on disconnect — the layout stays valid across reconnects.
   */
  pidLayout: NovaPidLayout | null;
  /**
   * Rolling buffer of console / event log lines (WS console passthrough,
   * backend `error` frames, FAS frame echoes, and locally-issued commands).
   * Not a LiveSlice — it is an append-only log, not a polled telemetry stream.
   * Capped to the most recent CONSOLE_BUFFER_LIMIT entries.
   */
  consoleMessages: ConsoleLogEntry[];
}

export interface NovaStoreActions {
  // --- Socket lifecycle (called by NovaSocket) ---

  /** Socket is connecting/reconnecting — marks all live slices as `connecting`. */
  markConnecting: () => void;
  /** Socket handshake complete — slices move to `live` as messages arrive. */
  markOpen: () => void;
  /** Socket closed — marks all live slices as `disconnected`. Last data is retained. */
  markDisconnected: () => void;
  /** Transport error — sets socket to `error`. Does not clear slice data. */
  setSocketError: (error: string | null) => void;
  /** Increment the reconnect attempt counter before each retry. */
  incrementReconnect: () => void;

  // --- WS message ingest (called by NovaSocket router) ---

  ingestSession: (msg: SessionMessage) => void;
  /** Authoritative initial state: updates session + actuatorStates together. */
  ingestSnapshot: (msg: SnapshotMessage) => void;
  ingestActuatorStates: (msg: ActuatorStatesMessage) => void;
  /** Merges incoming sensor values into the engine map (partial updates allowed). */
  ingestEngineData: (values: ParsedSensorValue[]) => void;
  ingestFlightData: (data: FlightTelemetry) => void;
  ingestFlightEvents: (events: FlightEvents) => void;
  ingestPhysicalLockout: (state: PhysicalLockoutState) => void;
  /** Store a newly-received P&ID layout (from WS push or REST seed). */
  ingestPidLayout: (layout: NovaPidLayout | null) => void;

  // --- Console / event log ---

  /** Classify and append a raw inbound WS message to the console buffer. */
  ingestConsoleMessage: (raw: Record<string, unknown>) => void;
  /** Append a locally-originated console entry (sent command, send result). */
  pushConsoleEntry: (entry: Omit<ConsoleLogEntry, "id" | "ts">) => void;
  /** Clear the console buffer. */
  clearConsole: () => void;

  // --- Staleness sweep (called by createStalenessTimer) ---

  tickStaleness: (windows: FreshnessWindows) => void;
}

export type NovaStore = NovaStoreState & NovaStoreActions;

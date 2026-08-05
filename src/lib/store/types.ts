import type {
  ActuatorStateMap,
  ActuatorStatesMessage,
  ClientRole,
  LockoutState,
  ParsedSensorValue,
  SessionMessage,
  SnapshotMessage,
} from "../types";
import type { AdaptedFlightEvents, FlightTelemetry as FlightTelemetryShape } from "../flight/types";
import type { NovaPidLayout } from "../pid/serializer";
import type { ConsoleLogEntry, FasSerialPort } from "../console/types";
import type { FasLink } from "../flight/types";
import type { Alert, AlertInput, ConditionAlert } from "../alerts/types";

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
  | "lockout";

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
  lockout: LiveSlice<LockoutState>;
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
  /**
   * Active alerts (condition + event), newest-relevant first is NOT guaranteed —
   * the UI sorts by severity/time. This slice is intentionally domain-agnostic:
   * it holds whatever the pluggable sources (`lib/alerts/sources`) and the event
   * bus produce, so specific alerts can be added/removed without touching it.
   */
  alerts: Alert[];
  /** Whether the alert center dialog is open (global, page-independent). */
  alertCenterOpen: boolean;

  /**
   * FAS bridge serial-link state, from `console_serial` messages and the
   * `fas_link` mirror in every flight_data frame.
   *
   * Not a LiveSlice — it is edge-driven bridge state, not a polled stream.
   * `null` = unknown (nothing received yet, or the socket dropped). The UI must
   * render `—` for null and must NOT read it as "disconnected": an unknown link
   * is not a known-closed link.
   */
  fasLink: FasLink | null;
  /** Serial ports last enumerated by `list_ports`. null = never enumerated. */
  fasPorts: FasSerialPort[] | null;
  /** Whether the bridge is streaming decoded RX frames (`console_status`). */
  fasStreaming: boolean;
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
  ingestLockout: (state: LockoutState) => void;
  /** Store a newly-received P&ID layout (from WS push or REST seed). */
  ingestPidLayout: (layout: NovaPidLayout | null) => void;

  // --- Console / event log ---

  /** Classify and append a raw inbound WS message to the console buffer. */
  ingestConsoleMessage: (raw: Record<string, unknown>) => void;
  /** Append a locally-originated console entry (sent command, send result). */
  pushConsoleEntry: (entry: Omit<ConsoleLogEntry, "id" | "ts">) => void;
  /** Clear the console buffer. */
  clearConsole: () => void;

  // --- FAS bridge serial link ---

  /** Record the bridge's serial-link state (`console_serial` / `fas_link`). */
  ingestFasLink: (link: FasLink) => void;
  /** Replace the enumerated serial-port list (`console_ports`). */
  ingestFasPorts: (ports: FasSerialPort[]) => void;
  /** Record whether frame streaming is active (`console_status`). */
  setFasStreaming: (active: boolean) => void;

  // --- Alerts ---

  /**
   * Replace the full set of `condition` alerts with the currently-active set
   * produced by the sources. Preserves `ts` and `acknowledged` for conditions
   * whose id persists; drops conditions no longer active. Event alerts are left
   * untouched. No-ops (skips the state update) when nothing changed, so it is
   * safe to call on every telemetry tick.
   */
  reconcileConditionAlerts: (active: ConditionAlert[]) => void;
  /** Append a transient `event` alert (e.g. an API error). Generates an id. */
  pushEventAlert: (alert: AlertInput) => void;
  /** Mark one alert acknowledged (silences its toast; stays in the center). */
  acknowledgeAlert: (id: string) => void;
  /** Acknowledge every current alert. */
  acknowledgeAllAlerts: () => void;
  /** Remove an alert. Condition alerts re-appear next tick if still active. */
  dismissAlert: (id: string) => void;
  /** Remove every `event` alert (conditions clear on their own). */
  clearEventAlerts: () => void;
  /** Open/close the global alert center dialog. */
  setAlertCenterOpen: (open: boolean) => void;

  // --- Staleness sweep (called by createStalenessTimer) ---

  tickStaleness: (windows: FreshnessWindows) => void;
}

export type NovaStore = NovaStoreState & NovaStoreActions;

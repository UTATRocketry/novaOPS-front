import type { NovaStore } from "./types";

/**
 * Narrow selector functions for use with `useNovaStore(sel.xxx)`.
 *
 * Zustand re-renders a component only when the selector's return value changes
 * (compared with `Object.is`). Prefer these over subscribing to a full slice —
 * especially for high-frequency streams like `engineData`.
 *
 * Parameterized selectors (e.g. `sel.engineValue("PGSO")`) create a new
 * function on each call. Define them outside the render function or wrap in
 * `useCallback` when the component is performance-sensitive.
 *
 * @example
 *   // Narrow: re-renders only when PGSO changes
 *   const pt = useNovaStore(sel.engineValue("PGSO"));
 *
 *   // Wide (avoid in tight loops): re-renders on every engine message
 *   const map = useNovaStore(sel.engineData);
 */

export const sel = {
  // ---- Socket ----
  socketStatus: (s: NovaStore) => s.socket.status,
  socketError: (s: NovaStore) => s.socket.lastError,
  reconnectAttempt: (s: NovaStore) => s.socket.reconnectAttempt,

  // ---- Session ----
  clientId: (s: NovaStore) => s.session.clientId,
  sessionRole: (s: NovaStore) => s.session.role,

  // ---- Stream statuses (re-renders only on status transitions) ----
  actuatorStatesStatus: (s: NovaStore) => s.actuatorStates.status,
  actuatorStatesLastSeen: (s: NovaStore) => s.actuatorStates.lastSeen,
  engineDataStatus: (s: NovaStore) => s.engineData.status,
  engineDataLastSeen: (s: NovaStore) => s.engineData.lastSeen,
  flightDataStatus: (s: NovaStore) => s.flightData.status,
  flightDataLastSeen: (s: NovaStore) => s.flightData.lastSeen,
  flightEventsStatus: (s: NovaStore) => s.flightEvents.status,
  physicalLockoutStatus: (s: NovaStore) => s.physicalLockout.status,

  // ---- Full slice data (subscribe to the whole map) ----
  actuatorStates: (s: NovaStore) => s.actuatorStates.data,
  engineData: (s: NovaStore) => s.engineData.data,
  flightData: (s: NovaStore) => s.flightData.data,
  flightEvents: (s: NovaStore) => s.flightEvents.data,
  physicalLockout: (s: NovaStore) => s.physicalLockout.data,

  // ---- Per-item narrow selectors (parameterized) ----

  /**
   * Subscribe to a single actuator by name.
   * Returns `null` when the slice has no data — render `—`.
   */
  actuatorState: (name: string) => (s: NovaStore) =>
    s.actuatorStates.data?.[name] ?? null,

  /**
   * Subscribe to a single engine sensor by name.
   * Returns `null` when absent — render `—`, never `0`.
   */
  engineValue: (name: string) => (s: NovaStore) =>
    s.engineData.data?.[name] ?? null,

  // ---- Derived booleans (cheap to compute, avoid per-component duplication) ----

  /** True when the session role allows sending commands (operator, admin, or pad). */
  canCommand: (s: NovaStore) =>
    s.session.role === "operator" ||
    s.session.role === "admin" ||
    s.session.role === "pad",

  /**
   * True when physical lockout is locked.
   * Non-live status (stale, error, disconnected, connecting) is treated as
   * locked — an unknown lock state must block hazardous commands.
   */
  isLocked: (s: NovaStore) =>
    s.physicalLockout.status !== "live" || s.physicalLockout.data !== "unlocked",

  /** True when the socket transport is open (does not imply any stream is live). */
  isSocketOpen: (s: NovaStore) => s.socket.status === "open",

  /** Most-recently-received P&ID layout; null = none received yet → use DEFAULT_LAYOUT. */
  pidLayout: (s: NovaStore) => s.pidLayout,

  // ---- Console / event log ----

  /** The rolling console / event log buffer. */
  consoleMessages: (s: NovaStore) => s.consoleMessages,
} as const;

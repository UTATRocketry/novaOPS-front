import type { Status } from "@/components/primitives";

/**
 * Category of a console log entry — drives both colour and the Events-tab filter.
 *
 * - `command`  operator-issued command (echo of what we sent)        → green
 * - `activity` informational console / activity line                 → blue
 * - `warning`  warning-level message                                 → amber
 * - `fatal`    fatal/critical condition                              → red
 * - `error`    error-level message (incl. backend `error` frames)    → orange
 * - `frame`    decoded FAS RX frame (`fas_frame`)                     → blue
 * - `tx`       echo of a transmitted FAS packet (`console_tx`)       → green/red
 * - `system`   console control acks (ports/config/status)            → neutral
 */
export type ConsoleKind =
  | "command"
  | "activity"
  | "warning"
  | "fatal"
  | "error"
  | "frame"
  | "tx"
  | "system";

/** A single colour-coded line in the console / events stream. */
export interface ConsoleLogEntry {
  /** Monotonic id, assigned on ingest. Stable React key. */
  id: number;
  /** Epoch ms when received/created. */
  ts: number;
  /** Colour vocabulary shared with chips/dots/terminals. */
  status: Status;
  /** Category for filtering. */
  kind: ConsoleKind;
  /** Display text. */
  text: string;
  /**
   * Original WS message `type` (e.g. "console", "mqtt_message", "fas_frame").
   * Undefined for locally-originated entries (command echoes, send results).
   * Used to separate console/log lines from structured telemetry passthrough.
   */
  msgType?: string;
  /** Original payload, kept for the raw-frame inspector. */
  raw?: unknown;
}

/**
 * WS message `type`s that are structured telemetry/state passthrough rather than
 * console/log output. The console terminal hides these; everything else (console
 * passthrough, bridge acks, locally-issued commands) is shown.
 */
export const TELEMETRY_MSG_TYPES: ReadonlySet<string> = new Set([
  "mqtt_message",
  "lockout",
  "physical_lockout",
  "snapshot",
  "session",
  "actuator_states",
  "engine_data",
  "parsed_data",
  "flight_data",
  "flight_events",
  "pid_layout",
  "diagram_update",
  "config_update",
]);

/** True when an entry belongs in the console/log terminal (not telemetry). */
export function isConsoleLine(entry: ConsoleLogEntry): boolean {
  return entry.msgType === undefined || !TELEMETRY_MSG_TYPES.has(entry.msgType);
}

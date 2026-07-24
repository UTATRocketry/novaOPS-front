import type { Status } from "@/components/primitives";
import type { FlightTelemetry, StreamStatus } from "@/lib/store";
import type { SocketMeta } from "@/lib/store";

// ---------------------------------------------------------------------------
// Alert model
//
// The alert system is deliberately generic: the store holds a flat list of
// `Alert` objects and knows nothing about batteries, SD cards or the network.
// *What* raises an alert lives entirely in the pluggable sources (see
// `./sources`) and the event bus (`./bus`). Adding or removing a specific
// alert never touches this file or the store.
// ---------------------------------------------------------------------------

export type AlertSeverity = "info" | "warn" | "error" | "fault";

/**
 * `condition` — derived from live state each evaluation tick. Auto-clears when
 *   the condition resolves; cannot be manually dismissed (only acknowledged).
 * `event`     — a discrete occurrence (e.g. an API error). Persists until the
 *   operator dismisses it.
 */
export type AlertKind = "condition" | "event";

export interface Alert {
  /**
   * Stable identity. Condition sources MUST return a deterministic id for a
   * given condition (e.g. `battery:PMB_0:low`) so it updates in place across
   * ticks instead of duplicating. Event alerts get a generated id.
   */
  id: string;
  severity: AlertSeverity;
  /** One-line headline, e.g. "Low battery". */
  title: string;
  /** Optional longer detail shown in the alert center. */
  detail?: string;
  /** Origin tag for grouping/filtering ("battery", "sd", "api", ...). */
  source: string;
  kind: AlertKind;
  /** epoch ms first raised. Preserved across condition re-evaluations. */
  ts: number;
  /** Operator acknowledged — silences the toast, keeps it in the center. */
  acknowledged: boolean;
}

/**
 * The shape a source (or the bus) produces. `id`/`severity`/`title`/`detail`/
 * `source` are authored; `kind`, `ts` and `acknowledged` are assigned/preserved
 * by the store. For event alerts `id` is optional (the store generates one).
 */
export type AlertInput = Pick<Alert, "severity" | "title" | "source"> &
  Partial<Pick<Alert, "id" | "detail">>;

/** A condition alert always carries a deterministic id. */
export type ConditionAlert = AlertInput & Required<Pick<Alert, "id">>;

// ---------------------------------------------------------------------------
// Pluggable source contract
// ---------------------------------------------------------------------------

/**
 * Read-only snapshot handed to every condition source on each evaluation.
 * Extend this as new sources need more state — sources pick out only what they
 * care about.
 */
export interface AlertSourceContext {
  flightData: FlightTelemetry | null;
  flightDataStatus: StreamStatus;
  engineDataStatus: StreamStatus;
  actuatorStatesStatus: StreamStatus;
  lockoutStatus: StreamStatus;
  socketStatus: SocketMeta["status"];
  now: number;
}

export interface AlertSource {
  /** Human-readable namespace (also the recommended id prefix). */
  id: string;
  /** Return every alert currently active for this source (empty = none). */
  evaluate: (ctx: AlertSourceContext) => ConditionAlert[];
}

// ---------------------------------------------------------------------------
// Severity helpers
// ---------------------------------------------------------------------------

/** severity → shared design-system Status colour token. */
export const SEVERITY_STATUS: Record<AlertSeverity, Status> = {
  info: "info",
  warn: "warn",
  error: "error",
  fault: "fault",
};

/** severity → Material Symbols icon name. */
export const SEVERITY_ICON: Record<AlertSeverity, string> = {
  info: "info",
  warn: "warning",
  error: "error",
  fault: "dangerous",
};

/** Higher = more severe. Drives sort order and the top-bar chip colour. */
export const SEVERITY_RANK: Record<AlertSeverity, number> = {
  fault: 3,
  error: 2,
  warn: 1,
  info: 0,
};

/** Severities from most to least severe — canonical iteration order. */
export const SEVERITIES_DESC: AlertSeverity[] = ["fault", "error", "warn", "info"];

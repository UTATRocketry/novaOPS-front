/**
 * Pi I/O wire format: thermocouple faults, output trips and per-Pi config
 * status, as the backend sends them (contract for issue #40, built against
 * the `feature/tcs-gpio-config` backend branch). All parsing of these shapes
 * lives here so a change to the wire format is a change to this file only.
 *
 *  - `engine_data` entries carry `fault`: null | "open" | "common_mode" |
 *    "overrange", with `value` / `avg` null while it's set.
 *  - `actuator_states` entries carry flat `tripped` / `tripped_output` /
 *    `tripped_ms` while a Pi has the output tripped.
 *  - `pi_config_status` messages carry `{ node, status }` per Pi.
 */
import type {
  ActuatorState,
  ParsedSensorValue,
  PiApplyState,
  PiConfigStatus,
  PiRejectedItem,
  PiTrip,
  SensorFault,
} from "../types";

// ---------------------------------------------------------------------------
// Sensor faults
// ---------------------------------------------------------------------------

const FAULT_LABELS: Record<string, string> = {
  open: "open",
  common_mode: "common mode",
  overrange: "overrange",
};

/** The reading's fault, or null for a good reading. */
export function sensorFault(entry: Pick<ParsedSensorValue, "fault"> | null | undefined): SensorFault | null {
  const f = entry?.fault;
  return typeof f === "string" && f.length > 0 ? f : null;
}

/** Operator-facing text for a fault: "open", "common mode", "overrange". */
export function sensorFaultLabel(fault: SensorFault): string {
  return FAULT_LABELS[fault] ?? fault.replace(/_/g, " ");
}

/** Short reason shown in place of the value, e.g. "TC OPEN". */
export function sensorFaultReadout(fault: SensorFault): string {
  return `TC ${sensorFaultLabel(fault).toUpperCase()}`;
}

// ---------------------------------------------------------------------------
// Output trips
// ---------------------------------------------------------------------------

const TRIP_LABELS: Record<string, string> = {
  comms_loss: "comms loss",
  max_on_time: "max on-time",
};

export function tripReasonLabel(reason: string): string {
  return TRIP_LABELS[reason] ?? reason.replace(/_/g, " ");
}

/** "gpio:17" -> "GPIO 17", "relay:3" -> "relay 3"; anything else as-is. */
export function outputLabel(output: string): string {
  const m = /^(gpio|relay):(\d+)$/i.exec(output);
  if (!m) return output;
  return `${m[1].toLowerCase() === "gpio" ? "GPIO" : "relay"} ${m[2]}`;
}

export interface ActuatorTrip {
  reason: string;
  output: string | null;
  timeMs: number | null;
}

/** The trip on an actuator's live state, or null when it isn't tripped. */
export function actuatorTrip(state: ActuatorState | null | undefined): ActuatorTrip | null {
  const reason = state?.tripped;
  if (typeof reason !== "string" || reason.length === 0) return null;
  return {
    reason,
    output: typeof state?.tripped_output === "string" ? state.tripped_output : null,
    timeMs: typeof state?.tripped_ms === "number" && Number.isFinite(state.tripped_ms) ? state.tripped_ms : null,
  };
}

/** "Tripped: comms loss (GPIO 17)". */
export function actuatorTripText(trip: ActuatorTrip): string {
  const out = trip.output ? ` (${outputLabel(trip.output)})` : "";
  return `Tripped: ${tripReasonLabel(trip.reason)}${out}`;
}

// ---------------------------------------------------------------------------
// Per-Pi config status
// ---------------------------------------------------------------------------

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function parseRejected(v: unknown): PiRejectedItem[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isObj).map((r) => ({ item: String(r.item ?? "?"), reason: String(r.reason ?? "") }));
}

function parseTrips(v: unknown): PiTrip[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isObj).map((t) => ({
    output: String(t.output ?? "?"),
    reason: String(t.reason ?? "unknown"),
    time_ms: num(t.time_ms),
    actuators: Array.isArray(t.actuators) ? t.actuators.filter((a): a is string => typeof a === "string") : [],
  }));
}

function parseThermocouples(v: unknown): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  if (!isObj(v)) return out;
  for (const [hat, chans] of Object.entries(v)) {
    if (!isObj(chans)) continue;
    out[hat] = {};
    for (const [ch, t] of Object.entries(chans)) if (typeof t === "string") out[hat][ch] = t;
  }
  return out;
}

/**
 * Normalise a status view. Returns null when there's no node name to key it
 * by. Missing lists become empty, so a status from before the Pi answered
 * (`received: false`) parses cleanly.
 */
export function parsePiConfigStatus(raw: unknown, nodeHint?: string): PiConfigStatus | null {
  if (!isObj(raw)) return null;
  const node = str(raw.node) ?? nodeHint ?? null;
  if (!node) return null;
  const rejected = parseRejected(raw.rejected);
  const configHash = str(raw.config_hash);
  const expectedHash = str(raw.expected_hash);
  const received = raw.received === true;
  // Prefer the backend's verdict; derive it only if the field is missing.
  const mismatch =
    typeof raw.mismatch === "boolean"
      ? raw.mismatch
      : received && (rejected.length > 0 || (expectedHash != null && configHash !== expectedHash));
  return {
    node,
    target: str(raw.target) ?? "?",
    expected_hash: expectedHash,
    received,
    config_hash: configHash,
    applied_ms: num(raw.applied_ms),
    rejected,
    reserved_pins: Array.isArray(raw.reserved_pins) ? raw.reserved_pins.filter((p): p is number => typeof p === "number") : [],
    thermocouples: parseThermocouples(raw.thermocouples),
    tripped: parseTrips(raw.tripped),
    mismatch,
    mismatch_reasons: Array.isArray(raw.mismatch_reasons)
      ? raw.mismatch_reasons.filter((r): r is string => typeof r === "string")
      : [],
    apply_state: APPLY_STATES.has(raw.apply_state as PiApplyState)
      ? (raw.apply_state as PiApplyState)
      : deriveApplyState(received, rejected.length, configHash, expectedHash),
    received_ms: num(raw.received_ms),
    published_ms: num(raw.published_ms),
  };
}

const APPLY_STATES = new Set<PiApplyState>(["waiting", "applied", "pending", "rejected"]);

function deriveApplyState(
  received: boolean,
  rejectedCount: number,
  configHash: string | null,
  expectedHash: string | null,
): PiApplyState {
  if (!received) return "waiting";
  if (rejectedCount > 0) return "rejected";
  if (configHash !== expectedHash) return "pending";
  return "applied";
}

/** The status's apply state, derived when it came without one. */
export function piApplyState(status: PiConfigStatus | null | undefined): PiApplyState {
  if (!status) return "waiting";
  return (
    status.apply_state ??
    deriveApplyState(status.received, status.rejected.length, status.config_hash, status.expected_hash)
  );
}

/** Parse a `pi_config_status` WS message (`{ type, node, status }`). */
export function parsePiConfigStatusMessage(m: Record<string, unknown>): PiConfigStatus | null {
  return parsePiConfigStatus(m.status, str(m.node) ?? undefined);
}

export type PiHealth = "unknown" | "ok" | "mismatch" | "tripped";

/** Overall state of one Pi for a status chip. Trips outrank a mismatch. */
export function piHealth(status: PiConfigStatus | null | undefined): PiHealth {
  if (!status || !status.received) return "unknown";
  if (status.tripped.length > 0) return "tripped";
  if (status.mismatch) return "mismatch";
  return "ok";
}

/** Human-readable reasons for a mismatch. */
export function mismatchText(status: PiConfigStatus): string[] {
  const out: string[] = [];
  const reasons = new Set(status.mismatch_reasons);
  if (reasons.has("config_hash") || (status.expected_hash != null && status.config_hash !== status.expected_hash)) {
    out.push(`Pi has config ${status.config_hash ?? "none"}, backend sent ${status.expected_hash ?? "none"}`);
  }
  if (status.rejected.length > 0) {
    out.push(`${status.rejected.length} item${status.rejected.length === 1 ? "" : "s"} rejected`);
  }
  return out;
}

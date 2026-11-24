/**
 * Nova GCS API types.
 *
 * Ported directly from FRONTEND_API_GUIDE.md. These describe the JSON shapes
 * the frontend sends to and receives from the NovaOps backend. Do not change
 * these to fit the UI — if the backend contract changes, change them here.
 */

// ---------------------------------------------------------------------------
// Config schema
// ---------------------------------------------------------------------------

export type SourceTarget = "GCS" | "FAS" | "TCS" | "OPS";
/** `DI` = digital input on a Pi GPIO pin (reads 0 or 1). */
export type SensorType = "PT" | "LC" | "TC" | "DI";
/** MCC 134 thermocouple type. Only on `TC` sensors bound to GCS/TCS; default K. */
export type TcType = "J" | "K" | "T" | "E" | "R" | "S" | "B" | "N";
/** What a Pi output does when the backend heartbeat is lost. */
export type OnCommsLoss = "hold" | "safe";
export type ActuatorType =
  | "servo"
  | "solenoid"
  | "powered_device"
  | "powered_gpio_device"
  | "gpio_device"
  | "motor";
export type ConvertMethod =
  | "none"
  | "zero_offset"
  | "linear"
  | "polynomial"
  | "theil_sen"
  | "repeated_median";
export type ClientRole = "viewer" | "pad" | "operator" | "admin";

/** A DAQ HAT channel on a Pi. */
export interface PiHatBinding {
  source: "GCS" | "TCS";
  hat_id: number;
  channel_id: number;
}

/** A `DI` sensor's binding: one BCM GPIO input pin on a Pi. */
export interface PiGpioBinding {
  source: "GCS" | "TCS";
  gpio_channel: number;
}

export type SensorBinding =
  | PiHatBinding
  | PiGpioBinding
  | { source: "FAS"; node: string; channel: number };

/** True for a `DI` sensor's `{source, gpio_channel}` binding. */
export function isGpioBinding(b: SensorBinding): b is PiGpioBinding {
  return b.source !== "FAS" && "gpio_channel" in b;
}

export interface ConvertSpec {
  method?: ConvertMethod;
  calibration?: Array<[number, number]> | null;
}

export interface SensorEntry {
  name: string;
  type: SensorType;
  unit?: string;
  range?: [number, number];
  binding: SensorBinding;
  convert?: ConvertSpec;
  /** Thermocouple type, `TC` sensors on GCS/TCS only. Absent reads as K. */
  tc_type?: TcType | null;
}

export interface ActuatorBinding {
  target: SourceTarget;
  /**
   * FAS board node, e.g. "EPB_1". Naming is 0-BASED and matches the board key:
   * board `EPB:0` is node `EPB_0`. Required for FAS actuators.
   */
  node?: string | null;
  /** Alternative to `node`: resolves to `"{board_type}_{board_id}"`. */
  board_type?: string | null;
  board_id?: number | null;
  relay_channel?: number | null;
  /** Second relay of a reversible motor. Required when `actions.reversible`. */
  reverse_relay_channel?: number | null;
  servo_channel?: number | null;
  /** GPIO command channel for `gpio_device` / `powered_gpio_device`. */
  gpio_channel?: number | null;
}

export interface ActuatorActions {
  position_aliases?: string[];
  positions?: number[];
  default_position?: string | number | null;
  defaultPosition?: string | number | null; // accepted by config upload/input
  relay_type?: "nominally_off" | "nominally_on" | string | null;
  solenoid_type?: "nominally_closed" | "nominally_open" | string | null;
  gpio_commands?: string[];

  // --- Motor only ---------------------------------------------------------
  /** Motor runs both directions through two relays (reverse polarity). */
  reversible?: boolean;
  /**
   * Accepted command states for a motor, in relay-pattern order. Exactly 3
   * entries when `reversible` (forward / stop / reverse), 2 otherwise
   * (on / off), and all labels must be unique. Defaults apply when unset.
   */
  state_labels?: string[];
  /** Active-low relay board: flips published relay states, not their ordering. */
  invert_relays?: boolean;

  // --- Pi relay / GPIO output limits (GCS/TCS solenoid, powered_device,
  // powered_gpio_device, gpio_device, motor) --------------------------------
  /** Seconds after the output last left its safe level before the Pi returns it there. */
  max_on_s?: number | null;
  /** `hold` (default) keeps the output on comms loss; `safe` returns it to its safe level. */
  on_comms_loss?: OnCommsLoss | null;
}

/** Motor command states used when `actions.state_labels` is not set. */
export const MOTOR_DEFAULT_LABELS_REVERSIBLE = ["forward", "stop", "reverse"] as const;
export const MOTOR_DEFAULT_LABELS = ["on", "off"] as const;

/**
 * The command states a motor accepts, in relay-pattern order. The first entry
 * of a non-reversible motor energizes; for a reversible motor index 1 (`stop`)
 * is the all-relays-off state the backend initializes to.
 */
export function motorStateLabels(actions?: ActuatorActions): string[] {
  if (actions?.state_labels && actions.state_labels.length > 0) {
    return actions.state_labels;
  }
  return actions?.reversible
    ? [...MOTOR_DEFAULT_LABELS_REVERSIBLE]
    : [...MOTOR_DEFAULT_LABELS];
}

export interface ActuatorEntry {
  name: string;
  type: ActuatorType;
  binding: ActuatorBinding;
  actions?: ActuatorActions;
}

export interface CommandBinding {
  target: SourceTarget;
  node?: string | null;
  channel?: number | null;
}

export interface CommandEntry {
  binding: CommandBinding;
  states?: string[] | null;
}

export interface SafetyRules {
  critical?: Array<Record<string, string | string[]>>;
  hazardous?: Array<Record<string, string | string[]>>;
}

/**
 * Connected board/device roster. Optional backend-config section consumed by
 * the Devices page (alongside the live FAS board fleet).
 */
/** [min, max] axis range for a device's chart. */
export type DeviceRange = [number, number];

/**
 * Per-board display config for the Devices + Flight pages. Keyed by board key
 * (e.g. "EPB:0", "PMB:0", "FMC:0"). `ranges` pins chart Y-axes by metric name:
 *  - EPB:  v8v4 | v24v | i8v4 | i24v
 *  - PMB:  vMain | vBatt | vGse | tempAmbient | tempBuck | tempBoost
 *  - FMC:  accel | gyro | mag | accelHi | altitude | pressure | temperature
 * Absent metrics autoscale (no fabricated bounds).
 */
export interface DeviceEntry {
  key: string;
  label?: string;
  ranges?: Record<string, DeviceRange>;
}

export type PacketFieldType = "number" | "bool";

/** One parameter of a FAS TX packet. */
export interface PacketFieldDef {
  key: string;
  label?: string;
  type: PacketFieldType;
  default?: number | boolean;
}

/**
 * A composable FAS transmit packet, consumed by the Console → Transmit Packet
 * card (the available packet types are config-driven, like Commands).
 * `op` is the FAS bridge op (e.g. "pwm_set"); `fields` are its parameters.
 */
export interface PacketEntry {
  name: string;
  op: string;
  fields: PacketFieldDef[];
}

/**
 * Operating procedure (numbered checklist). Optional backend-config section
 * consumed by the Engine procedure card.
 */
export interface ProcedureEntry {
  name: string;
  steps: string[];
}

export interface SystemConfig {
  Sensors?: SensorEntry[];
  Actuators?: ActuatorEntry[];
  Commands?: Record<string, CommandEntry>;
  safetyRules?: SafetyRules;
  /** Optional roster of connected boards → Devices page. */
  Devices?: DeviceEntry[];
  /** Optional packet definitions → Console Channels. */
  Packets?: PacketEntry[];
  /** Optional operating procedures → Engine procedure card. */
  Procedures?: ProcedureEntry[];
  /** Predefined buzzer melodies. Each is an array of [freq_hz, dur_ms] or [freq_hz, dur_ms, vol] tuples. */
  BuzzerMelodies?: Record<string, Array<[number, number] | [number, number, number]>>;
  /** Backend heartbeat to the Pis; a Pi trips `safe` outputs after `timeout_ms` (default 2000). */
  Heartbeat?: HeartbeatConfig;
}

export interface HeartbeatConfig {
  timeout_ms?: number;
}

// ---------------------------------------------------------------------------
// Commands & payloads
// ---------------------------------------------------------------------------

export interface CommandPayload {
  type: string;
  name: string;
  state: string;
}

export interface SystemCommandPayload {
  name: string;
  state?: string | null;
}

/**
 * Thermocouple fault from a Pi's MCC 134 (raw -9999 / -7777 / -8888). The
 * backend sends it with `value` and `avg` null. Kept open to strings so a new
 * fault name still shows instead of vanishing.
 */
export type SensorFault = "open" | "common_mode" | "overrange" | (string & {});

export interface ParsedSensorValue {
  name: string;
  /** null while `fault` is set (or when the backend has no reading). */
  value: number | null;
  avg: number | null;
  unit: string;
  timestamp: number;
  /** null / absent = a good reading. */
  fault?: SensorFault | null;
}

export interface ClientInfo {
  client_id: string;
  role: ClientRole;
}

export interface RoleAssignPayload {
  role: ClientRole;
  password?: string | null; // required when role === "admin"
  target_client_id?: string | null; // omit to change your own role
}

// ---------------------------------------------------------------------------
// Actuator live state (from snapshot / actuator_states WS messages)
// ---------------------------------------------------------------------------

export interface ActuatorState {
  position?: string; // open | closed | F | N | D | ...
  enable?: "enabled" | "disabled" | string;
  power?: "on" | "off" | string;
  arming?: "armed" | "disarmed" | "arm" | "disarm" | string;
  /**
   * Motor state, reported as the current label from `actions.state_labels`
   * (or the defaults). Initializes to the all-relays-off label (stop / off).
   */
  motion?: string;
  state?: string; // fallback for unknown actuators

  // --- Pi output trip (the Pi returned the output to its safe level) --------
  /** Trip reason from the Pi: `max_on_time` or `comms_loss`. Cleared by the next command. */
  tripped?: string;
  /** The tripped output, `gpio:N` or `relay:N`. */
  tripped_output?: string;
  /** When the Pi tripped it, epoch ms. */
  tripped_ms?: number;
}

export type ActuatorStateMap = Record<string, ActuatorState>;

export type LockoutState = "locked" | "unlocked";

// ---------------------------------------------------------------------------
// WebSocket server -> client messages
// ---------------------------------------------------------------------------

export interface SessionMessage {
  type: "session";
  role: ClientRole;
  client_id: string;
  reassigned?: boolean;
}

export interface SnapshotMessage {
  type: "snapshot";
  role: ClientRole;
  client_id: string;
  actuator_states: ActuatorStateMap;
}

export interface ActuatorStatesMessage {
  type: "actuator_states";
  actuator_states: ActuatorStateMap;
}

export interface EngineDataMessage {
  type: "engine_data";
  data: ParsedSensorValue[];
}

export interface ParsedDataMessage {
  type: "parsed_data";
  sensors: ParsedSensorValue[];
}

/** flight_data.data is intentionally opaque passthrough; see flight adapter. */
export interface FlightDataMessage {
  type: "flight_data";
  data: Record<string, unknown>;
}

/** flight_events.events is passthrough; preserve unknown fields. */
export interface FlightEventsMessage {
  type: "flight_events";
  events: Array<Record<string, unknown>>;
}

export interface LockoutMessage {
  type: "lockout";
  state: LockoutState;
}

export interface ErrorMessage {
  type: "error";
  detail: string;
}

/** Console / unknown messages may have arbitrary shape (sometimes no type). */
export interface UnknownMessage {
  type?: string;
  [key: string]: unknown;
}

/** P&ID layout pushed by the server to all connected clients. */
export interface PidLayoutMessage {
  type: "pid_layout";
  /** Opaque blob — validated by parseLayout/validateLayout before storing. */
  layout: Record<string, unknown> | null;
}

/**
 * Broadcast after any config mutation (load/upload/PUT/PATCH/reload). Carries
 * the full updated config — apply it directly instead of re-fetching.
 */
/** One item a Pi refused from its config message. */
export interface PiRejectedItem {
  item: string;
  reason: string;
}

/** One output a Pi returned to its safe level. Latched until the next command for it. */
export interface PiTrip {
  output: string;
  reason: string;
  time_ms: number | null;
  /** Actuators in the active config bound to that output on that Pi. */
  actuators?: string[];
}

/**
 * Per-Pi config status view (backend `GET /api/config/pi` and the
 * `pi_config_status` WS message). See the Pi I/O design doc.
 */
export interface PiConfigStatus {
  node: string;
  target: "GCS" | "TCS" | string;
  /** Content hash of the backend's active config (what it sent). */
  expected_hash: string | null;
  /** false until the Pi has published a status. */
  received: boolean;
  config_hash: string | null;
  applied_ms: number | null;
  rejected: PiRejectedItem[];
  reserved_pins: number[];
  /** HAT address -> channel -> thermocouple type, as applied by the Pi. */
  thermocouples: Record<string, Record<string, string>>;
  tripped: PiTrip[];
  mismatch: boolean;
  mismatch_reasons: string[];
}

export interface PiConfigStatusMessage {
  type: "pi_config_status";
  node: string;
  status: PiConfigStatus;
}

export interface ConfigUpdateMessage {
  type: "config_update";
  config: SystemConfig;
}

export type ServerMessage =
  | SessionMessage
  | SnapshotMessage
  | ActuatorStatesMessage
  | EngineDataMessage
  | ParsedDataMessage
  | FlightDataMessage
  | FlightEventsMessage
  | LockoutMessage
  | PidLayoutMessage
  | ConfigUpdateMessage
  | PiConfigStatusMessage
  | ErrorMessage
  | UnknownMessage;

// ---------------------------------------------------------------------------
// WebSocket client -> server messages
// ---------------------------------------------------------------------------

export interface ClientCommandMessage {
  type: string; // actuator type, e.g. "solenoid"
  name: string;
  state: string;
}

export interface ConsolePassthroughMessage {
  type: "console";
  payload: unknown;
}

export interface RoleRequestMessage {
  type: "role_request";
  role: ClientRole;
  password?: string;
  target_client_id?: string;
}

export type ClientMessage =
  | ClientCommandMessage
  | ConsolePassthroughMessage
  | RoleRequestMessage;

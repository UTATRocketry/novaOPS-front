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

export type SourceTarget = "GCS" | "FAS" | "TCS";
export type SensorType = "PT" | "LC" | "TC";
export type ActuatorType =
  | "servo"
  | "solenoid"
  | "powered_device"
  | "powered_gpio_device"
  | "gpio_device";
export type ConvertMethod = "none" | "linear" | "polynomial";
export type ClientRole = "viewer" | "pad" | "operator" | "admin";

export type SensorBinding =
  | { source: "GCS" | "TCS"; hat_id: number; channel_id: number }
  | { source: "FAS"; node: string; channel: number };

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
}

export interface ActuatorBinding {
  target: SourceTarget;
  node?: string | null;
  relay_channel?: number | null;
  servo_channel?: number | null;
}

export interface ActuatorActions {
  position_aliases?: string[];
  positions?: number[];
  default_position?: string | number | null;
  defaultPosition?: string | number | null; // accepted by config upload/input
  relay_type?: "nominally_off" | "nominally_on" | string | null;
  solenoid_type?: "nominally_closed" | "nominally_open" | string | null;
  gpio_commands?: string[];
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

export interface ParsedSensorValue {
  name: string;
  value: number;
  avg: number;
  unit: string;
  timestamp: number;
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
  state?: string; // fallback for unknown actuators
}

export type ActuatorStateMap = Record<string, ActuatorState>;

export type PhysicalLockoutState = "locked" | "unlocked";

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

export interface PhysicalLockoutMessage {
  type: "physical_lockout";
  state: PhysicalLockoutState;
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
  | PhysicalLockoutMessage
  | PidLayoutMessage
  | ConfigUpdateMessage
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

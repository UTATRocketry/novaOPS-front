import type {
  AdaptedFlightEvents,
  Axis3,
  FlightEvent,
  FlightMilestones,
  FlightTelemetry,
  GpsData,
} from "./types";

export type { AdaptedFlightEvents, FlightEvent, FlightMilestones, FlightTelemetry, GpsData, Axis3 };

// ---------------------------------------------------------------------------
// Backend key map
//
// The exact flight_data.data keys are unsettled (SPEC.md open question).
// Each entry lists candidates in priority order — first finite-number match wins.
// Update this map once the backend schema is finalized; no component code changes.
// ---------------------------------------------------------------------------

const K = {
  altitude:    ["fmc.altitude",    "fmc.baro_alt",   "fmc.baro.alt",  "altitude"],
  pressure:    ["fmc.pressure",    "fmc.baro_press",  "fmc.baro.press", "pressure"],
  temperature: ["fmc.tempH7",      "fmc.temperature", "fmc.temp",      "temperature"],
  velocity:    ["fmc.velocity",    "fmc.vel",         "velocity"],
  inclination: ["fmc.inclination", "fmc.incl",        "inclination"],

  accelX:   ["fmc.accel_x",  "fmc.accelX",  "fmc.imu.accelX"],
  accelY:   ["fmc.accel_y",  "fmc.accelY",  "fmc.imu.accelY"],
  accelZ:   ["fmc.accel_z",  "fmc.accelZ",  "fmc.imu.accelZ"],

  accelHiX: ["fmc.hiG_x",   "fmc.hiGX",    "fmc.high_g_x"],
  accelHiY: ["fmc.hiG_y",   "fmc.hiGY",    "fmc.high_g_y"],
  accelHiZ: ["fmc.hiG_z",   "fmc.hiGZ",    "fmc.high_g_z"],

  gyroX:    ["fmc.gyro_x",  "fmc.gyroX",   "fmc.imu.gyroX"],
  gyroY:    ["fmc.gyro_y",  "fmc.gyroY",   "fmc.imu.gyroY"],
  gyroZ:    ["fmc.gyro_z",  "fmc.gyroZ",   "fmc.imu.gyroZ"],

  magX:     ["fmc.mag_x",   "fmc.magX",    "fmc.imu.magX"],
  magY:     ["fmc.mag_y",   "fmc.magY",    "fmc.imu.magY"],
  magZ:     ["fmc.mag_z",   "fmc.magZ",    "fmc.imu.magZ"],

  gpsLat:   ["fmc.gps_lat", "fmc.gpsLat",  "fmc.gps.lat",  "lat"],
  gpsLon:   ["fmc.gps_lon", "fmc.gpsLon",  "fmc.gps.lon",  "lon"],
  gpsAlt:   ["fmc.gps_alt", "fmc.gpsAlt",  "fmc.gps.alt"],
  gpsFix:   ["fmc.gps_fix", "fmc.gpsFix",  "fmc.gps.fix"],
  gpsSats:  ["fmc.gps_sats","fmc.gpsSats", "fmc.gps.sats"],

  phase:    ["fmc.flight_phase", "fmc.phase", "phase"],
  state:    ["fmc.flight_state", "fmc.state", "state"],
  rawPkt:   ["fmc.raw_packet",   "raw_packet", "rawPacket"],
  ts:       ["fmc.timestamp",    "timestamp"],
} satisfies Record<string, string[]>;

// Milestone names for each FlightMilestone key (lowercase, case-insensitive match)
const MILESTONE_NAMES: Record<keyof FlightMilestones, string[]> = {
  launchDetected: ["launch", "liftoff", "ignition", "launch_detected"],
  motorCutoff:    ["burnout", "motor_burnout", "motor_cutoff", "meco"],
  apogee:         ["apogee", "apogee_detected"],
  drogueDeployed: ["drogue", "drogue_deploy", "drogue_deployed"],
  mainDeployed:   ["main", "main_deploy", "main_deployed", "main_chute", "chute_deploy"],
  landed:         ["landing", "landed", "touchdown", "touch_down"],
};

// ---------------------------------------------------------------------------
// T-0 mission clock (module-level singleton)
//
// Once set by the first launch event, _launchEpochMs persists for the
// session. Call resetMissionClock() to clear it (e.g. on socket teardown).
// ---------------------------------------------------------------------------

let _launchEpochMs: number | null = null;

/** Reset the T-0 reference. Call on socket disconnect if a fresh clock is needed. */
export function resetMissionClock(): void {
  _launchEpochMs = null;
}

/** Returns the epoch-ms T-0 reference, or null if launch has not been detected. */
export function getMissionStartMs(): number | null {
  return _launchEpochMs;
}

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

function readNum(data: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const v = data[key];
    if (typeof v === "number" && isFinite(v)) return v;
    // Accept { value: number } wrapper objects some backends emit
    if (typeof v === "object" && v !== null) {
      const inner = (v as Record<string, unknown>)["value"];
      if (typeof inner === "number" && isFinite(inner)) return inner;
    }
  }
  return undefined;
}

function readStr(data: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const v = data[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

function readBool(data: Record<string, unknown>, keys: string[]): boolean | undefined {
  for (const key of keys) {
    const v = data[key];
    if (typeof v === "boolean") return v;
    if (v === 1 || v === "true"  || v === "1") return true;
    if (v === 0 || v === "false" || v === "0") return false;
  }
  return undefined;
}

function readAxis3(
  data: Record<string, unknown>,
  xK: string[],
  yK: string[],
  zK: string[],
): Axis3 | undefined {
  const x = readNum(data, xK);
  const y = readNum(data, yK);
  const z = readNum(data, zK);
  // Require all three axes — a partial reading would fabricate zeros for the
  // absent components, violating the no-fabricated-value safety rule.
  if (x === undefined || y === undefined || z === undefined) return undefined;
  return { x, y, z, magnitude: Math.sqrt(x * x + y * y + z * z) };
}

// ---------------------------------------------------------------------------
// adaptFlightData
// ---------------------------------------------------------------------------

/**
 * Map raw `flight_data.data` → typed `FlightTelemetry`.
 *
 * Returns only the fields that are present and parseable. Unknown keys in
 * `raw` are silently ignored — the component layer never sees raw backend keys.
 */
export function adaptFlightData(raw: Record<string, unknown>): FlightTelemetry {
  const out: FlightTelemetry = {};

  const altitude = readNum(raw, K.altitude);
  if (altitude !== undefined) out.altitude = altitude;

  const pressure = readNum(raw, K.pressure);
  if (pressure !== undefined) out.pressure = pressure;

  const temperature = readNum(raw, K.temperature);
  if (temperature !== undefined) out.temperature = temperature;

  const velocity = readNum(raw, K.velocity);
  if (velocity !== undefined) out.velocity = velocity;

  const inclination = readNum(raw, K.inclination);
  if (inclination !== undefined) out.inclination = inclination;

  const accel = readAxis3(raw, K.accelX, K.accelY, K.accelZ);
  if (accel) out.accel = accel;

  const accelHi = readAxis3(raw, K.accelHiX, K.accelHiY, K.accelHiZ);
  if (accelHi) out.accelHi = accelHi;

  const gyro = readAxis3(raw, K.gyroX, K.gyroY, K.gyroZ);
  if (gyro) out.gyro = gyro;

  const mag = readAxis3(raw, K.magX, K.magY, K.magZ);
  if (mag) out.mag = mag;

  const lat = readNum(raw, K.gpsLat);
  const lon = readNum(raw, K.gpsLon);
  if (lat !== undefined && lon !== undefined) {
    const gps: GpsData = { lat, lon };
    const alt = readNum(raw, K.gpsAlt);
    if (alt !== undefined) gps.alt = alt;
    const fix = readBool(raw, K.gpsFix);
    if (fix !== undefined) gps.fix = fix;
    const sats = readNum(raw, K.gpsSats);
    if (sats !== undefined) gps.satellites = sats;
    out.gps = gps;
  }

  const phase = readStr(raw, K.phase);
  if (phase) out.phase = phase;

  const state = readStr(raw, K.state);
  if (state) out.state = state;

  const rawPacket = readStr(raw, K.rawPkt);
  if (rawPacket) out.rawPacket = rawPacket;

  const ts = readNum(raw, K.ts);
  if (ts !== undefined) out.timestamp = ts;

  return out;
}

// ---------------------------------------------------------------------------
// adaptFlightEvents
// ---------------------------------------------------------------------------

/**
 * Map raw `flight_events.events` → typed `AdaptedFlightEvents`.
 *
 * Detects launch on first call where the event list contains a launch name;
 * stamps T-0 exactly once for the session (module-level singleton).
 * Unknown event fields are preserved under their original keys.
 */
export function adaptFlightEvents(
  raw: Array<Record<string, unknown>>,
): AdaptedFlightEvents {
  const events: FlightEvent[] = raw.map((e) => ({
    ...e,
    name: typeof e["name"] === "string" ? e["name"] : "UNKNOWN",
    timestamp: typeof e["timestamp"] === "number" ? e["timestamp"] : undefined,
  }));

  const milestones: FlightMilestones = {
    launchDetected: false,
    motorCutoff:    false,
    apogee:         false,
    drogueDeployed: false,
    mainDeployed:   false,
    landed:         false,
  };

  let phase: string | undefined;
  let state: string | undefined;

  for (const e of events) {
    const lower = e.name.toLowerCase();

    if (MILESTONE_NAMES.launchDetected.includes(lower))  milestones.launchDetected = true;
    if (MILESTONE_NAMES.motorCutoff.includes(lower))     milestones.motorCutoff    = true;
    if (MILESTONE_NAMES.apogee.includes(lower))          milestones.apogee         = true;
    if (MILESTONE_NAMES.drogueDeployed.includes(lower))  milestones.drogueDeployed = true;
    if (MILESTONE_NAMES.mainDeployed.includes(lower))    milestones.mainDeployed   = true;
    if (MILESTONE_NAMES.landed.includes(lower))          milestones.landed         = true;

    if (typeof e["phase"] === "string") phase = e["phase"];
    if (typeof e["state"] === "string") state = e["state"];
  }

  // T-0: stamp wall-clock time on first launch detection; never overwrite.
  if (milestones.launchDetected && _launchEpochMs === null) {
    _launchEpochMs = Date.now();
  }

  return { events, milestones, phase, state, launchEpochMs: _launchEpochMs };
}

// ---------------------------------------------------------------------------
// Primitive shapes
// ---------------------------------------------------------------------------

export interface Axis3 {
  x: number;
  y: number;
  z: number;
  /** Pre-computed √(x²+y²+z²). */
  magnitude: number;
}

export interface GpsData {
  lat: number;
  lon: number;
  alt?: number;        // m
  fix?: boolean;
  satellites?: number;
  hdop?: number;       // horizontal dilution of precision
  speed?: number;      // m/s ground speed
}

// ---------------------------------------------------------------------------
// FAS structure (Flight Avionics System) — mirrors flight_data.data
//
// The backend reports a fleet of boards (PMB / EPB / FMC / ...) keyed by
// "<KIND>:<id>". Each family carries its own status block. The backend already
// reports engineering units (V / A / °C / hPa / g / dps / µT), so the adapter
// reads values through unchanged rather than rescaling.
// ---------------------------------------------------------------------------

/** One entry of `fas_boards` — fleet membership + liveness. */
export interface FasBoard {
  key: string;        // "EPB:4"
  kind: string;       // "PMB" | "EPB" | "FMC" | ...
  boardId: number;
  online: boolean;
  uptimeMs?: number;
  numChannels?: number;
  numSensors?: number;
  capsMask?: number;
  fwVersion?: number;
}

/** One PWM/load-switch channel of an EPB (`fas_actuators[key][]`). */
export interface FasActuatorChannel {
  channelIdx: number;
  loadSwOn: boolean;
  pulseUs?: number;
  periodUs?: number;
  faultBits: number;
}

/** Per-board sensor masks (`fas_sensors[key]`). */
export interface FasSensorMasks {
  connectedMask: number;
  saturatedMask: number;
  errorMask: number;
}

/** EPB power rails (`fas_board_status[key]`). Volts / amps. */
export interface FasBoardPower {
  v8v4?: number;   // V
  v24v?: number;   // V
  i8v4?: number;   // A
  i24v?: number;   // A
}

/** PMB status block (`fas_pmb[key]`). */
export interface PmbStatus {
  pwr?: {
    v8v4?: number;   // V
    i8v4?: number;   // A
    v24v0?: number;  // V
    i24v0?: number;  // A
    p8v4?: number;   // W
    p24v0?: number;  // W
  };
  vmon?: {
    vMain?: number;  // V
    vBatt?: number;  // V
    vGse?: number;   // V
    buckOn?: boolean;
    boostOn?: boolean;
    pg3v3?: boolean;
    pg8v4?: boolean;
    pg24v0?: boolean;
    charger?: boolean;
    battSrc?: boolean;
  };
  temp?: {
    ambient?: number; // °C
    buck?: number;    // °C
    boost?: number;   // °C
  };
  charger?: {
    iChg?: number;   // A
    vBat?: number;   // V
    present?: boolean;
    enabled?: boolean;
    vinGood?: boolean;
    charging?: boolean;
    state?: string;
    status?: string;
    cells?: number;
  };
}

/** FMC on-board health flags (`fas_fmc[key].health`). */
export interface FmcHealth {
  imuOk?: boolean;
  accelOk?: boolean;
  magOk?: boolean;
  baroOk?: boolean;
  gpsPresent?: boolean;
}

export interface FmcSdStatus {
  state?: number;
  stateName?: string;
  err?: number;
  pctUsed?: number;
  freeMb?: number;
  totalMb?: number;
  logging?: boolean;
  nearFull?: boolean;
  full?: boolean;
  rateReduced?: boolean;
  stalled?: boolean;
  rateDiv?: number | null;
}

export interface FmcRadioStatus {
  powered?: boolean;
  enabled?: boolean;
  everyN?: number;
  txFrames?: number;
  txBytes?: number;
}

export interface FmcTemps {
  h7?: number;   // °C
  pwr?: number;  // °C
}

/** Full FMC block (`fas_fmc[key]`). */
export interface FmcStatus {
  health?: FmcHealth;
  sd?: FmcSdStatus;
  radio?: FmcRadioStatus;
  temp?: FmcTemps;
}

/** Ignition module controller arming state (`fas_imc`). */
export interface ImcStatus {
  boardId?: number;
  armed: boolean;
  armLine: boolean;
  disarmLine: boolean;
  flags?: number;
}

/** Flight state machine (`fas_fsm`). */
export interface FsmStatus {
  state?: string;
}

// ---------------------------------------------------------------------------
// flight_data adapter output
// ---------------------------------------------------------------------------

/**
 * Typed output of `adaptFlightData`. All fields are optional — components must
 * read defensively and render `—` for anything absent (never a fabricated 0).
 *
 * The leading "kinematics" block is lifted from the active FMC so existing
 * dashboard components keep a stable shape; the FAS blocks below carry the full
 * board fleet for board-aware views.
 */
export interface FlightTelemetry {
  // --- Lifted FMC kinematics (stable shape for dashboard components) --------

  // Barometer / altimeter
  altitude?: number;    // m   (baro.altitude_m)
  pressure?: number;    // hPa
  temperature?: number; // °C

  // Derived / pre-computed kinematics (not transmitted yet)
  velocity?: number;    // m/s
  inclination?: number; // degrees from vertical

  // Inertial sensors — engineering units as reported by the backend.
  /** Low-G 6-DOF IMU acceleration, g. */
  accel?: Axis3;
  /** High-G accelerometer, g. */
  accelHi?: Axis3;
  /** Angular velocity, deg/s. */
  gyro?: Axis3;
  /** Magnetometer, µT. */
  mag?: Axis3;

  // GPS (only present once the FMC has a fix; see fas_fmc gps_pos/gps_info)
  gps?: GpsData;

  // Phase / state — `state` is sourced from the FSM.
  phase?: string;
  state?: string;

  /** Raw comma-delimited telemetry packet string, for the Console packet view. */
  rawPacket?: string;

  /** Representative timestamp (FMC sensor t_ms), as-received. */
  timestamp?: number;

  // --- Full FAS fleet -------------------------------------------------------

  /** All boards reported by `fas_boards`. */
  boards?: FasBoard[];
  /** Actuator channels keyed by board (`fas_actuators`). */
  actuators?: Record<string, FasActuatorChannel[]>;
  /** Sensor masks keyed by board (`fas_sensors`). */
  sensorMasks?: Record<string, FasSensorMasks>;
  /** EPB power rails keyed by board (`fas_board_status`). */
  boardPower?: Record<string, FasBoardPower>;
  /** PMB status keyed by board (`fas_pmb`). */
  pmb?: Record<string, PmbStatus>;
  /** FMC housekeeping keyed by board (`fas_fmc`). */
  fmc?: Record<string, FmcStatus>;
  /** Ignition module controller arming (`fas_imc`). */
  imc?: ImcStatus;
  /** Flight state machine (`fas_fsm`). */
  fsm?: FsmStatus;
}

// ---------------------------------------------------------------------------
// flight_events adapter output
// ---------------------------------------------------------------------------

export interface FlightMilestones {
  launchDetected: boolean;
  motorBurnout: boolean;
  apogeeDetected: boolean;
  drogueDeployed: boolean;
  mainDeployed: boolean;
  landingDetected: boolean;
}

export interface FlightEvent {
  name: string;
  timestamp?: number;
  [key: string]: unknown;
}

/**
 * Typed output of `adaptFlightEvents`.
 *
 * Components should read `milestones` (typed booleans) and `launchEpochMs`
 * (T-0 reference for the mission clock) rather than scanning raw `events`.
 */
export interface AdaptedFlightEvents {
  events: FlightEvent[];
  milestones: FlightMilestones;
  phase?: string;
  state?: string;
  /**
   * Wall-clock epoch ms when the launch event was first received.
   * Drives the T+ mission clock. Null until launch is detected.
   */
  launchEpochMs: number | null;
}

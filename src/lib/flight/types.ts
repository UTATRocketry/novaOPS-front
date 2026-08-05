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
    /** Firmware battery UVLO/OV protect engaged — converters cut. FAULT when true. */
    protect?: boolean;
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
  /** Charger DAC read-back / firmware limits (`fas_pmb[key].chg_cfg`). */
  chgCfg?: {
    iSetting?: number;   // charge-current DAC code (0..31)
    vSetting?: number;   // charge-voltage DAC code (0..31)
    cells?: number;
    vlimit?: boolean;    // firmware charge-voltage cutoff currently holding
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

/**
 * Recovery Arming Board status (`fas_rab[key]`). One per RAB (A = RAB:0, B = RAB:1).
 *
 * The RAB reports *actual* pin states plus its own commanded intent, so the UI can
 * show intent vs. readback side by side. `armMismatch` is the authoritative alarm —
 * the legacy FMC-side `disagree` field is deprecated and deliberately not modelled.
 */
export interface RabStatus {
  rabId: number;        // 0 = A, 1 = B
  fcArmed: boolean;     // RAB read: flight computer armed
  armLine: boolean;     // GPIO_ARM output level
  disarmLine: boolean;  // GPIO_DISARM output level
  fcArmedGpio: boolean; // FMC's redundant direct read
  fmcRx: boolean;       // FMC->RAB link alive (RAB hears the FMC)
  rxCount8?: number;    // low 8 bits of RAB's FMC-RX byte counter (liveness)
  armMismatch: boolean; // RAB-local commanded != observed (>~1 s) — ALARM
  armExpected: boolean; // RAB last commanded ARMED
  online?: boolean;
  uptimeMs?: number;
  flags?: number;
}

/** FMC auxiliary status (`fas_aux`): RunCam power + GNSS time-pulse. */
export interface FmcAuxStatus {
  runcamPowered: boolean;
  ppsPresent: boolean;   // GNSS PPS rising edge seen within ~2 s
  ppsCount?: number;     // rising-edge counter (wraps)
  ppsAgeMs?: number;     // ms since last edge (undefined if never)
}

/** FMC RF telemetry rate/power mode (`fas_rf`). Persisted on the FMC; echoed ~1 Hz. */
export interface FmcRfStatus {
  rateMode: number;         // 0 = low, 1 = normal, 2 = high
  rateName?: string;        // "low" | "normal" | "high"
}

/** Soundboard status (`fas_sound.status`). */
export interface SoundStatus {
  clipCount?: number;
  playingIdx?: number | null; // null = idle
  pct?: number;               // clear/erase progress 0..100 (100 = idle)
  usedKb?: number;
  capKb?: number;
  busy?: boolean;
  ulActive?: boolean;
  ulReady?: boolean;
  tone?: boolean;             // a generated tone is currently sounding
}

/** One stored soundboard clip (`fas_sound.clips[]`). */
export interface SoundClip {
  idx: number;
  format?: number;      // 1 = IMA-ADPCM, 2 = PCM_S16
  length?: number;      // stored bytes
  sampleRate?: number;  // Hz
  name: string;
}

export interface SoundboardStatus {
  status?: SoundStatus;
  clips?: SoundClip[];
}

/** Flight state machine (`fas_fsm`). */
export interface FsmStatus {
  state?: string;
  phase?: string;
}

/**
 * FAS bridge serial-link state (`fas_link`, and the `console_serial` console
 * message — the two carry the same object).
 *
 * This is the bridge's own RS-422 port, not a board: `connected: false` means
 * the bridge is up but has no port open (never configured, unplugged, or in use
 * elsewhere) and every other `fas_*` block is going stale. `port` is `""` when
 * no port is configured; `error` is null after an explicit disconnect.
 */
export interface FasLink {
  connected: boolean;
  port: string | null;
  baud: number | null;
  error: string | null;
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
  /** Recovery Arming Boards keyed by board (`fas_rab`). */
  rab?: Record<string, RabStatus>;
  /** FMC auxiliary status (`fas_aux`). */
  aux?: FmcAuxStatus;
  /** FMC RF telemetry rate/power mode (`fas_rf`). */
  rf?: FmcRfStatus;
  /** Soundboard status + clip directory (`fas_sound`). */
  sound?: SoundboardStatus;
  /** Flight state machine (`fas_fsm`). */
  fsm?: FsmStatus;
  /** Bridge serial-link state (`fas_link`). Absent when the payload omits it. */
  link?: FasLink;
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

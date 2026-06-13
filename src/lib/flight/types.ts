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
  alt?: number;
  fix?: boolean;
  satellites?: number;
}

// ---------------------------------------------------------------------------
// flight_data adapter output
// ---------------------------------------------------------------------------

/**
 * Typed output of `adaptFlightData`. All fields are optional — the backend
 * shape is unsettled (SPEC.md open question); components must read defensively.
 *
 * Components should depend only on this shape, never on raw backend keys.
 */
export interface FlightTelemetry {
  // Barometer / altimeter
  altitude?: number;    // m
  pressure?: number;    // hPa
  temperature?: number; // °C

  // Derived / pre-computed kinematics
  velocity?: number;    // m/s  (backend pre-computed, or derived later)
  inclination?: number; // degrees from vertical

  // Inertial sensors
  /** Low-G 6-DOF IMU — linear acceleration, m/s². */
  accel?: Axis3;
  /** High-G accelerometer, g. */
  accelHi?: Axis3;
  /** Angular velocity, deg/s. */
  gyro?: Axis3;

  // Magnetometer, µT
  mag?: Axis3;

  // GPS
  gps?: GpsData;

  // Phase/state (may arrive in flight_data or be derived from flight_events)
  phase?: string;
  state?: string;

  /** Raw comma-delimited telemetry packet string, for the Console packet view. */
  rawPacket?: string;

  /** Backend-provided timestamp (epoch ms or relative, as-received). */
  timestamp?: number;
}

// ---------------------------------------------------------------------------
// flight_events adapter output
// ---------------------------------------------------------------------------

export interface FlightMilestones {
  launchDetected: boolean;
  motorCutoff: boolean;
  apogee: boolean;
  drogueDeployed: boolean;
  mainDeployed: boolean;
  landed: boolean;
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

// ---------------------------------------------------------------------------
// Central flight telemetry recorder
//
// A module-level singleton that samples the live `flightData` store slice at a
// fixed cadence into rolling, struct-of-arrays buffers. It is started on socket
// open and runs regardless of which page is mounted, so:
//   - rolling-window charts keep collecting from the moment the user connects
//     and survive page navigation (the buffer lives here, not in a component);
//   - the Graph tab's flight history accrues from launch even when the user is
//     not on that page.
//
// Buffers hold engineering-unit values as recorded (one column per channel,
// NaN where a value was absent — never a fabricated 0). Velocity is derived
// here (the FAS packet does not transmit it) with the same EMA estimator the
// dashboard KPI uses, so the recorded series matches the live readout.
// ---------------------------------------------------------------------------

import { useNovaStore } from "../store";
import type { FlightTelemetry } from "./types";

// ---- Channel catalogue -----------------------------------------------------

export type FlightChannel =
  | "altitude" | "pressure" | "temperature" | "velocity"
  | "accelMag" | "accelX" | "accelY" | "accelZ"
  | "gyroX" | "gyroY" | "gyroZ" | "gyroMag"
  | "magX" | "magY" | "magZ" | "magMag"
  | "accelHiX" | "accelHiY" | "accelHiZ" | "accelHiMag";

const CHANNELS: FlightChannel[] = [
  "altitude", "pressure", "temperature", "velocity",
  "accelMag", "accelX", "accelY", "accelZ",
  "gyroX", "gyroY", "gyroZ", "gyroMag",
  "magX", "magY", "magZ", "magMag",
  "accelHiX", "accelHiY", "accelHiZ", "accelHiMag",
];

/** Channel groups for the dashboard rolling charts (order matches AXIS3_SERIES). */
export const CH_ALTITUDE: FlightChannel[] = ["altitude"];
export const CH_ACCEL:    FlightChannel[] = ["accelX", "accelY", "accelZ", "accelMag"];
export const CH_GYRO:     FlightChannel[] = ["gyroX", "gyroY", "gyroZ", "gyroMag"];
export const CH_MAG:      FlightChannel[] = ["magX", "magY", "magZ", "magMag"];
export const CH_ACCEL_HI: FlightChannel[] = ["accelHiX", "accelHiY", "accelHiZ", "accelHiMag"];

// ---- Tuning ----------------------------------------------------------------

const TICK_MS = 100;        // 10 Hz sampling — smooth scroll comes from the
                            //   chart's per-frame x-scale animation, not density
const MAX_POINTS = 18_000;  // ~30 min at 10 Hz (rolling cap, oldest dropped)

// Velocity estimator (mirrors useFlightKinematics).
const EMA_ALPHA = 0.3;
const MAX_DT_S = 2;

// ---- Buffers (struct-of-arrays) --------------------------------------------

let tsSec: number[] = [];
const buf: Record<FlightChannel, number[]> = Object.fromEntries(
  CHANNELS.map((c) => [c, [] as number[]]),
) as Record<FlightChannel, number[]>;

// Velocity derivation state.
let _vLastAlt: number | null = null;
let _vLastT: number | null = null;
let _vel: number | undefined;
let _vLastData: unknown = null;

let _timer: ReturnType<typeof setInterval> | null = null;

// ---- Helpers ---------------------------------------------------------------

const fin = (v: number | undefined): number =>
  typeof v === "number" && Number.isFinite(v) ? v : NaN;

/** Update the velocity EMA only when a fresh telemetry object has arrived. */
function updateVelocity(data: FlightTelemetry | null): void {
  if (data === _vLastData) return; // no new telemetry — hold last velocity
  _vLastData = data;

  const alt = data?.altitude;
  if (alt == null || !Number.isFinite(alt)) {
    _vLastAlt = null;
    _vLastT = null;
    _vel = undefined;
    return;
  }
  const tSec = data?.timestamp != null ? data.timestamp / 1000 : Date.now() / 1000;
  if (_vLastAlt !== null && _vLastT !== null) {
    const dt = tSec - _vLastT;
    if (dt > 0 && dt <= MAX_DT_S) {
      const inst = (alt - _vLastAlt) / dt;
      _vel = _vel === undefined ? inst : EMA_ALPHA * inst + (1 - EMA_ALPHA) * _vel;
    }
  }
  _vLastAlt = alt;
  _vLastT = tSec;
}

/** Extract every channel's current value (NaN where absent). */
function extract(t: FlightTelemetry | null): Record<FlightChannel, number> {
  return {
    altitude: fin(t?.altitude),
    pressure: fin(t?.pressure),
    temperature: fin(t?.temperature),
    velocity: _vel != null && Number.isFinite(_vel) ? _vel : NaN,
    accelMag: fin(t?.accel?.magnitude),
    accelX: fin(t?.accel?.x), accelY: fin(t?.accel?.y), accelZ: fin(t?.accel?.z),
    gyroX: fin(t?.gyro?.x), gyroY: fin(t?.gyro?.y), gyroZ: fin(t?.gyro?.z),
    gyroMag: fin(t?.gyro?.magnitude),
    magX: fin(t?.mag?.x), magY: fin(t?.mag?.y), magZ: fin(t?.mag?.z),
    magMag: fin(t?.mag?.magnitude),
    accelHiX: fin(t?.accelHi?.x), accelHiY: fin(t?.accelHi?.y), accelHiZ: fin(t?.accelHi?.z),
    accelHiMag: fin(t?.accelHi?.magnitude),
  };
}

function tick(): void {
  const slice = useNovaStore.getState().flightData;
  const data = slice.data;
  updateVelocity(data);
  const vals = extract(data);

  tsSec.push(Date.now() / 1000);
  for (const ch of CHANNELS) buf[ch].push(vals[ch]);

  const over = tsSec.length - MAX_POINTS;
  if (over > 0) {
    tsSec.splice(0, over);
    for (const ch of CHANNELS) buf[ch].splice(0, over);
  }
}

/** First index whose timestamp is >= `t` (binary search; tsSec is ascending). */
function lowerBound(arr: number[], t: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// ---- Public API ------------------------------------------------------------

/** Begin sampling. Idempotent — safe to call on every socket (re)open. */
export function startFlightRecorder(): void {
  if (_timer) return;
  _timer = setInterval(tick, TICK_MS);
}

/** Stop sampling. Retains the buffer (a transient reconnect keeps history). */
export function stopFlightRecorder(): void {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}

/** Empty the buffer and reset the velocity estimator (new flight / teardown). */
export function clearFlightRecord(): void {
  tsSec = [];
  for (const ch of CHANNELS) buf[ch] = [];
  _vLastAlt = null;
  _vLastT = null;
  _vel = undefined;
  _vLastData = null;
}

/**
 * Windowed slice for a rolling chart. Returns the last `windowSec` of samples
 * (x in seconds), clamped to start no earlier than `sinceLaunchMs` when set —
 * so the dashboard window visually "resets" to T-0 at launch.
 */
export function sampleWindow(
  channels: FlightChannel[],
  windowSec: number,
  sinceLaunchMs?: number | null,
): { xs: number[]; ys: number[][] } {
  const nowSec = Date.now() / 1000;
  let minT = nowSec - windowSec;
  if (sinceLaunchMs != null) minT = Math.max(minT, sinceLaunchMs / 1000);
  const start = lowerBound(tsSec, minT);
  return {
    xs: tsSec.slice(start),
    ys: channels.map((ch) => buf[ch].slice(start)),
  };
}

/**
 * Live references to the full record (x in seconds + every channel column).
 * Read synchronously — the sampler only mutates on a timer, so a synchronous
 * consumer (chart build / render) sees consistent array lengths.
 */
export function getFlightSeries(): { tsSec: number[]; channels: Record<FlightChannel, number[]> } {
  return { tsSec, channels: buf };
}

/** First sample index at or after `t` seconds (exposed for windowing callers). */
export function flightIndexAtOrAfter(t: number): number {
  return lowerBound(tsSec, t);
}

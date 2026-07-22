import type {
  AdaptedFlightEvents,
  Axis3,
  FasActuatorChannel,
  FasBoard,
  FasBoardPower,
  FasSensorMasks,
  FlightEvent,
  FlightMilestones,
  FlightTelemetry,
  FmcAuxStatus,
  FmcRfStatus,
  FmcStatus,
  GpsData,
  ImcStatus,
  PmbStatus,
  RabStatus,
  SoundClip,
  SoundStatus,
  SoundboardStatus,
} from "./types";
import { clearFlightRecord } from "./recorder";

export type {
  AdaptedFlightEvents,
  FasActuatorChannel,
  FasBoard,
  FasBoardPower,
  FasSensorMasks,
  FlightEvent,
  FlightMilestones,
  FlightTelemetry,
  FmcAuxStatus,
  FmcRfStatus,
  FmcStatus,
  GpsData,
  ImcStatus,
  PmbStatus,
  RabStatus,
  SoundClip,
  SoundStatus,
  SoundboardStatus,
  Axis3,
};

// The backend reports engineering units directly (V / A / °C / hPa / g / dps /
// µT), so the adapter reads values through unchanged — no rescaling here.

// Milestone names for each FlightMilestone key (lowercase, case-insensitive match)
const MILESTONE_NAMES: Record<keyof FlightMilestones, string[]> = {
  launchDetected:  ["launch", "liftoff", "ignition", "launch_detected"],
  motorBurnout:    ["burnout", "motor_burnout", "motor_cutoff", "meco"],
  apogeeDetected:  ["apogee", "apogee_detected"],
  drogueDeployed:  ["drogue", "drogue_deploy", "drogue_deployed"],
  mainDeployed:    ["main", "main_deploy", "main_deployed", "main_chute", "chute_deploy"],
  landingDetected: ["landing", "landed", "touchdown", "touch_down"],
};

// ---------------------------------------------------------------------------
// T-0 mission clock (module-level singleton)
//
// Once set by the first launch event, _launchEpochMs persists for the
// session. Call resetMissionClock() to clear it (e.g. on socket teardown).
// ---------------------------------------------------------------------------

let _launchEpochMs: number | null = null;

/**
 * Latched milestone flags. Once a milestone is detected it stays TRUE for the
 * rest of the flight — a later `flight_events` message that omits the event must
 * not flip the flag back to FALSE. The latch clears only when the FAS state
 * returns to "standby" (operator armed a fresh cycle) or the socket tears down.
 */
const _latchedMilestones: FlightMilestones = {
  launchDetected: false,
  motorBurnout: false,
  apogeeDetected: false,
  drogueDeployed: false,
  mainDeployed: false,
  landingDetected: false,
};

/**
 * Reset the per-flight session: the T-0 reference and every latched milestone.
 * Call on socket disconnect, or when the FAS state returns to "standby".
 */
export function resetFlightSession(): void {
  _launchEpochMs = null;
  _latchedMilestones.launchDetected = false;
  _latchedMilestones.motorBurnout = false;
  _latchedMilestones.apogeeDetected = false;
  _latchedMilestones.drogueDeployed = false;
  _latchedMilestones.mainDeployed = false;
  _latchedMilestones.landingDetected = false;
  // Drop the recorded flight history — a new cycle records from scratch.
  clearFlightRecord();
}

/** Back-compat alias — resets the full flight session (T-0 + latched flags). */
export function resetMissionClock(): void {
  resetFlightSession();
}

/**
 * Observe a FAS state string from either adapter. A transition back to
 * "standby" means the previous flight is over and the vehicle is armed for a new
 * cycle — clear the latch and T-0 so a fresh launch re-latches from scratch.
 * No-op for every other state.
 */
function noteFlightState(state: string | undefined): void {
  if (typeof state === "string" && state.toLowerCase() === "standby") {
    resetFlightSession();
  }
}

/** Returns the epoch-ms T-0 reference, or null if launch has not been detected. */
export function getMissionStartMs(): number | null {
  return _launchEpochMs;
}

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

function num(v: unknown): number | undefined {
  return typeof v === "number" && isFinite(v) ? v : undefined;
}

function bool(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (v === 1 || v === "1") return true;
  if (v === 0 || v === "0") return false;
  return undefined;
}

function obj(v: unknown): Record<string, unknown> | undefined {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
}

/** Build an Axis3 from a `{ axes: [x, y, z] }` block. Requires all three axes. */
function axis3(block: unknown): Axis3 | undefined {
  const o = obj(block);
  if (!o) return undefined;
  const axes = o["axes"];
  if (!Array.isArray(axes) || axes.length < 3) return undefined;
  const x = num(axes[0]);
  const y = num(axes[1]);
  const z = num(axes[2]);
  if (x === undefined || y === undefined || z === undefined) return undefined;
  return { x, y, z, magnitude: Math.sqrt(x * x + y * y + z * z) };
}

/** Assign `out[key] = value` only when value is defined. */
function put<T extends object, K extends keyof T>(out: T, key: K, value: T[K] | undefined): void {
  if (value !== undefined) out[key] = value;
}

// ---------------------------------------------------------------------------
// FAS block parsers
// ---------------------------------------------------------------------------

function parseBoards(raw: unknown): FasBoard[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const boards: FasBoard[] = [];
  for (const entry of raw) {
    const o = obj(entry);
    if (!o) continue;
    const key = typeof o["key"] === "string" ? o["key"] : undefined;
    const kind = typeof o["kind"] === "string" ? o["kind"] : undefined;
    const boardId = num(o["board_id"]);
    if (key === undefined || kind === undefined || boardId === undefined) continue;
    const board: FasBoard = { key, kind, boardId, online: bool(o["online"]) ?? false };
    put(board, "uptimeMs", num(o["uptime_ms"]));
    put(board, "numChannels", num(o["num_channels"]));
    put(board, "numSensors", num(o["num_sensors"]));
    put(board, "capsMask", num(o["caps_mask"]));
    put(board, "fwVersion", num(o["fw_version"]));
    boards.push(board);
  }
  return boards.length > 0 ? boards : undefined;
}

function parseActuators(raw: unknown): Record<string, FasActuatorChannel[]> | undefined {
  const map = obj(raw);
  if (!map) return undefined;
  const out: Record<string, FasActuatorChannel[]> = {};
  for (const [key, list] of Object.entries(map)) {
    if (!Array.isArray(list)) continue;
    const channels: FasActuatorChannel[] = [];
    for (const entry of list) {
      const o = obj(entry);
      if (!o) continue;
      const channelIdx = num(o["channel_idx"]);
      if (channelIdx === undefined) continue;
      const ch: FasActuatorChannel = {
        channelIdx,
        loadSwOn: bool(o["load_sw_on"]) ?? false,
        faultBits: num(o["fault_bits"]) ?? 0,
      };
      put(ch, "pulseUs", num(o["pulse_us"]));
      put(ch, "periodUs", num(o["period_us"]));
      channels.push(ch);
    }
    if (channels.length > 0) out[key] = channels;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function parseSensorMasks(raw: unknown): Record<string, FasSensorMasks> | undefined {
  const map = obj(raw);
  if (!map) return undefined;
  const out: Record<string, FasSensorMasks> = {};
  for (const [key, value] of Object.entries(map)) {
    const o = obj(value);
    if (!o) continue;
    out[key] = {
      connectedMask: num(o["connected_mask"]) ?? 0,
      saturatedMask: num(o["saturated_mask"]) ?? 0,
      errorMask: num(o["error_mask"]) ?? 0,
    };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function parseBoardPower(raw: unknown): Record<string, FasBoardPower> | undefined {
  const map = obj(raw);
  if (!map) return undefined;
  const out: Record<string, FasBoardPower> = {};
  for (const [key, value] of Object.entries(map)) {
    const o = obj(value);
    if (!o) continue;
    const power: FasBoardPower = {};
    put(power, "v8v4", num(o["v_8v4"]));
    put(power, "v24v", num(o["v_24v0"]));
    put(power, "i8v4", num(o["i_8v4"]));
    put(power, "i24v", num(o["i_24v0"]));
    out[key] = power;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function parsePmb(raw: unknown): Record<string, PmbStatus> | undefined {
  const map = obj(raw);
  if (!map) return undefined;
  const out: Record<string, PmbStatus> = {};
  for (const [key, value] of Object.entries(map)) {
    const o = obj(value);
    if (!o) continue;
    const status: PmbStatus = {};

    const pwr = obj(o["pwr"]);
    if (pwr) {
      const block: NonNullable<PmbStatus["pwr"]> = {};
      put(block, "v8v4", num(pwr["v_8v4"]));
      put(block, "i8v4", num(pwr["i_8v4"]));
      put(block, "v24v0", num(pwr["v_24v0"]));
      put(block, "i24v0", num(pwr["i_24v0"]));
      put(block, "p8v4", num(pwr["p_8v4"]));
      put(block, "p24v0", num(pwr["p_24v0"]));
      status.pwr = block;
    }

    const vmon = obj(o["vmon"]);
    if (vmon) {
      const block: NonNullable<PmbStatus["vmon"]> = {};
      put(block, "vMain", num(vmon["v_main"]));
      put(block, "vBatt", num(vmon["v_batt"]));
      put(block, "vGse", num(vmon["v_gse"]));
      put(block, "buckOn", bool(vmon["buck_on"]));
      put(block, "boostOn", bool(vmon["boost_on"]));
      put(block, "pg3v3", bool(vmon["pg_3v3"]));
      put(block, "pg8v4", bool(vmon["pg_8v4"]));
      put(block, "pg24v0", bool(vmon["pg_24v0"]));
      put(block, "charger", bool(vmon["charger"]));
      put(block, "battSrc", bool(vmon["batt_src"]));
      put(block, "protect", bool(vmon["protect"]));
      status.vmon = block;
    }

    const temp = obj(o["temp"]);
    if (temp) {
      const block: NonNullable<PmbStatus["temp"]> = {};
      put(block, "ambient", num(temp["temp_amb"]));
      put(block, "buck", num(temp["temp_buck"]));
      put(block, "boost", num(temp["temp_boost"]));
      status.temp = block;
    }

    const charger = obj(o["charger"]);
    if (charger) {
      const block: NonNullable<PmbStatus["charger"]> = {};
      put(block, "iChg", num(charger["i_chg_a"]));
      put(block, "vBat", num(charger["v_bat"]));
      put(block, "present", bool(charger["present"]));
      put(block, "enabled", bool(charger["enabled"]));
      put(block, "vinGood", bool(charger["vin_good"]));
      put(block, "charging", bool(charger["charging"]));
      put(block, "state", typeof charger["state"] === "string" ? (charger["state"] as string) : undefined);
      put(block, "status", typeof charger["status"] === "string" ? (charger["status"] as string) : undefined);
      put(block, "cells", num(charger["cells"]));
      status.charger = block;
    }

    const chgCfg = obj(o["chg_cfg"]);
    if (chgCfg) {
      const block: NonNullable<PmbStatus["chgCfg"]> = {};
      put(block, "iSetting", num(chgCfg["i_setting"]));
      put(block, "vSetting", num(chgCfg["v_setting"]));
      put(block, "cells", num(chgCfg["cells"]));
      put(block, "vlimit", bool(chgCfg["vlimit"]));
      status.chgCfg = block;
    }

    out[key] = status;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function parseFmc(raw: unknown): Record<string, FmcStatus> | undefined {
  const map = obj(raw);
  if (!map) return undefined;
  const out: Record<string, FmcStatus> = {};
  for (const [key, value] of Object.entries(map)) {
    const o = obj(value);
    if (!o) continue;
    const status: FmcStatus = {};

    const health = obj(o["health"]);
    if (health) {
      const block: NonNullable<FmcStatus["health"]> = {};
      put(block, "imuOk", bool(health["imu_ok"]));
      put(block, "accelOk", bool(health["accel_ok"]));
      put(block, "magOk", bool(health["mag_ok"]));
      put(block, "baroOk", bool(health["baro_ok"]));
      put(block, "gpsPresent", bool(health["gps_present"]));
      status.health = block;
    }

    const sd = obj(o["sd"]);
    if (sd) {
      const block: NonNullable<FmcStatus["sd"]> = {};
      put(block, "state",       num(sd["state"]));
      put(block, "stateName",   typeof sd["state_name"] === "string" ? (sd["state_name"] as string) : undefined);
      put(block, "err",         num(sd["err"]));
      put(block, "pctUsed",     num(sd["pct_used"]));
      put(block, "freeMb",      num(sd["free_mb"]));
      put(block, "totalMb",     num(sd["total_mb"]));
      put(block, "logging",     bool(sd["logging"]));
      put(block, "nearFull",    bool(sd["near_full"]));
      put(block, "full",        bool(sd["full"]));
      put(block, "rateReduced", bool(sd["rate_reduced"]));
      put(block, "stalled",     bool(sd["stalled"]));
      // rate_div can be null (custom divisor outside standard set) or a number
      if (sd["rate_div"] !== undefined) block.rateDiv = sd["rate_div"] === null ? null : num(sd["rate_div"]);
      status.sd = block;
    }

    const radio = obj(o["radio"]);
    if (radio) {
      const block: NonNullable<FmcStatus["radio"]> = {};
      put(block, "powered", bool(radio["powered"]));
      put(block, "enabled", bool(radio["enabled"]));
      put(block, "everyN", num(radio["every_n"]));
      put(block, "txFrames", num(radio["tx_frames"]));
      put(block, "txBytes", num(radio["tx_bytes"]));
      status.radio = block;
    }

    const temp = obj(o["temp"]);
    if (temp) {
      const block: NonNullable<FmcStatus["temp"]> = {};
      put(block, "h7", num(temp["temp_h7"]));
      put(block, "pwr", num(temp["temp_pwr"]));
      status.temp = block;
    }

    out[key] = status;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function parseImc(raw: unknown): ImcStatus | undefined {
  const o = obj(raw);
  if (!o) return undefined;
  const imc: ImcStatus = {
    armed: bool(o["armed"]) ?? false,
    armLine: bool(o["arm_line"]) ?? false,
    disarmLine: bool(o["disarm_line"]) ?? false,
  };
  put(imc, "boardId", num(o["board_id"]));
  put(imc, "flags", num(o["flags"]));
  return imc;
}

/**
 * Recovery Arming Boards (`fas_rab`), keyed "RAB:0" / "RAB:1".
 *
 * The legacy `disagree` field / RT_RAB_FLAG_DISAGREE bit is deliberately not read —
 * it is superseded by the RAB-local `arm_mismatch`.
 */
function parseRab(raw: unknown): Record<string, RabStatus> | undefined {
  const map = obj(raw);
  if (!map) return undefined;
  const out: Record<string, RabStatus> = {};
  for (const [key, value] of Object.entries(map)) {
    const o = obj(value);
    if (!o) continue;
    const status: RabStatus = {
      rabId: num(o["rab_id"]) ?? 0,
      fcArmed: bool(o["fc_armed"]) ?? false,
      armLine: bool(o["arm_line"]) ?? false,
      disarmLine: bool(o["disarm_line"]) ?? false,
      fcArmedGpio: bool(o["fc_armed_gpio"]) ?? false,
      fmcRx: bool(o["fmc_rx"]) ?? false,
      armMismatch: bool(o["arm_mismatch"]) ?? false,
      armExpected: bool(o["arm_expected"]) ?? false,
    };
    put(status, "rxCount8", num(o["rx_count8"]));
    put(status, "online", bool(o["online"]));
    put(status, "uptimeMs", num(o["uptime_ms"]));
    put(status, "flags", num(o["flags"]));
    out[key] = status;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function parseAux(raw: unknown): FmcAuxStatus | undefined {
  const o = obj(raw);
  if (!o) return undefined;
  const aux: FmcAuxStatus = {
    runcamPowered: bool(o["runcam_powered"]) ?? false,
    ppsPresent: bool(o["pps_present"]) ?? false,
  };
  put(aux, "ppsCount", num(o["pps_count"]));
  put(aux, "ppsAgeMs", num(o["pps_age_ms"]));
  return aux;
}

function parseRf(raw: unknown): FmcRfStatus | undefined {
  const o = obj(raw);
  if (!o) return undefined;
  const mode = num(o["rate_mode"]);
  if (mode === undefined) return undefined;
  const rf: FmcRfStatus = { rateMode: mode };
  put(rf, "rateName", typeof o["rate_name"] === "string" ? (o["rate_name"] as string) : undefined);
  return rf;
}

function parseSound(raw: unknown): SoundboardStatus | undefined {
  const o = obj(raw);
  if (!o) return undefined;
  const out: SoundboardStatus = {};

  const st = obj(o["status"]);
  if (st) {
    const s: SoundStatus = {};
    put(s, "clipCount", num(st["clip_count"]));
    // playing_idx may be null (idle) or a clip index
    if (st["playing_idx"] !== undefined)
      s.playingIdx = st["playing_idx"] === null ? null : num(st["playing_idx"]) ?? null;
    put(s, "pct", num(st["pct"]));
    put(s, "usedKb", num(st["used_kb"]));
    put(s, "capKb", num(st["cap_kb"]));
    put(s, "busy", bool(st["busy"]));
    put(s, "ulActive", bool(st["ul_active"]));
    put(s, "ulReady", bool(st["ul_ready"]));
    put(s, "tone", bool(st["tone"]));
    out.status = s;
  }

  const clips = o["clips"];
  if (Array.isArray(clips)) {
    const list: SoundClip[] = [];
    for (const entry of clips) {
      const c = obj(entry);
      if (!c) continue;
      const idx = num(c["idx"]);
      if (idx === undefined) continue;
      const clip: SoundClip = { idx, name: typeof c["name"] === "string" ? (c["name"] as string) : "" };
      put(clip, "format", num(c["format"]));
      put(clip, "length", num(c["length"]));
      put(clip, "sampleRate", num(c["sample_rate"]));
      list.push(clip);
    }
    if (list.length > 0) out.clips = list;
  }

  return out.status || out.clips ? out : undefined;
}

/** First entry of `fas_fmc` — the active flight computer for lifted kinematics. */
function firstFmcRaw(fasFmc: unknown): Record<string, unknown> | undefined {
  const map = obj(fasFmc);
  if (!map) return undefined;
  for (const value of Object.values(map)) {
    const o = obj(value);
    if (o) return o;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// adaptFlightData
// ---------------------------------------------------------------------------

/**
 * Map raw `flight_data.data` (the FAS structure) → typed `FlightTelemetry`.
 *
 * Lifts the active FMC's inertial + barometer readings to the top level for the
 * dashboard components, and carries the full board fleet under the FAS blocks.
 * Only present, parseable fields are set — absent data stays `undefined` so the
 * UI renders `—` rather than a fabricated value.
 */
export function adaptFlightData(raw: Record<string, unknown>): FlightTelemetry {
  const out: FlightTelemetry = {};

  // --- Lifted FMC kinematics ------------------------------------------------
  const fmc = firstFmcRaw(raw["fas_fmc"]);
  if (fmc) {
    put(out, "accel", axis3(fmc["imu_accel"]));
    put(out, "gyro", axis3(fmc["imu_gyro"]));
    put(out, "accelHi", axis3(fmc["accel_hg"]));
    put(out, "mag", axis3(fmc["mag"]));

    const baro = obj(fmc["baro"]);
    if (baro) {
      put(out, "pressure", num(baro["pressure_hpa"]));
      put(out, "temperature", num(baro["temp_c"]));
      put(out, "altitude", num(baro["altitude_m"]));
    }

    // GPS — only present once the FMC has a position fix.
    const pos = obj(fmc["gps_pos"]);
    const info = obj(fmc["gps_info"]);
    const lat = pos ? num(pos["lat"]) : undefined;
    const lon = pos ? num(pos["lon"]) : undefined;
    if (lat !== undefined && lon !== undefined) {
      const gps: GpsData = { lat, lon };
      if (info) {
        put(gps, "alt", num(info["alt_m"]));
        const fix = num(info["fix"]);
        if (fix !== undefined) gps.fix = fix > 0;
        put(gps, "satellites", num(info["sats"]));
        const hdop = num(info["hdop"]);
        // hdop is transmitted ×10 (integer); normalize back to a real value.
        if (hdop !== undefined) gps.hdop = hdop / 10;
        put(gps, "speed", num(info["speed_mps"]));
      }
      out.gps = gps;
    }

    // Representative timestamp from the IMU sample clock.
    const accelBlock = obj(fmc["imu_accel"]);
    if (accelBlock) put(out, "timestamp", num(accelBlock["t_ms"]));
  }

  // --- FAS fleet ------------------------------------------------------------
  put(out, "boards", parseBoards(raw["fas_boards"]));
  put(out, "actuators", parseActuators(raw["fas_actuators"]));
  put(out, "sensorMasks", parseSensorMasks(raw["fas_sensors"]));
  put(out, "boardPower", parseBoardPower(raw["fas_board_status"]));
  put(out, "pmb", parsePmb(raw["fas_pmb"]));
  put(out, "fmc", parseFmc(raw["fas_fmc"]));
  put(out, "imc", parseImc(raw["fas_imc"]));
  put(out, "rab", parseRab(raw["fas_rab"]));
  put(out, "aux", parseAux(raw["fas_aux"]));
  put(out, "rf", parseRf(raw["fas_rf"]));
  put(out, "sound", parseSound(raw["fas_sound"]));

  // --- Flight state machine -------------------------------------------------
  const fsm = obj(raw["fas_fsm"]);
  if (fsm) {
    const state = typeof fsm["fas_state"] === "string" ? fsm["fas_state"] : undefined;
    const phase = typeof fsm["flight_phase"] === "string" ? fsm["flight_phase"] : undefined;
    // The live FSM state is the most frequent signal — use it to clear the
    // latched milestones when the vehicle returns to standby.
    noteFlightState(state);
    if (state || phase) {
      out.fsm = { state, phase };
      out.state = state;
      out.phase = phase;
    }
  }

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

  // Milestones detected in THIS message only — latched into the module-level
  // state below so a flag never reverts once set (until a standby reset).
  const detected: FlightMilestones = {
    launchDetected: false,
    motorBurnout:    false,
    apogeeDetected:  false,
    drogueDeployed:  false,
    mainDeployed:    false,
    landingDetected: false,
  };

  let phase: string | undefined;
  let state: string | undefined;

  for (const e of events) {
    const lower = e.name.toLowerCase();

    if (MILESTONE_NAMES.launchDetected.includes(lower))   detected.launchDetected   = true;
    if (MILESTONE_NAMES.motorBurnout.includes(lower))     detected.motorBurnout     = true;
    if (MILESTONE_NAMES.apogeeDetected.includes(lower))   detected.apogeeDetected   = true;
    if (MILESTONE_NAMES.drogueDeployed.includes(lower))   detected.drogueDeployed   = true;
    if (MILESTONE_NAMES.mainDeployed.includes(lower))     detected.mainDeployed     = true;
    if (MILESTONE_NAMES.landingDetected.includes(lower))  detected.landingDetected  = true;

    if (typeof e["flight_phase"] === "string") phase = e["flight_phase"];
    if (typeof e["fas_state"] === "string") state = e["fas_state"];
  }

  // A return to standby clears the latch BEFORE this message's detections apply,
  // so a fresh flight cycle re-latches from scratch.
  noteFlightState(state);

  // Latch: OR each newly-detected milestone into the persistent flags.
  if (detected.launchDetected)   _latchedMilestones.launchDetected   = true;
  if (detected.motorBurnout)     _latchedMilestones.motorBurnout     = true;
  if (detected.apogeeDetected)   _latchedMilestones.apogeeDetected   = true;
  if (detected.drogueDeployed)   _latchedMilestones.drogueDeployed   = true;
  if (detected.mainDeployed)     _latchedMilestones.mainDeployed     = true;
  if (detected.landingDetected)  _latchedMilestones.landingDetected  = true;

  // T-0: stamp wall-clock time on first launch detection; never overwrite.
  if (_latchedMilestones.launchDetected && _launchEpochMs === null) {
    _launchEpochMs = Date.now();
  }

  // Return a snapshot copy so each ingest yields a fresh milestones object.
  return { events, milestones: { ..._latchedMilestones }, phase, state, launchEpochMs: _launchEpochMs };
}

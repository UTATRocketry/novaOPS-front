import { novaFetch } from "./novaFetch";
import type { SourceTarget } from "../types";

/**
 * Run a call against an endpoint that the backend may not have yet (the
 * STM32WL wave landed on the frontend first). A 404/405 becomes a clear
 * "not supported yet" message rather than a bare API error; everything else
 * propagates unchanged.
 */
export async function withBackendSupport<T>(label: string, call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (/\b(404|405)\b/.test(message) || /not found/i.test(message)) {
      throw new Error(`${label}: backend does not support this yet`);
    }
    throw e;
  }
}

export interface DirectRelayBody {
  target: SourceTarget;
  node?: string;
  channel: number;
  state: 0 | 1;
}

export interface DirectServoBody {
  target: SourceTarget;
  node?: string;
  channel: number;
  /** 0 = disable; validated 0–3000 by backend. */
  pulse_us: number;
}

export function sendDirectRelay(
  body: DirectRelayBody,
  clientId: string,
): Promise<{ ok: boolean }> {
  return novaFetch<{ ok: boolean }>(
    "/api/direct/relay",
    { method: "POST", body: JSON.stringify(body) },
    clientId,
  );
}

export function sendDirectServo(
  body: DirectServoBody,
  clientId: string,
): Promise<{ ok: boolean }> {
  return novaFetch<{ ok: boolean }>(
    "/api/direct/servo",
    { method: "POST", body: JSON.stringify(body) },
    clientId,
  );
}

export interface FasSdBody {
  node?: string | null;
  action: "set_rate" | "clear";
  divisor?: number;
}

export function sendFasSd(body: FasSdBody, clientId: string): Promise<{ published_commands: unknown[] }> {
  return novaFetch<{ published_commands: unknown[] }>(
    "/api/fas/sd",
    { method: "POST", body: JSON.stringify(body) },
    clientId,
  );
}

export interface FasBuzzerBody {
  node?: string | null;
  action: "play" | "stop";
  melody?: string | null;
  notes?: Array<[number, number] | [number, number, number]> | null;
}

/**
 * @deprecated The physical buzzer was removed from the board — `RT_MSG_FMC_BUZZER`
 * is reserved on the wire but drives nothing. Use {@link sendFasSound} with
 * `action: "tone"` (or a stored clip) instead. Kept only so existing callers do not
 * break; do not add new call sites.
 */
export function sendFasBuzzer(body: FasBuzzerBody, clientId: string): Promise<{ published_commands: unknown[] }> {
  return novaFetch<{ published_commands: unknown[] }>(
    "/api/fas/buzzer",
    { method: "POST", body: JSON.stringify(body) },
    clientId,
  );
}

/** POST /api/fas/rab — recovery arming board arm/disarm. rab_id 0 = A, 1 = B. */
export interface FasRabBody {
  action: "arm" | "disarm";
  rab_id: 0 | 1;
  pulse_ms?: number; // default 100
}

export function sendFasRab(body: FasRabBody, clientId: string): Promise<{ published_commands: unknown[] }> {
  return novaFetch<{ published_commands: unknown[] }>(
    "/api/fas/rab",
    { method: "POST", body: JSON.stringify(body) },
    clientId,
  );
}

/**
 * POST /api/fas/aux — load-switch power for the FMC's auxiliary rails.
 *
 * `radio` is the STM32WL vehicle modem's own rail and is not actuator-gated.
 * `runcam` and `rf_pa` are EPB load switches: the actuator lock applies.
 */
export interface FasAuxBody {
  node?: string | null;    // default FMC_0
  device: "radio" | "runcam" | "rf_pa";
  enable: boolean;
}

export function sendFasAux(body: FasAuxBody, clientId: string): Promise<{ published_commands: unknown[] }> {
  return novaFetch<{ published_commands: unknown[] }>(
    "/api/fas/aux",
    { method: "POST", body: JSON.stringify(body) },
    clientId,
  );
}

/**
 * POST /api/fas/runcam_record — start/stop a RunCam recording.
 *
 * Distinct from {@link sendFasAux} with `device: "runcam"`, which only powers the
 * camera rail. Note that with the config record's `recOnPower` set, powering the
 * rail starts a recording on its own.
 */
export interface FasRuncamRecordBody {
  node: string;
  enable: boolean;
  /** 0 = record until stopped. Max 43200. */
  autostop_s?: number;
}

export function sendFasRuncamRecord(
  body: FasRuncamRecordBody,
  clientId: string,
): Promise<{ published_commands: unknown[] }> {
  return novaFetch<{ published_commands: unknown[] }>(
    "/api/fas/runcam_record",
    { method: "POST", body: JSON.stringify(body) },
    clientId,
  );
}

/**
 * POST /api/fas/radio_config — patch the FMC-authoritative radio config record.
 *
 * `cfg` is a partial patch merged server-side against the stored record.
 */
export interface FasRadioConfigBody {
  node: string;
  cfg: Record<string, unknown>;
  target?: "vehicle" | "ground";
}

export function sendFasRadioConfig(
  body: FasRadioConfigBody,
  clientId: string,
): Promise<{ published_commands: unknown[] }> {
  return novaFetch<{ published_commands: unknown[] }>(
    "/api/fas/radio_config",
    { method: "POST", body: JSON.stringify(body) },
    clientId,
  );
}

/** POST /api/fas/sound — soundboard control (play/stop/volume/tone/list/clear). */
export interface FasSoundBody {
  node?: string | null;    // default FMC_0
  action: "play" | "stop" | "volume" | "tone" | "list" | "clear";
  idx?: number;            // play: clip index
  volume?: number;         // volume: 0..255
  freq_hz?: number;        // tone: frequency (0/omitted = default)
  ms?: number;             // tone: duration (0/omitted = default)
}

export function sendFasSound(body: FasSoundBody, clientId: string): Promise<{ published_commands: unknown[] }> {
  return novaFetch<{ published_commands: unknown[] }>(
    "/api/fas/sound",
    { method: "POST", body: JSON.stringify(body) },
    clientId,
  );
}

/**
 * POST /api/fas/charger — PMB battery charging. Charging is DEFAULT-OFF.
 * `i_setting`/`v_setting` are LTC4162 DAC codes 0..31; omit to leave the persisted
 * limit unchanged (a plain enable/suspend never clobbers the configured limit).
 */
export interface FasChargerBody {
  node?: string | null;    // default PMB_0
  enable: boolean;
  i_setting?: number;      // 0..31, omit = unchanged
  v_setting?: number;      // 0..31, omit = unchanged
}

export function sendFasCharger(body: FasChargerBody, clientId: string): Promise<{ published_commands: unknown[] }> {
  return novaFetch<{ published_commands: unknown[] }>(
    "/api/fas/charger",
    { method: "POST", body: JSON.stringify(body) },
    clientId,
  );
}

/** Result of {@link uploadFasSoundClip}. `format`: 1 = IMA-ADPCM, 2 = PCM_S16. */
export interface SoundUploadResult {
  uploaded: {
    name: string;
    format: number;
    bytes: number;
    crc32: number;
    sample_rate: number;
    seconds: number;
  };
}

/**
 * POST /api/fas/sound/upload — MULTIPART (not JSON). The backend transcodes the
 * file (ffmpeg) and the bridge streams it to the FMC; the new clip appears in
 * `fas_sound.clips` within ~1 s. `novaFetch` skips the JSON content-type for a
 * FormData body so the browser can set the multipart boundary.
 *
 * Throws with the FastAPI `detail` string on 503 (ffmpeg missing) / 413 (too
 * large) / 422 (transcode failed).
 */
export function uploadFasSoundClip(
  opts: {
    file: File;
    name: string;
    format?: "adpcm" | "pcm";      // default adpcm
    highpassHz?: number;           // default 700
    pitchSemitones?: number;       // default 0
    node?: string | null;          // default FMC_0
  },
  clientId: string,
): Promise<SoundUploadResult> {
  const fd = new FormData();
  fd.append("file", opts.file);
  fd.append("name", opts.name);
  fd.append("format", opts.format ?? "adpcm");
  if (opts.highpassHz !== undefined) fd.append("highpass_hz", String(opts.highpassHz));
  if (opts.pitchSemitones !== undefined) fd.append("pitch_semitones", String(opts.pitchSemitones));
  if (opts.node) fd.append("node", opts.node);
  return novaFetch<SoundUploadResult>(
    "/api/fas/sound/upload",
    { method: "POST", body: fd },
    clientId,
  );
}

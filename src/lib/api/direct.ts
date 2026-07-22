import { novaFetch } from "./novaFetch";
import type { SourceTarget } from "../types";

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

/** POST /api/fas/aux — RFD900 / RunCam load-switch power. */
export interface FasAuxBody {
  node?: string | null;    // default FMC_0
  device: "rfd" | "runcam";
  enable: boolean;
}

export function sendFasAux(body: FasAuxBody, clientId: string): Promise<{ published_commands: unknown[] }> {
  return novaFetch<{ published_commands: unknown[] }>(
    "/api/fas/aux",
    { method: "POST", body: JSON.stringify(body) },
    clientId,
  );
}

/** POST /api/fas/rf — set the FMC RF telemetry rate/power mode (persisted on the FMC). */
export interface FasRfBody {
  node?: string | null;    // default FMC_0
  mode: 0 | 1 | 2;         // 0 = low, 1 = normal, 2 = high
}

export function sendFasRf(body: FasRfBody, clientId: string): Promise<{ published_commands: unknown[] }> {
  return novaFetch<{ published_commands: unknown[] }>(
    "/api/fas/rf",
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

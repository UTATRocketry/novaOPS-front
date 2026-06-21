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

export function sendFasBuzzer(body: FasBuzzerBody, clientId: string): Promise<{ published_commands: unknown[] }> {
  return novaFetch<{ published_commands: unknown[] }>(
    "/api/fas/buzzer",
    { method: "POST", body: JSON.stringify(body) },
    clientId,
  );
}

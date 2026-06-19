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

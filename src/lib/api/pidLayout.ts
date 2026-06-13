/**
 * REST wrappers for the P&ID layout endpoint.
 *
 * GET /api/pid-layout  — seed the active layout on page load.
 * PUT /api/pid-layout  — save + broadcast to all clients (operator/admin gated).
 *
 * getPidLayout() never throws: 404 (no layout saved yet) and network errors
 * both return null quietly.  The WS "physical backend down" indicator handles
 * the connectivity story; a null layout simply falls back to DEFAULT_LAYOUT.
 *
 * putPidLayout() DOES throw on auth/network failure so the caller can surface
 * a "Save failed" message to the operator.
 */
import type { NovaPidLayout } from "../pid/serializer";
import { validateLayout } from "../pid/serializer";
import { novaFetch } from "./novaFetch";

interface PidLayoutResponse {
  layout: Record<string, unknown>;
}

export async function getPidLayout(): Promise<NovaPidLayout | null> {
  try {
    const res = await novaFetch<PidLayoutResponse>("/api/diagram");
    return validateLayout(res.layout);
  } catch {
    // 404 = no layout saved; TypeError = backend unreachable.
    // In both cases fall through to DEFAULT_LAYOUT at call site.
    return null;
  }
}

export async function putPidLayout(
  layout: NovaPidLayout,
  clientId: string,
): Promise<void> {
  await novaFetch<PidLayoutResponse>(
    "/api/diagram",
    { method: "PUT", body: JSON.stringify({ layout }) },
    clientId,
  );
}

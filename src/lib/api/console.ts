import { novaFetch } from "./novaFetch";

/** Body shape required by POST /api/console. */
export interface ConsolePayload {
  level: string;
  message: string;
}

/** Publish a structured log message to the console MQTT topic. */
export function sendConsole(payload: ConsolePayload): Promise<{ published: boolean }> {
  return novaFetch<{ published: boolean }>("/api/console", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ---------------------------------------------------------------------------
// FAS console (two-way) — POST /api/console/command
// ---------------------------------------------------------------------------

/** Lowercase action verbs accepted by the FAS console bridge. */
export type ConsoleAction = "start" | "stop" | "list_ports" | "configure" | "tx";

/**
 * A FAS console command. Always carries an `action`; remaining fields depend on
 * the action (see FRONTEND_API_GUIDE.md § FAS Console). Kept loose because the
 * `tx` action accepts three different packet shapes (op / fields / raw).
 */
export interface ConsoleCommand {
  action: ConsoleAction;
  [key: string]: unknown;
}

/**
 * Send a console control / TX command to the FAS bridge.
 * Requires operator or admin role (enforced backend-side via X-Client-Id).
 * All resulting output (echoes, port lists, decoded frames) arrives async over
 * the WebSocket console stream — not in this response.
 */
export function sendConsoleCommand(
  command: ConsoleCommand,
  clientId: string,
): Promise<{ published: boolean; action: ConsoleAction }> {
  return novaFetch<{ published: boolean; action: ConsoleAction }>(
    "/api/console/command",
    { method: "POST", body: JSON.stringify(command) },
    clientId,
  );
}

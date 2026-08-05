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
export type ConsoleAction =
  | "start"
  | "stop"
  | "list_ports"
  | "configure"
  | "disconnect"
  | "status"
  | "tx";

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

// ---------------------------------------------------------------------------
// Serial link helpers
//
// The bridge runs with NO serial port until one is configured, so these are the
// commands that actually bring the FAS link up. Every one of them is fire-and-
// -acknowledge: the resolved promise only means the command was published — the
// real result arrives asynchronously as a `console_serial` / `console_ports` /
// `console_config` WebSocket message.
// ---------------------------------------------------------------------------

/** Ask the bridge to enumerate serial ports. Result: a `console_ports` message. */
export function fasListPorts(clientId: string) {
  return sendConsoleCommand({ action: "list_ports" }, clientId);
}

/** Ask the bridge to republish its link state. Result: a `console_serial` message. */
export function fasLinkStatus(clientId: string) {
  return sendConsoleCommand({ action: "status" }, clientId);
}

/** Point the bridge at a serial port and reconnect. Result: `console_config`. */
export function fasConfigurePort(port: string, baud: number, clientId: string) {
  return sendConsoleCommand({ action: "configure", port, baud }, clientId);
}

/** Close the bridge's serial port. The bridge keeps running with no port. */
export function fasDisconnectPort(clientId: string) {
  return sendConsoleCommand({ action: "disconnect" }, clientId);
}

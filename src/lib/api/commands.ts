import type { CommandPayload, SystemCommandPayload } from "../types";
import { novaFetch } from "./novaFetch";

export interface CommandResult {
  published_commands: unknown[];
}

/**
 * Response varies by command name:
 * - FAS / system commands → { published_commands }
 * - START/STOP_DATA_SAVING  → { data_saving_enabled }
 * - GET_DATA_FILES           → { data_files }
 */
export type SystemCommandResult =
  | { published_commands: unknown[] }
  | { data_saving_enabled: boolean }
  | { data_files: string[] };

/** Send an actuator command. Requires operator or pad role. */
export function sendCommand(
  payload: CommandPayload,
  clientId: string,
): Promise<CommandResult> {
  return novaFetch<CommandResult>(
    "/api/commands",
    { method: "POST", body: JSON.stringify(payload) },
    clientId,
  );
}

/** Send a system command from the config Commands section. Requires operator or pad role. */
export function sendSystemCommand(
  payload: SystemCommandPayload,
  clientId: string,
): Promise<SystemCommandResult> {
  return novaFetch<SystemCommandResult>(
    "/api/system-commands",
    { method: "POST", body: JSON.stringify(payload) },
    clientId,
  );
}

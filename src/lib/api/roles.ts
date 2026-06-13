import type { ClientInfo, RoleAssignPayload } from "../types";
import { novaFetch } from "./novaFetch";

/** List all currently connected WebSocket clients and their roles. */
export function getRoles(): Promise<ClientInfo[]> {
  return novaFetch<ClientInfo[]>("/api/roles");
}

/**
 * Assign a role to a connected client.
 * Omit target_client_id (or set null) to change your own role.
 * Changing another client's role requires admin.
 * Requesting admin requires the correct password.
 */
export function assignRole(
  payload: RoleAssignPayload,
  clientId: string,
): Promise<ClientInfo> {
  return novaFetch<ClientInfo>(
    "/api/roles",
    { method: "POST", body: JSON.stringify(payload) },
    clientId,
  );
}

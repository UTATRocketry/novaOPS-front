import type { ActuatorEntry, SensorEntry, SystemConfig } from "../types";
import { novaFetch } from "./novaFetch";

const baseRoute = "/api/config";
export function getConfig(): Promise<SystemConfig> {
  return novaFetch<SystemConfig>(`${baseRoute}`);
}

export function getSensors(): Promise<SensorEntry[]> {
  return novaFetch<SensorEntry[]>(`${baseRoute}/sensors`);
}

export function getActuators(): Promise<ActuatorEntry[]> {
  return novaFetch<ActuatorEntry[]>(`${baseRoute}/actuators`);
}

/** Upload a YAML config file. Replaces and activates the running config. */
export function uploadConfig(file: File): Promise<SystemConfig> {
  const body = new FormData();
  body.append("file", file);
  return novaFetch<SystemConfig>(`${baseRoute}/upload`, { method: "POST", body });
}

/** Replace the entire active config with a JSON object. */
export function putConfig(config: SystemConfig): Promise<SystemConfig> {
  return novaFetch<SystemConfig>(`${baseRoute}/update`, {
    method: "PUT",
    body: JSON.stringify(config),
  });
}

/**
 * Shallow-merge top-level keys into the active config.
 * Sending { Actuators: [...] } replaces the entire actuator list — not a deep merge.
 */
export function patchConfig(partial: Partial<SystemConfig>): Promise<SystemConfig> {
  return novaFetch<SystemConfig>(`${baseRoute}/update`, {
    method: "PATCH",
    body: JSON.stringify(partial),
  });
}

/** Reload the YAML config from disk and return the resulting SystemConfig. */
export function reloadConfig(): Promise<SystemConfig> {
  return novaFetch<SystemConfig>(`${baseRoute}/reload`, { method: "POST" });
}

/** List YAML config files available in the backend config directory. */
export function listConfigFiles(): Promise<string[]> {
  return novaFetch<string[]>(`${baseRoute}/list`);
}

/**
 * Load + activate a named YAML config file from the config directory.
 * Per the guide the name is a `path` QUERY param — there is no request body.
 * Also broadcasts a `config_update` WS message with the activated config.
 */
export function loadConfigFile(filename: string): Promise<SystemConfig> {
  return novaFetch<SystemConfig>(
    `${baseRoute}/load?path=${encodeURIComponent(filename)}`,
    { method: "POST" },
  );
}

/**
 * Download a named YAML config file as a Blob.
 * Direct fetch (not novaFetch) because the response is YAML text, not JSON.
 */
export async function downloadConfigFile(filename: string): Promise<Blob> {
  const baseUrl = process.env.NEXT_PUBLIC_NOVA_API_BASE_URL ?? "";
  const res = await fetch(
    `${baseUrl}${baseRoute}/download/${encodeURIComponent(filename)}`,
  );
  if (!res.ok) throw new Error(`NovaOps API error ${res.status}`);
  return res.blob();
}

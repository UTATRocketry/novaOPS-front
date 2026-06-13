import type { ActuatorEntry, SensorEntry, SystemConfig } from "../types";
import { novaFetch } from "./novaFetch";

export function getConfig(): Promise<SystemConfig> {
  return novaFetch<SystemConfig>("/api/config");
}

export function getSensors(): Promise<SensorEntry[]> {
  return novaFetch<SensorEntry[]>("/api/sensors");
}

export function getActuators(): Promise<ActuatorEntry[]> {
  return novaFetch<ActuatorEntry[]>("/api/actuators");
}

/** Upload a YAML config file. Replaces and activates the running config. */
export function uploadConfig(file: File): Promise<SystemConfig> {
  const body = new FormData();
  body.append("file", file);
  return novaFetch<SystemConfig>("/api/config/upload", { method: "POST", body });
}

/** Replace the entire active config with a JSON object. */
export function putConfig(config: SystemConfig): Promise<SystemConfig> {
  return novaFetch<SystemConfig>("/api/config", {
    method: "PUT",
    body: JSON.stringify(config),
  });
}

/**
 * Shallow-merge top-level keys into the active config.
 * Sending { Actuators: [...] } replaces the entire actuator list — not a deep merge.
 */
export function patchConfig(partial: Partial<SystemConfig>): Promise<SystemConfig> {
  return novaFetch<SystemConfig>("/api/config", {
    method: "PATCH",
    body: JSON.stringify(partial),
  });
}

/** Reload the YAML config from disk and return the resulting SystemConfig. */
export function reloadConfig(): Promise<SystemConfig> {
  return novaFetch<SystemConfig>("/api/config/reload", { method: "POST" });
}

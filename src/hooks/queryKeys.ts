/** Centralized TanStack Query key definitions. Import from here — never inline strings. */
export const queryKeys = {
  config: ["config"] as const,
  configList: ["config-list"] as const,
  sensors: ["sensors"] as const,
  actuators: ["actuators"] as const,
  dataFiles: ["data-files"] as const,
  roles: ["roles"] as const,
  health: ["health"] as const,
} as const;

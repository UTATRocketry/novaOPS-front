"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getActuators,
  getConfig,
  getSensors,
  listConfigFiles,
  loadConfigFile,
  patchConfig,
  putConfig,
  reloadConfig,
  uploadConfig,
} from "@/lib/api";
import type { SystemConfig } from "@/lib/types";
import { queryKeys } from "./queryKeys";

export function useConfig() {
  return useQuery({ queryKey: queryKeys.config, queryFn: getConfig });
}

/** Lists YAML config files available in the backend config directory. */
export function useConfigList() {
  return useQuery({ queryKey: queryKeys.configList, queryFn: listConfigFiles });
}

export function useSensors() {
  return useQuery({ queryKey: queryKeys.sensors, queryFn: getSensors });
}

export function useActuators() {
  return useQuery({ queryKey: queryKeys.actuators, queryFn: getActuators });
}

/** Invalidates config, sensors, and actuators — call after any config write. */
function useInvalidateConfig() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.config }),
      qc.invalidateQueries({ queryKey: queryKeys.sensors }),
      qc.invalidateQueries({ queryKey: queryKeys.actuators }),
    ]);
}

/**
 * Applies a returned SystemConfig directly into the cache (no re-fetch).
 * Used where the backend hands back the activated config — and mirrors what the
 * `config_update` WS broadcast does (see AppShell).
 */
function useApplyConfig() {
  const qc = useQueryClient();
  return (config: SystemConfig) => {
    qc.setQueryData(queryKeys.config, config);
    qc.setQueryData(queryKeys.sensors, config.Sensors ?? []);
    qc.setQueryData(queryKeys.actuators, config.Actuators ?? []);
  };
}

export function useUploadConfig() {
  const invalidate = useInvalidateConfig();
  return useMutation({
    mutationFn: (file: File) => uploadConfig(file),
    onSuccess: invalidate,
  });
}

export function usePutConfig() {
  const invalidate = useInvalidateConfig();
  return useMutation({
    mutationFn: (config: SystemConfig) => putConfig(config),
    onSuccess: invalidate,
  });
}

export function usePatchConfig() {
  const invalidate = useInvalidateConfig();
  return useMutation({
    mutationFn: (partial: Partial<SystemConfig>) => patchConfig(partial),
    onSuccess: invalidate,
  });
}

export function useReloadConfig() {
  const invalidate = useInvalidateConfig();
  return useMutation({
    mutationFn: () => reloadConfig(),
    onSuccess: invalidate,
  });
}

/**
 * Load + activate a named YAML config file. The backend returns the activated
 * config and also broadcasts `config_update`; we apply the response directly to
 * the cache instead of re-fetching (per FRONTEND_API_GUIDE.md).
 */
export function useLoadConfig() {
  const apply = useApplyConfig();
  return useMutation({
    mutationFn: (filename: string) => loadConfigFile(filename),
    onSuccess: (config: SystemConfig) => apply(config),
  });
}

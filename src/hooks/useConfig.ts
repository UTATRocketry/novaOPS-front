"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getActuators,
  getConfig,
  getSensors,
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

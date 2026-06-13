"use client";

import { useMutation } from "@tanstack/react-query";
import { setCalibration, setDataSaving } from "@/lib/api";

export function useSetCalibration() {
  return useMutation({
    mutationFn: (enabled: boolean) => setCalibration(enabled),
  });
}

export function useSetDataSaving() {
  return useMutation({
    mutationFn: (enabled: boolean) => setDataSaving(enabled),
  });
}

/**
 * Engine action API wrappers — aligned with the OpenAPI spec.
 *
 *   GET  /api/flags/data-saving             → { enabled: boolean }
 *   POST /api/flags/data-saving  { enabled } → { enabled: boolean }
 *
 *   GET  /api/flags/calibration             → { enabled: boolean }
 *   POST /api/flags/calibration  { enabled } → { enabled: boolean }
 *
 *   GET  /api/data-files                    → string[]
 *   GET  /api/data-files/{file_name}        → CSV blob
 */

import { novaFetch } from "./novaFetch";
import { getDataFiles, downloadDataFile } from "./dataFiles";

export interface FlagStatus {
  enabled: boolean;
}

/** Current data-saving (recording) state. */
export function getRecordingStatus(): Promise<FlagStatus> {
  return novaFetch<FlagStatus>("/api/flags/data-saving");
}

/** Start data saving. Requires operator role via X-Client-Id. */
export function startRecording(clientId: string): Promise<FlagStatus> {
  return novaFetch<FlagStatus>(
    "/api/flags/data-saving",
    { method: "POST", body: JSON.stringify({ enabled: true }) },
    clientId,
  );
}

/** Stop data saving. Requires operator role via X-Client-Id. */
export function stopRecording(clientId: string): Promise<FlagStatus> {
  return novaFetch<FlagStatus>(
    "/api/flags/data-saving",
    { method: "POST", body: JSON.stringify({ enabled: false }) },
    clientId,
  );
}

/** Current calibration state. */
export function getCalibrationStatus(): Promise<FlagStatus> {
  return novaFetch<FlagStatus>("/api/flags/calibration");
}

/**
 * Set calibration enabled/disabled.
 * Requires operator role via X-Client-Id.
 */
export function toggleCalibration(
  clientId: string,
  calibrationEnabled: boolean,
): Promise<FlagStatus> {
  return novaFetch<FlagStatus>(
    "/api/flags/calibration",
    { method: "POST", body: JSON.stringify({ enabled: calibrationEnabled }) },
    clientId,
  );
}

/**
 * Download the most recent data file from the backend.
 * Lists available files via /api/data-files, then downloads the last entry.
 */
export async function downloadData(): Promise<void> {
  const files = await getDataFiles();
  if (!files.length) throw new Error("No data files available");
  const fileName = files[files.length - 1];
  const blob = await downloadDataFile(fileName);
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

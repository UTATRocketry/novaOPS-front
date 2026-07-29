/**
 * Calibrated-CSV export, matching the offline script's `--export` output.
 *
 * Columns: `timestamp`, ISO `time` (when the source had wall-clock stamps),
 * then one `cal_<name>[<unit>]` column per selected channel. With `keepRaw` the
 * original raw columns are carried through too, as `--keep-raw` does.
 */

import type { Channel, Dataset, TimeWindow } from "./types";
import { windowIndices } from "./pipeline";

/** `cal_MFT[kg]`, as the offline script names its calibrated columns. */
export function exportColumnName(channel: Channel): string {
  const unit = channel.unit ? `[${channel.unit}]` : "";
  return `cal_${channel.name}${unit}`;
}

function isoFromEpochMs(ms: number): string {
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toISOString().replace("Z", "");
}

function cell(v: number): string {
  return Number.isFinite(v) ? String(v) : "";
}

function escapeHeader(h: string): string {
  return /[",\n]/.test(h) ? `"${h.replace(/"/g, '""')}"` : h;
}

export interface ExportOptions {
  /** Include the un-calibrated source columns alongside the calibrated ones. */
  keepRaw?: boolean;
  /** Restrict the export to an elapsed-second window. */
  window?: TimeWindow | null;
  /** Raw columns to carry through when `keepRaw` is set. */
  rawColumns?: Array<{ key: string; values: Float64Array }>;
}

/** Build the CSV text for the given channels. */
export function buildCalibratedCsv(
  dataset: Dataset,
  channels: Channel[],
  { keepRaw = false, window = null, rawColumns = [] }: ExportOptions = {},
): string {
  const [lo, hi] = windowIndices(dataset.elapsed, window);

  const headers: string[] = [];
  const getters: Array<(i: number) => string> = [];

  if (dataset.epochMs) {
    headers.push("timestamp", "time");
    getters.push((i) => cell(dataset.epochMs![i]));
    getters.push((i) => isoFromEpochMs(dataset.epochMs![i]));
  } else {
    headers.push("sample");
    getters.push((i) => String(i));
  }

  headers.push("elapsed_s");
  getters.push((i) => cell(dataset.elapsed[i]));

  if (keepRaw) {
    for (const col of rawColumns) {
      headers.push(col.key);
      getters.push((i) => cell(col.values[i]));
    }
  }

  for (const ch of channels) {
    headers.push(exportColumnName(ch));
    getters.push((i) => cell(ch.values[i]));
  }

  const lines: string[] = [headers.map(escapeHeader).join(",")];
  for (let i = lo; i < hi; i++) {
    lines.push(getters.map((g) => g(i)).join(","));
  }
  return lines.join("\n");
}

/** Trigger a browser download of `text` as `fileName`. */
export function downloadCsv(text: string, fileName: string): void {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
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

/**
 * CSV readers for the analysis page.
 *
 * Two shapes are supported, matching the offline script:
 *   - **Wide** (GCS sensor log): one row per sample, one column per channel,
 *     plus a `timestamp` column in epoch units.
 *   - **Long** (FAS / main log): `timestamp_ms, node, channel, value`, pivoted
 *     into wide columns named `{node}_ch{channel}`.
 *
 * Parsing is deliberately tolerant: non-numeric columns are dropped and
 * reported rather than throwing, because operators paste in files from several
 * generations of firmware.
 */

import type {
  AlignmentMode,
  AssembledTable,
  DataSource,
  RawColumn,
  RawTable,
  SourceAlignment,
  SourceTable,
  TimestampUnit,
} from "./types";

/** Split a CSV line, honouring double-quoted fields. */
function splitLine(line: string): string[] {
  if (!line.includes('"')) return line.split(",");
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Non-empty, non-comment lines. */
function contentLines(text: string): string[] {
  return stripBom(text)
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "");
}

function toNumber(raw: string): number {
  const t = raw.trim();
  if (t === "") return NaN;
  const n = Number(t);
  return Number.isNaN(n) ? NaN : n;
}

export class CsvFormatError extends Error {}

/**
 * Guess the epoch unit of a timestamp column from its magnitude. Unix epoch is
 * ~1.7e9 s / ~1.7e12 ms, so the exponent separates the cases cleanly. Columns
 * that look like a device uptime counter (small values) are reported as "ms",
 * matching the FAS log convention.
 */
export function inferTimestampUnit(first: number): TimestampUnit {
  const v = Math.abs(first);
  if (!Number.isFinite(v) || v === 0) return "none";
  if (v > 1e17) return "ns";
  if (v > 1e14) return "us";
  if (v > 1e11) return "ms";
  if (v > 1e8) return "s";
  return "ms"; // uptime counters (FAS) are milliseconds
}

const TS_DIVISOR: Record<TimestampUnit, number> = {
  s: 1,
  ms: 1e3,
  us: 1e6,
  ns: 1e9,
  none: 1,
};

/** Convert a timestamp in `unit` to seconds. */
export function timestampToSeconds(value: number, unit: TimestampUnit): number {
  return value / TS_DIVISOR[unit];
}

/**
 * Parse a wide-format sensor CSV. Any column that parses as numeric becomes a
 * channel candidate; the `timestamp` column (if present) is split out as the
 * time base.
 */
export function parseWideCsv(text: string): RawTable {
  const lines = contentLines(text);
  if (lines.length < 2) {
    throw new CsvFormatError("CSV has no data rows.");
  }

  const headers = splitLine(lines[0]).map((h) => h.trim());
  const rowCount = lines.length - 1;

  const cols = headers.map(() => new Float64Array(rowCount));
  for (let r = 0; r < rowCount; r++) {
    const cells = splitLine(lines[r + 1]);
    for (let c = 0; c < headers.length; c++) {
      cols[c][r] = c < cells.length ? toNumber(cells[c]) : NaN;
    }
  }

  const tsIndex = headers.findIndex(
    (h) => h.toLowerCase() === "timestamp" || h.toLowerCase() === "timestamp_ms",
  );

  let timestamp: Float64Array | null = null;
  let unit: TimestampUnit = "none";
  if (tsIndex >= 0) {
    timestamp = cols[tsIndex];
    const firstFinite = timestamp.find((v) => Number.isFinite(v));
    unit =
      headers[tsIndex].toLowerCase() === "timestamp_ms"
        ? "ms"
        : inferTimestampUnit(firstFinite ?? NaN);
    if (firstFinite === undefined) timestamp = null;
  }

  const columns: RawTable["columns"] = [];
  const ignoredColumns: string[] = [];
  headers.forEach((key, c) => {
    if (c === tsIndex) return;
    // A column with no finite sample carries no information — report it rather
    // than letting it show up as an all-gap channel.
    const hasNumeric = cols[c].some((v) => Number.isFinite(v));
    if (hasNumeric) columns.push({ key, values: cols[c] });
    else ignoredColumns.push(key);
  });

  return { timestamp, unit, columns, rowCount, ignoredColumns };
}

/**
 * Parse the long-format FAS log and pivot it to wide columns keyed
 * `{node}_ch{channel}`. Duplicate (timestamp, column) pairs are averaged, which
 * is what the firmware's burst logging produces.
 */
export function parseFasCsv(text: string): RawTable {
  const lines = contentLines(text);
  if (lines.length < 2) throw new CsvFormatError("FAS CSV has no data rows.");

  const headers = splitLine(lines[0]).map((h) => h.trim().toLowerCase());
  const iTs = headers.indexOf("timestamp_ms");
  const iNode = headers.indexOf("node");
  const iChannel = headers.indexOf("channel");
  const iValue = headers.indexOf("value");

  const missing = [
    iTs < 0 && "timestamp_ms",
    iNode < 0 && "node",
    iChannel < 0 && "channel",
    iValue < 0 && "value",
  ].filter(Boolean);
  if (missing.length) {
    throw new CsvFormatError(
      `FAS CSV missing expected column(s): ${missing.join(", ")}. Found: ${headers.join(", ")}`,
    );
  }

  // Accumulate sum/count per (timestamp, column) so duplicates average out.
  const tsOrder: number[] = [];
  const byTs = new Map<number, Map<string, { sum: number; n: number }>>();
  const colKeys = new Set<string>();

  for (let r = 1; r < lines.length; r++) {
    const cells = splitLine(lines[r]);
    const ts = toNumber(cells[iTs] ?? "");
    const value = toNumber(cells[iValue] ?? "");
    if (!Number.isFinite(ts)) continue;
    const key = `${(cells[iNode] ?? "").trim()}_ch${(cells[iChannel] ?? "").trim()}`;
    colKeys.add(key);

    let row = byTs.get(ts);
    if (!row) {
      row = new Map();
      byTs.set(ts, row);
      tsOrder.push(ts);
    }
    const acc = row.get(key);
    if (!Number.isFinite(value)) continue;
    if (acc) {
      acc.sum += value;
      acc.n += 1;
    } else row.set(key, { sum: value, n: 1 });
  }

  tsOrder.sort((a, b) => a - b);
  const rowCount = tsOrder.length;
  if (rowCount === 0) throw new CsvFormatError("FAS CSV had no usable rows.");

  const keys = [...colKeys].sort();
  const timestamp = new Float64Array(rowCount);
  const data = keys.map(() => new Float64Array(rowCount).fill(NaN));

  tsOrder.forEach((ts, r) => {
    timestamp[r] = ts;
    const row = byTs.get(ts);
    if (!row) return;
    keys.forEach((k, c) => {
      const acc = row.get(k);
      if (acc && acc.n > 0) data[c][r] = acc.sum / acc.n;
    });
  });

  return {
    timestamp,
    unit: "ms",
    columns: keys.map((key, c) => ({ key, values: data[c] })),
    rowCount,
    ignoredColumns: [],
  };
}

/** Heuristic: does this text look like the long-format FAS log? */
export function looksLikeFasCsv(text: string): boolean {
  const first = contentLines(text)[0];
  if (!first) return false;
  const headers = splitLine(first).map((h) => h.trim().toLowerCase());
  return (
    headers.includes("node") && headers.includes("channel") && headers.includes("value")
  );
}

/** Heuristic: does this text look like a `*_actuators.csv` state log? */
export function looksLikeActuatorCsv(text: string): boolean {
  const first = contentLines(text)[0];
  if (!first) return false;
  const headers = splitLine(first).map((h) => h.trim().toLowerCase());
  if (headers.includes("type_id")) return true;
  return headers.some((h) => /^(relay|servo|gpio)_\d+$/.test(h));
}

// ---------------------------------------------------------------------------
// Source identification
// ---------------------------------------------------------------------------

/**
 * Guess which subsystem produced a file, from its name.
 *
 * The team's logs are written as `novaGround_<run>_sensors.csv` /
 * `novaThermo_<run>_sensors.csv`, so the prefix is the only thing that
 * distinguishes them — the CSV *contents* are indistinguishable, since both use
 * `hat{H}_ch{C}` headers for entirely different physical channels. Returns null
 * when the name says nothing, in which case the operator must choose.
 */
export function detectSourceFromName(fileName: string): DataSource | null {
  const n = fileName.toLowerCase();
  if (/novathermo|thermo|(^|[^a-z])tcs([^a-z]|$)/.test(n)) return "TCS";
  if (/novaground|novaops|(^|[^a-z])gcs([^a-z]|$)/.test(n)) return "GCS";
  if (/novafas|(^|[^a-z])fas([^a-z]|$)/.test(n)) return "FAS";
  return null;
}

/** Column keys are namespaced by source so identical headers stay distinct. */
export function qualify(source: DataSource, colKey: string): string {
  return `${source}:${colKey}`;
}

/** Split a qualified key back into its parts. */
export function unqualify(key: string): { source: DataSource | null; colKey: string } {
  const i = key.indexOf(":");
  if (i < 0) return { source: null, colKey: key };
  const head = key.slice(0, i);
  const source = head === "GCS" || head === "TCS" || head === "FAS" ? head : null;
  return source ? { source, colKey: key.slice(i + 1) } : { source: null, colKey: key };
}

// ---------------------------------------------------------------------------
// Multi-source assembly
// ---------------------------------------------------------------------------

/** Mean sample rate of a table in Hz, or null when it has no usable clock. */
export function tableSampleRate(table: RawTable): number | null {
  const ts = table.timestamp;
  if (!ts || ts.length < 2 || table.unit === "none") return null;
  const span = timestampToSeconds(ts[ts.length - 1] - ts[0], table.unit);
  return span > 0 ? (ts.length - 1) / span : null;
}

/** True when a timestamp series looks like real Unix wall-clock time. */
function isWallClock(table: RawTable): boolean {
  if (!table.timestamp || table.timestamp.length === 0 || table.unit === "none") {
    return false;
  }
  const seconds = timestampToSeconds(table.timestamp[0], table.unit);
  // Anything after ~2001 and before ~2100 is a plausible capture date; a device
  // uptime counter lands far below this.
  return seconds > 1e9 && seconds < 4e9;
}

/**
 * Decide how a secondary log lines up with the primary one.
 *
 * When both carry real wall-clock stamps *and* their spans actually overlap,
 * absolute time is correct and far more accurate. Otherwise — a device uptime
 * counter, or two clocks that plainly disagree — each log is zeroed at its own
 * start, which is the offline script's behaviour.
 */
export function chooseAlignment(primary: RawTable, other: RawTable): AlignmentMode {
  if (!isWallClock(primary) || !isWallClock(other)) return "elapsed";
  const pTs = primary.timestamp!;
  const oTs = other.timestamp!;
  const pStart = timestampToSeconds(pTs[0], primary.unit);
  const pEnd = timestampToSeconds(pTs[pTs.length - 1], primary.unit);
  const oStart = timestampToSeconds(oTs[0], other.unit);
  const oEnd = timestampToSeconds(oTs[oTs.length - 1], other.unit);
  const overlap = Math.min(pEnd, oEnd) - Math.max(pStart, oStart);
  return overlap > 0 ? "epoch" : "elapsed";
}

/** Seconds-valued accessor for a table's timestamps under a given alignment. */
function timeAccessor(table: RawTable, mode: AlignmentMode): (i: number) => number {
  const ts = table.timestamp!;
  const origin = mode === "epoch" ? 0 : ts[0];
  return (i) => timestampToSeconds(ts[i] - origin, table.unit);
}

/**
 * Resample one source's columns onto the primary row timeline by nearest
 * sample, and report the worst matching skew so a bad alignment is visible
 * rather than silently smeared.
 *
 * Matching is done **per column**, against only the rows where that column
 * actually holds a reading. A long-format log bursts each channel on its own
 * timestamps, so pivoting it leaves most cells of any given row blank; picking
 * the nearest row wholesale would then hand back a blank for ~1 sample in 8 and
 * shred the trace into dashes. The nearest row *with a value for this channel*
 * is what "align by nearest sample" actually means.
 */
function resampleOnto(
  primary: RawTable,
  other: RawTable,
  mode: AlignmentMode,
): { columns: RawColumn[]; worstSkewS: number | null } {
  const pAt = timeAccessor(primary, mode);
  const oAt = timeAccessor(other, mode);

  const columns: RawColumn[] = [];
  let worstSkewS = 0;

  for (const src of other.columns) {
    const values = new Float64Array(primary.rowCount).fill(NaN);

    // Rows where this specific channel was logged.
    const present: number[] = [];
    for (let i = 0; i < other.rowCount; i++) {
      if (Number.isFinite(src.values[i])) present.push(i);
    }
    // A channel with no readings at all stays entirely absent — never filled.
    if (present.length === 0) {
      columns.push({ key: src.key, values });
      continue;
    }

    // Both series are sorted, so one forward scan finds every nearest match.
    let j = 0;
    for (let i = 0; i < primary.rowCount; i++) {
      const target = pAt(i);
      while (j + 1 < present.length && oAt(present[j + 1]) <= target) j++;
      let best = present[j];
      if (j + 1 < present.length) {
        const next = present[j + 1];
        if (Math.abs(oAt(next) - target) < Math.abs(target - oAt(best))) best = next;
      }
      worstSkewS = Math.max(worstSkewS, Math.abs(oAt(best) - target));
      values[i] = src.values[best];
    }

    columns.push({ key: src.key, values });
  }

  return { columns, worstSkewS };
}

/**
 * Fold every loaded log into one table on a single timeline.
 *
 * The primary timeline is chosen by preference GCS > TCS > FAS — the ground
 * station samples fastest and is the authoritative clock — falling back to
 * whatever is actually loaded. Every column key is qualified with its source,
 * so `GCS:hat0_ch0` and `TCS:hat0_ch0` remain separate channels.
 */
export function assembleTables(tables: SourceTable[]): AssembledTable | null {
  // A log with no timestamp column is still analysable on a sample-index axis,
  // so it is not rejected here — only *merging* needs a clock, and that is
  // checked per secondary below.
  const usable = tables.filter((t) => t.rowCount > 0);
  if (usable.length === 0) return null;

  // Prefer a source that actually has a clock for the timeline — everything
  // else has to be resampled onto it, which is impossible without one.
  const preference: DataSource[] = ["GCS", "TCS", "FAS"];
  const byPreference = preference
    .map((s) => usable.filter((t) => t.source === s))
    .flat();
  const ordered = [...byPreference, ...usable.filter((t) => !byPreference.includes(t))];
  const primary = ordered.find((t) => t.timestamp) ?? ordered[0];

  const columns: RawColumn[] = primary.columns.map((c) => ({
    key: qualify(primary.source, c.key),
    values: c.values,
  }));
  const alignments: SourceAlignment[] = [];
  const ignoredColumns = primary.ignoredColumns.map((c) => qualify(primary.source, c));
  const unalignedSources: DataSource[] = [];
  const sourceRates: Partial<Record<DataSource, number | null>> = {
    [primary.source]: tableSampleRate(primary),
  };

  for (const table of usable) {
    if (table === primary) continue;
    // Merging is a resample onto the primary's time axis, so both logs need a
    // clock. Without one the secondary is reported as unmerged rather than
    // being stitched on by row index, which would silently invent alignment.
    if (!primary.timestamp || !table.timestamp) {
      unalignedSources.push(table.source);
      continue;
    }
    const mode = chooseAlignment(primary, table);
    const { columns: resampled, worstSkewS } = resampleOnto(primary, table, mode);
    const qualified = resampled.map((c) => ({
      key: qualify(table.source, c.key),
      values: c.values,
    }));
    columns.push(...qualified);
    ignoredColumns.push(...table.ignoredColumns.map((c) => qualify(table.source, c)));
    sourceRates[table.source] = tableSampleRate(table);
    alignments.push({
      source: table.source,
      mode,
      columns: qualified.map((c) => c.key),
      worstSkewS,
    });
  }

  return {
    timestamp: primary.timestamp,
    unit: primary.unit,
    columns,
    rowCount: primary.rowCount,
    ignoredColumns,
    primarySource: primary.source,
    alignments,
    unalignedSources,
    sourceRates,
  };
}

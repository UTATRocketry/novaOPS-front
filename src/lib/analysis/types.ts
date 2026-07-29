/**
 * Post-test data analysis types.
 *
 * Follows the offline `plot_calibrate_data5.py` pipeline: a wide sensor CSV
 * (optionally merged with logs from the other subsystems) is bound to the
 * `Sensors:` block of the system config, calibrated with the per-sensor
 * piecewise-linear table, and optionally smoothed.
 *
 * Everything here is plain data — no React, no backend calls — so the pipeline
 * can be unit-reasoned about independently of the UI.
 */

/**
 * Which subsystem a log file came from.
 *
 * This matters because it is *not* recoverable from the file's contents: a
 * novaGround sensor log and a novaThermo sensor log both use `hat{H}_ch{C}`
 * headers, and the same key means different physical channels in each
 * (`hat0_ch0` is a pressure transducer in one and a thermocouple in the other).
 * Every table therefore carries its source explicitly, and column keys are
 * qualified with it before any sensor binding is resolved.
 */
export type DataSource = "GCS" | "TCS" | "FAS";

export const DATA_SOURCES: readonly DataSource[] = ["GCS", "TCS", "FAS"];

/** Human labels for the subsystem that produced a log. */
export const SOURCE_LABEL: Record<DataSource, string> = {
  GCS: "novaGround (GCS)",
  TCS: "novaThermo (TCS)",
  FAS: "novaFAS (FAS)",
};

/** A raw column parsed out of a CSV: a name plus its numeric samples. */
export interface RawColumn {
  key: string;
  values: Float64Array;
}

/** A parsed wide-format table. `timestamp` is separated out when present. */
export interface RawTable {
  /** Epoch timestamps in the file's native unit (see `RawTable.unit`). */
  timestamp: Float64Array | null;
  /** Unit the timestamp column is expressed in. */
  unit: TimestampUnit;
  columns: RawColumn[];
  rowCount: number;
  /** Column headers that were dropped because they held no numeric data. */
  ignoredColumns: string[];
}

/** A parsed table tagged with the subsystem that produced it. */
export interface SourceTable extends RawTable {
  source: DataSource;
}

/**
 * How a secondary log was lined up with the primary timeline.
 *  - `epoch`   both logs carry real wall-clock stamps that overlap, so samples
 *              are matched on absolute time (the accurate case).
 *  - `elapsed` the clocks are unrelated (e.g. a device uptime counter), so each
 *              log is zeroed at its own first sample and matched on elapsed
 *              time — the offline script's `merge_asof` behaviour.
 */
export type AlignmentMode = "epoch" | "elapsed";

/** Record of how one secondary source was folded into the primary timeline. */
export interface SourceAlignment {
  source: DataSource;
  mode: AlignmentMode;
  /** Qualified column keys contributed by this source. */
  columns: string[];
  /** Largest gap, in seconds, between a primary row and its matched sample. */
  worstSkewS: number | null;
}

/**
 * The assembled multi-source table. Column keys are **qualified** as
 * `${source}:${rawKey}` — e.g. `GCS:hat0_ch0` and `TCS:hat0_ch0` are distinct
 * columns even though both files spell the header `hat0_ch0`.
 */
export interface AssembledTable extends RawTable {
  /** The source whose timeline every column was resampled onto. */
  primarySource: DataSource;
  alignments: SourceAlignment[];
  /**
   * Loaded sources that could not be merged because one of the two logs has no
   * timestamp column. Their columns are absent from this table.
   */
  unalignedSources: DataSource[];
  /**
   * Each contributing log's own sample rate in Hz, before it was resampled.
   * A secondary source keeps its native rate here even though its columns now
   * have one row per *primary* sample — repeated values, not new information.
   */
  sourceRates: Partial<Record<DataSource, number | null>>;
}

export type TimestampUnit = "s" | "ms" | "us" | "ns" | "none";

/**
 * Where a channel's samples come from, and how it maps onto a CSV column.
 * `colKey` is the exact column header within that source's file:
 *   GCS / TCS -> `hat{hat_id}_ch{channel_id}`
 *   FAS       -> `{node}_ch{channel}`
 * The pipeline looks columns up by `qualifiedKey(binding)`, never by `colKey`
 * alone — see `DataSource`.
 */
export interface ChannelBinding {
  source: DataSource;
  colKey: string;
}

/** Why a configured sensor produced no channel. */
export type ChannelSkipReason =
  | "missing-column" // the source's log is loaded, but has no such column
  | "source-not-loaded" // no log for that subsystem was loaded at all
  | "invalid-calibration";

/** A configured sensor that could not be resolved against the loaded data. */
export interface SkippedChannel {
  name: string;
  colKey: string;
  source: ChannelBinding["source"];
  reason: ChannelSkipReason;
  detail?: string;
}

/** How a channel's engineering values were produced from the raw counts. */
export type ChannelOrigin =
  | "calibrated" // piecewise-linear table applied
  | "raw"; // no calibration table in config — passed through

/** A resolved, calibrated channel ready to plot, tabulate, or export. */
export interface Channel {
  /** Stable id, unique within a dataset (the sensor's config name). */
  id: string;
  /** Display name from the config (`SensorEntry.name`). */
  name: string;
  unit: string;
  /** Sensor type from config ("PT" | "LC" | "TC"). */
  type: string;
  origin: ChannelOrigin;
  binding: ChannelBinding;
  /** Engineering-unit samples, parallel to the dataset's time base. */
  values: Float64Array;
  /** Filters applied, in order, for provenance display. */
  applied: string[];
  /**
   * Effective sample rate of this trace in Hz — the rate at which it actually
   * carries new information, which is not always the timeline's rate. A channel
   * merged from a slower log has one row per primary sample but only its own
   * source's resolution, so this is the smaller of the two. null when the logs
   * carried no usable timestamps.
   */
  sampleRateHz: number | null;
}

// ---------------------------------------------------------------------------
// Actuation events
// ---------------------------------------------------------------------------

/** What kind of hardware channel an actuation event came from. */
export type ActuationKind = "servo" | "relay" | "gpio" | "recording";

/**
 * One actuation event: a hardware channel in the actuator log changed value.
 *
 * The `*_actuators.csv` log writes a full state snapshot each time something is
 * commanded, so events are recovered by diffing consecutive rows. A row's
 * `type_id` says which family moved; the diff says exactly which channel.
 */
export interface ActuationEvent {
  /** Stable id, unique within a log. */
  id: string;
  /** Wall-clock time from the actuator log, in epoch ms. */
  epochMs: number;
  /** Position on the dataset's shared time base, in seconds. */
  elapsed: number;
  kind: ActuationKind;
  /** Hardware channel column, e.g. `servo_9`, `relay_8`, `gpio_17`. */
  channel: string;
  /** Configured actuator owning this channel, or null when unmapped. */
  actuator: string | null;
  /** Actuator type from config (`servo`, `solenoid`, …), when resolved. */
  actuatorType: string | null;
  /** Readable state after the change, e.g. `open`, `on`, `1900 µs`. */
  state: string;
  /** Readable state before the change, or null for the first observation. */
  previousState: string | null;
  /** Raw channel value after the change. */
  value: number;
  /** Raw channel value before the change, or null. */
  previousValue: number | null;
  /** The log row's `type_id` column. */
  typeId: string;
  /** True when the event sits outside the loaded sensor capture's time span. */
  outsideCapture: boolean;
}

/** A parsed actuator log, before events are derived from it. */
export interface ActuatorLog {
  source: DataSource;
  /** Epoch ms per row. */
  timestamp: Float64Array;
  /** One entry per hardware channel column. */
  channels: RawColumn[];
  /** `type_id` per row; empty string when the column is absent. */
  typeIds: string[];
  rowCount: number;
}

/** A fully processed dataset: one shared time base plus resolved channels. */
export interface Dataset {
  /** Seconds elapsed from the first sample. Always the plotting x-axis. */
  elapsed: Float64Array;
  /** Epoch milliseconds per row, or null when the CSV had no usable timestamp. */
  epochMs: Float64Array | null;
  channels: Channel[];
  skipped: SkippedChannel[];
  rowCount: number;
  /** Raw column headers present in the CSV but not referenced by any sensor. */
  unboundColumns: string[];
  /** Mean sample rate in Hz, derived from the timestamps. null when unknown. */
  sampleRateHz: number | null;
  /** The subsystem whose timeline the dataset is built on. */
  primarySource: DataSource;
  /** How each secondary source was folded onto that timeline. */
  alignments: SourceAlignment[];
  /** Loaded sources left out because there was no clock to align them by. */
  unalignedSources: DataSource[];
  /** Actuation events placed on the shared time base, ordered by time. */
  events: ActuationEvent[];
}

/**
 * Processing knobs. Defaults mirror the Python script's argparse defaults so a
 * run in the UI reproduces `plot_calibrate_data5.py` with no flags.
 */
export interface ProcessingOptions {
  /** Savitzky-Golay window for `kg` channels. Forced odd, > polyorder. */
  savgolWindow: number;
  savgolPolyorder: number;
  /** Apply the Savitzky-Golay smoother to mass (`kg`) channels. */
  smoothMass: boolean;
  /** Keep every Nth row. 1 = no decimation. */
  decimate: number;
}

export const DEFAULT_PROCESSING: ProcessingOptions = {
  savgolWindow: 51,
  savgolPolyorder: 3,
  smoothMass: true,
  decimate: 1,
};

/** Summary statistics over a window of a channel. */
export interface ChannelStats {
  count: number;
  min: number | null;
  max: number | null;
  mean: number | null;
  stdev: number | null;
  /** last − first over the window. */
  delta: number | null;
  /** Trapezoidal ∫ value·dt over the window, in unit·s. */
  integral: number | null;
}

/** Inclusive elapsed-second window, or null for "everything". */
export interface TimeWindow {
  start: number;
  end: number;
}

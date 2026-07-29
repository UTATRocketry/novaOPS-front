"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { downloadDataFile } from "@/lib/api";
import type { ActuatorEntry, SensorEntry } from "@/lib/types";
import {
  CsvFormatError,
  DEFAULT_PROCESSING,
  assembleTables,
  buildDataset,
  deriveActuationEvents,
  detectSourceFromName,
  looksLikeActuatorCsv,
  looksLikeFasCsv,
  makeEventPlacer,
  parseActuatorCsv,
  parseFasCsv,
  parseWideCsv,
} from "@/lib/analysis";
import type {
  ActuatorLog,
  DataSource,
  Dataset,
  ProcessingOptions,
  SourceTable,
  TimeWindow,
} from "@/lib/analysis";

/** Where a loaded CSV came from — shown so provenance is never ambiguous. */
export type SourceKind = "backend" | "local";

/** What role a loaded file plays. */
export type SlotKind = "sensors" | "actuators";

export interface LoadedFile {
  /** Stable id for React keys and removal. */
  id: string;
  name: string;
  origin: SourceKind;
  slot: SlotKind;
  /** Which subsystem produced it. Operator-overridable — see `setFileSource`. */
  source: DataSource;
  /** True when the source was guessed from the filename rather than the data. */
  sourceInferred: boolean;
  rowCount: number;
  columnCount: number;
}

export interface AnalysisSession {
  files: LoadedFile[];
  /** Sensor logs by subsystem, for slot-oriented UI. */
  sensorFiles: LoadedFile[];
  actuatorFiles: LoadedFile[];
  /** Raw columns of the assembled table — used by the keep-raw export. */
  rawColumns: Array<{ key: string; values: Float64Array }>;
  /** Headers dropped during parsing because they held no numeric data. */
  ignoredColumns: string[];

  dataset: Dataset | null;
  /** True when an actuator log is loaded but its clock can't be related. */
  eventsUnplaceable: boolean;

  options: ProcessingOptions;
  setOptions: (next: Partial<ProcessingOptions>) => void;
  resetOptions: () => void;

  window: TimeWindow | null;
  setWindow: (w: TimeWindow | null) => void;
  fullRange: TimeWindow | null;

  loading: boolean;
  error: string | null;
  clearError: () => void;

  loadBackendFile: (fileName: string, source?: DataSource) => Promise<void>;
  loadLocalFile: (file: File, source?: DataSource) => Promise<void>;
  /** Re-tag an already-loaded file. The pipeline re-resolves immediately. */
  setFileSource: (id: string, source: DataSource) => void;
  removeFile: (id: string) => void;
  clear: () => void;
}

function describeError(err: unknown): string {
  if (err instanceof CsvFormatError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

interface Entry {
  file: LoadedFile;
  table?: SourceTable;
  log?: ActuatorLog;
}

/**
 * Owns one analysis session: the loaded logs, the processing knobs, and the
 * derived dataset.
 *
 * Several logs can be open at once — a novaGround sensor CSV, a novaThermo
 * sensor CSV, a FAS log, and the matching actuator logs. They are folded onto a
 * single timeline with source-qualified column keys, because a novaGround and a
 * novaThermo file both use `hat{H}_ch{C}` headers for different hardware and
 * nothing in the file contents distinguishes them.
 *
 * Parsing and the whole calibrate/filter/differentiate pipeline run in the
 * browser — nothing is uploaded, and a local file never leaves the machine.
 */
export function useAnalysisSession(
  sensors: SensorEntry[],
  actuators: ActuatorEntry[],
): AnalysisSession {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [options, setOptionsState] = useState<ProcessingOptions>(DEFAULT_PROCESSING);
  const [window, setWindow] = useState<TimeWindow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guards against an earlier, slower load landing after a newer one.
  const loadSeq = useRef(0);
  const idSeq = useRef(0);

  const assembled = useMemo(() => {
    const tables = entries
      .map((e) => e.table)
      .filter((t): t is SourceTable => t != null);
    return assembleTables(tables);
  }, [entries]);

  // Actuation events, placed on the sensor timeline's wall clock.
  const { events, eventsUnplaceable } = useMemo(() => {
    const logs = entries.map((e) => e.log).filter((l): l is ActuatorLog => l != null);
    if (logs.length === 0) return { events: [], eventsUnplaceable: false };
    if (!assembled) return { events: [], eventsUnplaceable: true };

    const toElapsed = makeEventPlacer(assembled);
    if (!toElapsed) return { events: [], eventsUnplaceable: true };

    const all = logs.flatMap((log) =>
      deriveActuationEvents(log, { actuators, toElapsed }),
    );
    all.sort((a, b) => a.elapsed - b.elapsed);
    return { events: all, eventsUnplaceable: false };
  }, [entries, assembled, actuators]);

  const dataset = useMemo<Dataset | null>(() => {
    if (!assembled) return null;
    return buildDataset({ table: assembled, sensors, options, events });
  }, [assembled, sensors, options, events]);

  const fullRange = useMemo<TimeWindow | null>(() => {
    if (!dataset || dataset.elapsed.length === 0) return null;
    return {
      start: dataset.elapsed[0],
      end: dataset.elapsed[dataset.elapsed.length - 1],
    };
  }, [dataset]);

  const setOptions = useCallback((next: Partial<ProcessingOptions>) => {
    setOptionsState((prev) => ({ ...prev, ...next }));
  }, []);

  const resetOptions = useCallback(() => setOptionsState(DEFAULT_PROCESSING), []);

  /**
   * Route a CSV to the right parser and slot.
   *
   * Shape is detected from the header (long-format FAS, actuator state log, or
   * a wide sensor table). Subsystem is detected from the *filename*, which is
   * the only place that information exists — an explicit `source` argument
   * always wins.
   */
  const ingest = useCallback(
    (text: string, name: string, origin: SourceKind, override?: DataSource) => {
      const detected = detectSourceFromName(name);
      const isFas = looksLikeFasCsv(text);
      const source: DataSource = override ?? detected ?? (isFas ? "FAS" : "GCS");
      const sourceInferred = override == null && detected == null;
      const id = `f${idSeq.current++}`;

      if (looksLikeActuatorCsv(text) && !isFas) {
        const log = parseActuatorCsv(text, source);
        const file: LoadedFile = {
          id,
          name,
          origin,
          slot: "actuators",
          source,
          sourceInferred,
          rowCount: log.rowCount,
          columnCount: log.channels.length,
        };
        setEntries((prev) => [
          // One actuator log per subsystem; a new one replaces the old.
          ...prev.filter((e) => !(e.log && e.file.source === source)),
          { file, log },
        ]);
        return;
      }

      const table: SourceTable = isFas
        ? { ...parseFasCsv(text), source: "FAS" }
        : { ...parseWideCsv(text), source };

      const file: LoadedFile = {
        id,
        name,
        origin,
        slot: "sensors",
        source: table.source,
        sourceInferred: isFas ? false : sourceInferred,
        rowCount: table.rowCount,
        columnCount: table.columns.length,
      };
      setEntries((prev) => [
        // One sensor log per subsystem; loading another replaces it.
        ...prev.filter((e) => !(e.table && e.file.source === table.source)),
        { file, table },
      ]);
      setWindow(null);
    },
    [],
  );

  const runLoad = useCallback(
    async (read: () => Promise<{ text: string; name: string }>, origin: SourceKind, source?: DataSource) => {
      const seq = ++loadSeq.current;
      setLoading(true);
      setError(null);
      try {
        const { text, name } = await read();
        if (seq !== loadSeq.current) return;
        ingest(text, name, origin, source);
      } catch (err) {
        if (seq === loadSeq.current) setError(describeError(err));
      } finally {
        if (seq === loadSeq.current) setLoading(false);
      }
    },
    [ingest],
  );

  const loadBackendFile = useCallback(
    (fileName: string, source?: DataSource) =>
      runLoad(
        async () => {
          const blob = await downloadDataFile(fileName);
          return { text: await blob.text(), name: fileName };
        },
        "backend",
        source,
      ),
    [runLoad],
  );

  const loadLocalFile = useCallback(
    (file: File, source?: DataSource) =>
      runLoad(async () => ({ text: await file.text(), name: file.name }), "local", source),
    [runLoad],
  );

  /**
   * Re-tag a loaded file's subsystem. This is the operator's escape hatch for
   * a file whose name doesn't say where it came from — and the correction path
   * when the guess was wrong, which matters because a mis-tagged file silently
   * binds thermocouples to pressure-transducer calibrations.
   */
  const setFileSource = useCallback((id: string, source: DataSource) => {
    setEntries((prev) => {
      const target = prev.find((e) => e.file.id === id);
      if (!target || target.file.source === source) return prev;
      const retagged: Entry = {
        file: { ...target.file, source, sourceInferred: false },
        table: target.table ? { ...target.table, source } : undefined,
        log: target.log ? { ...target.log, source } : undefined,
      };
      // Whatever already occupied that subsystem's slot steps aside.
      return [
        ...prev.filter(
          (e) =>
            e.file.id !== id &&
            !(e.file.source === source && e.file.slot === target.file.slot),
        ),
        retagged,
      ];
    });
  }, []);

  const removeFile = useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e.file.id !== id));
  }, []);

  const clear = useCallback(() => {
    loadSeq.current++;
    setEntries([]);
    setWindow(null);
    setError(null);
    setLoading(false);
  }, []);

  const files = useMemo(() => entries.map((e) => e.file), [entries]);

  return {
    files,
    sensorFiles: files.filter((f) => f.slot === "sensors"),
    actuatorFiles: files.filter((f) => f.slot === "actuators"),
    rawColumns: assembled?.columns ?? [],
    ignoredColumns: assembled?.ignoredColumns ?? [],
    dataset,
    eventsUnplaceable,
    options,
    setOptions,
    resetOptions,
    window,
    setWindow,
    fullRange,
    loading,
    error,
    clearError: useCallback(() => setError(null), []),
    loadBackendFile,
    loadLocalFile,
    setFileSource,
    removeFile,
    clear,
  };
}

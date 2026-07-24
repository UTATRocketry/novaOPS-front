import type { AlertSource } from "../types";
import { batterySource } from "./battery";
import { sdCardSource } from "./sdCard";
import { streamHealthSource } from "./streamHealth";

// ---------------------------------------------------------------------------
// Condition-source registry
//
// This is the ONLY place that knows which condition alerts exist. Add a source
// by writing a `*.ts` in this folder and appending it here; remove one by
// deleting its line. Nothing else in the alert system references specific
// sources, so the set is fully pluggable.
//
// (Event alerts — e.g. API errors — arrive imperatively via `../bus` and are
// not registered here.)
// ---------------------------------------------------------------------------

export const CONDITION_SOURCES: AlertSource[] = [
  batterySource,
  sdCardSource,
  streamHealthSource,
];

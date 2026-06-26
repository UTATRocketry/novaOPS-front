import type { FreshnessWindows } from "./types";
import { useNovaStore } from "./store";

/**
 * How long (ms) a stream may be silent before its status transitions
 * `live → stale`. Override specific windows by passing a partial object to
 * `createStalenessTimer`.
 */
export const DEFAULT_FRESHNESS_WINDOWS: FreshnessWindows = {
  actuatorStates: 10_000, // changes only after commands; generous window
  engineData:      2_000, // 10 Hz feed; stale after 2 s of silence
  flightData:      5_000, // flight telemetry can be bursty
  flightEvents:   60_000, // milestone events are sparse
  lockout:        30_000, // slow-changing hardware signal
};

/**
 * Starts the single store-level staleness sweep.
 *
 * One shared interval (default 500 ms) ticks across all live slices and
 * transitions any that have been silent past their freshness window from
 * `live` to `stale`. Components still show the last retained `data` value,
 * but must visually de-emphasise it (dim + age badge).
 *
 * Returns a cleanup function — call it when the socket is permanently closed.
 *
 * @example
 *   const stop = createStalenessTimer({ engineData: 3_000 });
 *   // later:
 *   stop();
 */
export function createStalenessTimer(
  customWindows: Partial<FreshnessWindows> = {},
  tickMs = 500,
): () => void {
  const windows: FreshnessWindows = { ...DEFAULT_FRESHNESS_WINDOWS, ...customWindows };
  const id = setInterval(() => {
    useNovaStore.getState().tickStaleness(windows);
  }, tickMs);
  return () => clearInterval(id);
}

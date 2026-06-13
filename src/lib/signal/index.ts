/**
 * Signal-strength adapter.
 *
 * The backend field for signal strength is unsettled (SPEC.md open question).
 * This adapter returns null until the backend schema is known.
 *
 * Dev usage: set NEXT_PUBLIC_NOVA_FAKE_SIGNAL=true to return realistic-looking
 * fake data without a live backend.
 */

export interface SignalStrength {
  /** Received signal strength in dBm. null = unknown. */
  dBm: number | null;
  /** Discretised 0–5 bar representation. null = unknown. */
  bars: number | null;
}

const NULL_SIGNAL: SignalStrength = { dBm: null, bars: null };

/** dBm thresholds → 0–5 bars (tuned for a 915 MHz LoRa link). */
export function dBmToBars(dBm: number): number {
  if (dBm >= -50) return 5;
  if (dBm >= -65) return 4;
  if (dBm >= -75) return 3;
  if (dBm >= -85) return 2;
  if (dBm >= -95) return 1;
  return 0;
}

/**
 * Adapt raw backend signal data → typed SignalStrength.
 *
 * Always returns null signal until the backend exposes a signal field and
 * this adapter is updated to read it. The `_raw` parameter is reserved for
 * that future implementation.
 */
export function adaptSignal(_raw: Record<string, unknown> | null): SignalStrength {
  if (process.env.NEXT_PUBLIC_NOVA_FAKE_SIGNAL === "true") {
    const dBm = -65;
    return { dBm, bars: dBmToBars(dBm) };
  }
  return NULL_SIGNAL;
}

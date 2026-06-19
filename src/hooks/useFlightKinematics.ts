"use client";

import { useRef } from "react";
import type { FlightTelemetry } from "@/lib/flight/types";

// ---------------------------------------------------------------------------
// useFlightKinematics
//
// The FAS packet does not transmit vertical velocity or inclination, so they
// are estimated UI-side (SPEC.md open question / implementation plan §13.2):
//   - velocity   ← time-derivative of baro altitude, EMA-smoothed
//   - inclination ← angle of the accel (gravity) vector from vertical
//
// Both are best-effort estimates. They are only produced from sufficiently
// fresh, finite data; otherwise they stay `undefined` so the UI renders `—`
// rather than a fabricated value (control-surface safety rule).
// ---------------------------------------------------------------------------

const EMA_ALPHA = 0.3;     // velocity smoothing weight on the newest sample
const MAX_DT_S = 2;        // ignore altitude gaps larger than this (stale)

export interface DerivedKinematics {
  /** Vertical velocity, m/s (positive = ascending). */
  velocity?: number;
  /** Angle of the vehicle from vertical, degrees (0 = upright). */
  inclination?: number;
}

export function useFlightKinematics(
  telemetry: FlightTelemetry | null,
): DerivedKinematics {
  const lastRef = useRef<{ alt: number; t: number } | null>(null);
  const velRef = useRef<number | undefined>(undefined);

  const out: DerivedKinematics = {};

  // --- velocity from altitude derivative ------------------------------------
  if (telemetry?.altitude !== undefined) {
    // Prefer the FMC sample clock; fall back to wall-clock if absent.
    const tSec =
      telemetry.timestamp !== undefined
        ? telemetry.timestamp / 1000
        : Date.now() / 1000;
    const prev = lastRef.current;
    if (prev) {
      const dt = tSec - prev.t;
      if (dt > 0 && dt <= MAX_DT_S) {
        const inst = (telemetry.altitude - prev.alt) / dt;
        velRef.current =
          velRef.current === undefined
            ? inst
            : EMA_ALPHA * inst + (1 - EMA_ALPHA) * velRef.current;
      }
    }
    lastRef.current = { alt: telemetry.altitude, t: tSec };
    out.velocity = velRef.current;
  } else {
    // No altitude → drop history so a later resume doesn't span a gap.
    lastRef.current = null;
    velRef.current = undefined;
  }

  // --- inclination from the accel (gravity) vector --------------------------
  const a = telemetry?.accel;
  if (a && a.magnitude > 1e-6) {
    const cos = Math.max(-1, Math.min(1, a.z / a.magnitude));
    out.inclination = (Math.acos(cos) * 180) / Math.PI;
  }

  return out;
}

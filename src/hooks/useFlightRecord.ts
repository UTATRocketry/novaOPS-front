"use client";

import { useEffect, useState } from "react";
import { getFlightSeries } from "@/lib/flight/recorder";
import type { FlightChannel } from "@/lib/flight/recorder";

// ---------------------------------------------------------------------------
// useFlightRecord
//
// Subscribes a component to the central flight recorder by re-rendering on a
// fixed interval and returning live references to the recorded series. The
// recorder mutates its arrays only on a timer, so a synchronous consumer (the
// chart build / render pass) always reads consistent array lengths.
// ---------------------------------------------------------------------------

export interface FlightRecordView {
  tsSec: number[];
  channels: Record<FlightChannel, number[]>;
}

export function useFlightRecord(intervalMs = 200): FlightRecordView {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return getFlightSeries();
}

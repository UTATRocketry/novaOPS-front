"use client";

import { useEffect, useState } from "react";
import { Flex } from "@chakra-ui/react";
import { KpiTile } from "@/components/primitives";
import type { FlightTelemetry } from "@/lib/flight/types";

export interface FlightKpiStripProps {
  telemetry: FlightTelemetry | null;
  launchEpochMs: number | null;
  /** Derived vertical velocity, m/s (estimated UI-side). */
  velocity?: number;
  /** Derived inclination from vertical, degrees (estimated UI-side). */
  inclination?: number;
  /** Flight state machine state (fas_fsm). */
  fsmState?: string;
}

function formatMissionTime(launchEpochMs: number | null, nowMs: number): string {
  if (launchEpochMs === null) return "T+--:--:--";
  const elapsed = Math.max(0, nowMs - launchEpochMs);
  const totalSec = Math.floor(elapsed / 1000);
  const hh = Math.floor(totalSec / 3600);
  const mm = Math.floor((totalSec % 3600) / 60);
  const ss = totalSec % 60;
  return `T+${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

export function FlightKpiStrip({
  telemetry,
  launchEpochMs,
  velocity,
  inclination,
  fsmState,
}: FlightKpiStripProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (launchEpochMs === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [launchEpochMs]);

  const missionTime = formatMissionTime(launchEpochMs, now);

  const altitude =
    telemetry?.altitude !== undefined ? telemetry.altitude.toFixed(1) : undefined;

  // Prefer the explicitly-passed derived value; fall back to any backend field.
  const velocityVal = velocity ?? telemetry?.velocity;
  const velocityStr = velocityVal !== undefined ? velocityVal.toFixed(1) : undefined;

  const inclinationVal = inclination ?? telemetry?.inclination;
  const inclinationStr =
    inclinationVal !== undefined ? inclinationVal.toFixed(1) : undefined;

  const state = fsmState ?? telemetry?.state;

  return (
    <Flex
      gap={6}
      px={4}
      py={3}
      bg="bg.surface"
      borderBottom="1px solid"
      borderColor="border.default"
      flexWrap="wrap"
    >
      <KpiTile label="Mission Time" value={missionTime} />
      <KpiTile label="State" value={state} />
      <KpiTile label="Altitude" value={altitude} unit="m" />
      <KpiTile label="Velocity" value={velocityStr} unit="m/s" />
      <KpiTile label="Inclination" value={inclinationStr} unit="°" />
    </Flex>
  );
}

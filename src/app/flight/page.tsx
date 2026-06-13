"use client";

import { useState } from "react";
import { Box, Flex, Text } from "@chakra-ui/react";
import { PageHeader } from "@/components/shell";
import { PillTabs } from "@/components/primitives";
import type { TabItem } from "@/components/primitives";
import { useNovaStore } from "@/lib/store/store";
import { sel } from "@/lib/store/selectors";
import {
  FlightKpiStrip,
  FlightStatusCard,
  IncomingPacketCard,
  AxisChart,
  EnvironmentCard,
  AltitudeTrendPlaceholder,
  FlightGraph,
} from "@/components/flight";
import type { FlightMilestones } from "@/lib/flight/types";

// ---------------------------------------------------------------------------
// Tab config
// ---------------------------------------------------------------------------

type FlightView = "dashboard" | "map" | "graph";

const VIEW_TABS: TabItem[] = [
  { value: "dashboard", label: "Dashboard" },
  { value: "map",       label: "Map"       },
  { value: "graph",     label: "Graph"     },
];

const EMPTY_MILESTONES: FlightMilestones = {
  launchDetected: false,
  motorCutoff:    false,
  apogee:         false,
  drogueDeployed: false,
  mainDeployed:   false,
  landed:         false,
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FlightPage() {
  const [view, setView] = useState<FlightView>("dashboard");

  // Narrow selectors — each re-renders only when its slice changes.
  const telemetry      = useNovaStore(sel.flightData);
  const flightEvents   = useNovaStore(sel.flightEvents);
  const flightStatus   = useNovaStore(sel.flightDataStatus);

  const isLive = flightStatus === "live";

  const milestones    = flightEvents?.milestones   ?? EMPTY_MILESTONES;
  const launchEpochMs = flightEvents?.launchEpochMs ?? null;
  const phase         = telemetry?.phase ?? flightEvents?.phase;
  const state         = telemetry?.state ?? flightEvents?.state;

  return (
    <Box>
      <PageHeader
        title="Flight"
        subtitle="Telemetry · live"
        action={
          <PillTabs
            items={VIEW_TABS}
            value={view}
            onChange={(v) => setView(v as FlightView)}
          />
        }
      />

      {/* KPI strip — always visible, above tab content */}
      <FlightKpiStrip telemetry={telemetry} launchEpochMs={launchEpochMs} />

      {/* ------------------------------------------------------------------ */}
      {/* Dashboard tab                                                        */}
      {/* ------------------------------------------------------------------ */}
      {view === "dashboard" && (
        <Flex gap={4} p={4} align="flex-start" flexWrap="wrap">
          {/* Left column ~60% */}
          <Flex direction="column" gap={4} flex="3" minW="280px">
            <AltitudeTrendPlaceholder altitude={telemetry?.altitude} />
            <AxisChart
              title="Linear Acceleration"
              data={telemetry?.accel}
              unit="m/s²"
              noDataLabel="No IMU data"
            />
            <AxisChart
              title="Angular Velocity"
              data={telemetry?.gyro}
              unit="deg/s"
              noDataLabel="No gyro data"
            />
            <AxisChart
              title="Magnetic Field"
              data={telemetry?.mag}
              unit="µT"
              noDataLabel="No magnetometer data"
            />
            <AxisChart
              title="High-G Acceleration"
              data={telemetry?.accelHi}
              unit="g"
              noDataLabel="No high-G data"
            />
          </Flex>

          {/* Right column ~40% */}
          <Flex direction="column" gap={4} flex="2" minW="240px">
            <FlightStatusCard
              milestones={milestones}
              phase={phase}
              state={state}
            />
            <IncomingPacketCard
              rawPacket={telemetry?.rawPacket}
              live={isLive}
            />
            <EnvironmentCard
              pressure={telemetry?.pressure}
              temperature={telemetry?.temperature}
            />
          </Flex>
        </Flex>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Map tab                                                              */}
      {/* ------------------------------------------------------------------ */}
      {view === "map" && (
        <Flex align="center" justify="center" mt={12} px={4}>
          <Text color="text.muted" textAlign="center">
            Map view — coming soon (GPS required)
          </Text>
        </Flex>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Graph tab                                                            */}
      {/* ------------------------------------------------------------------ */}
      {view === "graph" && (
        <FlightGraph
          currentTelemetry={telemetry}
          events={flightEvents?.events ?? []}
        />
      )}
    </Box>
  );
}

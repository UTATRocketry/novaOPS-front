"use client";

import { useState } from "react";
import { Box, Button, Flex, Text } from "@chakra-ui/react";
import { PageHeader } from "@/components/shell";
import { Icon, PillTabs } from "@/components/primitives";
import type { TabItem } from "@/components/primitives";
import { useNovaStore } from "@/lib/store/store";
import { sel } from "@/lib/store/selectors";
import { useFlightKinematics } from "@/hooks/useFlightKinematics";
import { useConfig } from "@/hooks/useConfig";
import type { DeviceEntry, DeviceRange } from "@/lib/types";
import {
  FlightKpiStrip,
  FlightStatusCard,
  IncomingPacketCard,
  EnvironmentCard,
  FlightGraph,
  FmcHealthStrip,
  GpsReadout,
  FmcAuxCard,
  LiveChartCard,
  RabCard,
  SdCard,
  AXIS3_SERIES,
  axis3Values,
} from "@/components/flight";
import { sendFasSound } from "@/lib/api/direct";
import type { FlightMilestones, FmcStatus } from "@/lib/flight/types";
import {
  sampleWindow,
  CH_ALTITUDE,
  CH_ACCEL,
  CH_GYRO,
  CH_MAG,
  CH_ACCEL_HI,
  type FlightChannel,
} from "@/lib/flight/recorder";

/** Rolling-window length for the dashboard charts (matches the Plot default). */
const DASH_WINDOW_SEC = 30;

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
  launchDetected:  false,
  motorBurnout:    false,
  apogeeDetected:  false,
  drogueDeployed:  false,
  mainDeployed:    false,
  landingDetected: false,
};

/** First FMC board's status block (single FMC in the current fleet). */
function firstFmc(fmc: Record<string, FmcStatus> | undefined): FmcStatus | undefined {
  if (!fmc) return undefined;
  for (const value of Object.values(fmc)) return value;
  return undefined;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FlightPage() {
  const [view, setView] = useState<FlightView>("dashboard");

  // Narrow selectors — each re-renders only when its slice changes.
  const telemetry      = useNovaStore(sel.flightData);
  const flightEvents   = useNovaStore(sel.flightEvents);
  const flightStatus   = useNovaStore(sel.flightDataStatus);
  const clientId       = useNovaStore(sel.clientId);

  const isLive = flightStatus === "live";

  const milestones    = flightEvents?.milestones   ?? EMPTY_MILESTONES;
  const launchEpochMs = flightEvents?.launchEpochMs ?? null;
  const phase         = telemetry?.fsm?.phase ?? flightEvents?.phase;
  const fsmState      = telemetry?.fsm?.state ?? telemetry?.state ?? flightEvents?.state;

  // Velocity + inclination are not transmitted; estimate them UI-side.
  const { velocity, inclination } = useFlightKinematics(telemetry);

  // Dashboard chart traces read from the central recorder so they keep
  // collecting from connect and survive page navigation. Clamping the window to
  // launchEpochMs makes the trace reset to T-0 the moment launch is detected.
  const recorderSource = (channels: FlightChannel[]) => () =>
    sampleWindow(channels, DASH_WINDOW_SEC, launchEpochMs);

  const fmc = firstFmc(telemetry?.fmc);

  // FMC chart Y-ranges from config.Devices (match the live FMC board key, else
  // any device whose key starts with "FMC"). Absent metrics autoscale.
  const { data: config } = useConfig();
  const fmcKey = telemetry?.fmc ? Object.keys(telemetry.fmc)[0] : undefined;
  const devices = (config?.Devices ?? []) as DeviceEntry[];
  const fmcDev =
    devices.find((d) => d.key === fmcKey) ??
    devices.find((d) => d.key?.toUpperCase().startsWith("FMC"));
  const r: Record<string, DeviceRange> = fmcDev?.ranges ?? {};

  return (
    <Box>
      <PageHeader
        title="Flight"
        subtitle="Telemetry · live"
        action={
          <Flex align="center" gap={2}>
            <Button
              size="sm"
              variant="outline"
              disabled={!clientId}
              onClick={() => {
                if (clientId) {
                  sendFasSound({ node: "FMC_0", action: "tone" }, clientId)
                    .catch(console.error);
                }
              }}
            >
              <Icon name="music_note" size={14} />
              Test Tone
            </Button>
            <PillTabs
              items={VIEW_TABS}
              value={view}
              onChange={(v) => setView(v as FlightView)}
            />
          </Flex>
        }
      />

      {/* KPI strip — always visible, above tab content */}
      <FlightKpiStrip
        telemetry={telemetry}
        launchEpochMs={launchEpochMs}
        velocity={velocity}
        inclination={inclination}
        fsmState={fsmState}
      />

      {/* ------------------------------------------------------------------ */}
      {/* Dashboard tab                                                        */}
      {/* ------------------------------------------------------------------ */}
      {view === "dashboard" && (
        <Flex gap={4} p={4} align="flex-start" flexWrap="wrap">
          {/* Left column ~60% — live rolling charts; window resets at launch. */}
          <Flex direction="column" gap={4} flex="3" minW="280px">
            <LiveChartCard
              title="Altitude"
              series={[{ label: "Alt", colorToken: "info" }]}
              values={[telemetry?.altitude]}
              unit="m"
              yMin={r.altitude?.[0]}
              yMax={r.altitude?.[1]}
              resetKey={launchEpochMs}
              getSamples={recorderSource(CH_ALTITUDE)}
              height={220}
              noDataLabel="No barometer data"
            />
            <LiveChartCard
              title="Linear Acceleration"
              series={AXIS3_SERIES}
              values={axis3Values(telemetry?.accel)}
              unit="g"
              yMin={r.accel?.[0]}
              yMax={r.accel?.[1]}
              resetKey={launchEpochMs}
              getSamples={recorderSource(CH_ACCEL)}
              noDataLabel="No IMU data"
            />
            <LiveChartCard
              title="Angular Velocity"
              series={AXIS3_SERIES}
              values={axis3Values(telemetry?.gyro)}
              unit="dps"
              yMin={r.gyro?.[0]}
              yMax={r.gyro?.[1]}
              resetKey={launchEpochMs}
              getSamples={recorderSource(CH_GYRO)}
              noDataLabel="No gyro data"
            />
            <LiveChartCard
              title="Magnetic Field"
              series={AXIS3_SERIES}
              values={axis3Values(telemetry?.mag)}
              unit="µT"
              yMin={r.mag?.[0]}
              yMax={r.mag?.[1]}
              resetKey={launchEpochMs}
              getSamples={recorderSource(CH_MAG)}
              noDataLabel="No magnetometer data"
            />
            <LiveChartCard
              title="High-G Acceleration"
              series={AXIS3_SERIES}
              values={axis3Values(telemetry?.accelHi)}
              unit="g"
              yMin={r.accelHi?.[0]}
              yMax={r.accelHi?.[1]}
              resetKey={launchEpochMs}
              getSamples={recorderSource(CH_ACCEL_HI)}
              noDataLabel="No high-G data"
            />
          </Flex>

          {/* Right column ~40% */}
          <Flex direction="column" gap={4} flex="2" minW="240px">
            <FlightStatusCard
              milestones={milestones}
              phase={phase}
              state={fsmState}
            />
            <FmcHealthStrip health={fmc?.health} />
            <GpsReadout gps={telemetry?.gps} />
            <EnvironmentCard
              pressure={telemetry?.pressure}
              temperature={telemetry?.temperature}
            />
            <FmcAuxCard
              fmc={fmc}
              aux={telemetry?.aux}
              rf={telemetry?.rf}
              node={fmcKey ? fmcKey.replace(":", "_").toUpperCase() : "FMC_0"}
            />
            <RabCard rab={telemetry?.rab} />
            <SdCard
              sd={fmc?.sd}
              node={fmcKey ? fmcKey.replace(":", "_").toLowerCase() : "FMC_0"}
            />
            <IncomingPacketCard
              rawPacket={telemetry?.rawPacket}
              live={isLive}
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
          events={flightEvents?.events ?? []}
          launchEpochMs={launchEpochMs}
        />
      )}
    </Box>
  );
}

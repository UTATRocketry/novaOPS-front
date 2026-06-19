"use client";

import { Box, Flex, Text } from "@chakra-ui/react";
import { Card } from "@/components/primitives";
import { LiveChartCard } from "@/components/flight";
import type { PmbStatus } from "@/lib/flight/types";
import type { DeviceRange } from "@/lib/types";
import { FlagDot, Readout, num } from "./shared";

export interface PmbPowerCardProps {
  boardKey: string;
  pmb: PmbStatus;
  stale?: boolean;
  /** Chart Y-ranges from config.Devices (keys: voltage, temperature). */
  ranges?: Record<string, DeviceRange>;
}

function GroupLabel({ children }: { children: string }) {
  return (
    <Text fontSize="2xs" color="text.muted" textTransform="uppercase" letterSpacing="0.06em" mb={2}>
      {children}
    </Text>
  );
}

const V_SERIES = [
  { label: "MAIN", colorToken: "info" },
  { label: "BATT", colorToken: "nominal" },
  { label: "GSE", colorToken: "warn" },
];
const T_SERIES = [
  { label: "amb", colorToken: "info" },
  { label: "buck", colorToken: "warn" },
  { label: "boost", colorToken: "fault" },
];

export function PmbPowerCard({ boardKey, pmb, stale = false, ranges }: PmbPowerCardProps) {
  const pwr = pmb.pwr;
  const vmon = pmb.vmon;
  const temp = pmb.temp;
  const vR = ranges?.voltage;
  const tR = ranges?.temperature;

  return (
    <Card title={`${boardKey} · power management`} flex="1" minW="340px">
      <Box opacity={stale ? 0.55 : 1} transition="opacity 0.2s">
        <Flex gap={6} flexWrap="wrap" mb={3}>
          <Box flex="1" minW="150px">
            <GroupLabel>8V4 rail</GroupLabel>
            <Flex direction="column" gap={1}>
              <Readout label="voltage" value={num(pwr?.v8v4, " V")} />
              <Readout label="current" value={num(pwr?.i8v4, " A")} />
              <Readout label="power" value={num(pwr?.p8v4, " W")} />
            </Flex>
          </Box>
          <Box flex="1" minW="150px">
            <GroupLabel>24V0 rail</GroupLabel>
            <Flex direction="column" gap={1}>
              <Readout label="voltage" value={num(pwr?.v24v0, " V")} />
              <Readout label="current" value={num(pwr?.i24v0, " A")} />
              <Readout label="power" value={num(pwr?.p24v0, " W")} />
            </Flex>
          </Box>
          <Box flex="1" minW="150px">
            <GroupLabel>inputs</GroupLabel>
            <Flex direction="column" gap={1}>
              <Readout label="VMAIN" value={num(vmon?.vMain, " V")} />
              <Readout label="VBATT" value={num(vmon?.vBatt, " V")} />
              <Readout label="VGSE" value={num(vmon?.vGse, " V")} />
            </Flex>
          </Box>
          <Box flex="1" minW="150px">
            <GroupLabel>temperatures</GroupLabel>
            <Flex direction="column" gap={1}>
              <Readout label="ambient" value={num(temp?.ambient, " °C", 1)} />
              <Readout label="buck" value={num(temp?.buck, " °C", 1)} />
              <Readout label="boost" value={num(temp?.boost, " °C", 1)} />
            </Flex>
          </Box>
        </Flex>

        <GroupLabel>power-good / source</GroupLabel>
        <Flex gap={4} flexWrap="wrap" mb={3}>
          <FlagDot label="buck" value={vmon?.buckOn} />
          <FlagDot label="boost" value={vmon?.boostOn} />
          <FlagDot label="3V3" value={vmon?.pg3v3} />
          <FlagDot label="8V4" value={vmon?.pg8v4} />
          <FlagDot label="24V0" value={vmon?.pg24v0} />
          <FlagDot label="charger" value={vmon?.charger} />
          <FlagDot label="batt src" value={vmon?.battSrc} />
        </Flex>

        <Flex direction="column" gap={3}>
          <LiveChartCard
            title="Input voltages"
            series={V_SERIES}
            values={[vmon?.vMain, vmon?.vBatt, vmon?.vGse]}
            unit="V"
            yMin={vR?.[0]}
            yMax={vR?.[1]}
            height={150}
            noDataLabel="No vmon telemetry"
          />
          <LiveChartCard
            title="Temperatures"
            series={T_SERIES}
            values={[temp?.ambient, temp?.buck, temp?.boost]}
            unit="°C"
            yMin={tR?.[0]}
            yMax={tR?.[1]}
            height={150}
            noDataLabel="No temperature telemetry"
          />
        </Flex>
      </Box>
    </Card>
  );
}

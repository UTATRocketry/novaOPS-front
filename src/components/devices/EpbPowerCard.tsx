"use client";

import { Box, Flex } from "@chakra-ui/react";
import { Card } from "@/components/primitives";
import { LiveChartCard } from "@/components/flight";
import type { FasBoardPower } from "@/lib/flight/types";
import type { DeviceRange } from "@/lib/types";
import { Readout, num } from "./shared";

export interface EpbPowerCardProps {
  boardKey: string;
  power: FasBoardPower;
  stale?: boolean;
  /** Chart Y-ranges from config.Devices (keys: voltage, current). */
  ranges?: Record<string, DeviceRange>;
}

const V_SERIES = [
  { label: "8V4", colorToken: "info" },
  { label: "24V0", colorToken: "nominal" },
];
const I_SERIES = [
  { label: "8V4", colorToken: "info" },
  { label: "24V0", colorToken: "nominal" },
];

export function EpbPowerCard({ boardKey, power, stale = false, ranges }: EpbPowerCardProps) {
  const vR = ranges?.voltage;
  const iR = ranges?.current;
  return (
    <Card title={`${boardKey} · bus power`} flex="1" minW="340px" maxW="100%">
      <Box opacity={stale ? 0.55 : 1} transition="opacity 0.2s">
        <Flex gap={6} mb={3} flexWrap="wrap">
          <Flex direction="column" gap={1} flex="1" minW="120px">
            <Readout label="8V4 rail" value={num(power.v8v4, " V")} />
            <Readout label="8V4 current" value={num(power.i8v4, " A")} />
          </Flex>
          <Flex direction="column" gap={1} flex="1" minW="120px">
            <Readout label="24V0 rail" value={num(power.v24v, " V")} />
            <Readout label="24V0 current" value={num(power.i24v, " A")} />
          </Flex>
        </Flex>
        <Flex direction="column" gap={3}>
          <LiveChartCard
            title="Rail voltage"
            series={V_SERIES}
            values={[power.v8v4, power.v24v]}
            unit="V"
            yMin={vR?.[0]}
            yMax={vR?.[1]}
            height={140}
            noDataLabel="No rail telemetry"
          />
          <LiveChartCard
            title="Rail current"
            series={I_SERIES}
            values={[power.i8v4, power.i24v]}
            unit="A"
            yMin={iR?.[0]}
            yMax={iR?.[1]}
            height={140}
            noDataLabel="No current telemetry"
          />
        </Flex>
      </Box>
    </Card>
  );
}

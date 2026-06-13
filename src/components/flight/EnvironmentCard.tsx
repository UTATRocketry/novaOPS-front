"use client";

import { Flex } from "@chakra-ui/react";
import { Card, Gauge } from "@/components/primitives";
import type { GaugeZone } from "@/components/primitives";

export interface EnvironmentCardProps {
  pressure?: number;
  temperature?: number;
}

const PRESSURE_ZONES: GaugeZone[] = [
  { upTo: 0.2,  color: "info"    },
  { upTo: 0.5,  color: "nominal" },
  { upTo: 0.85, color: "nominal" },
  { upTo: 1,    color: "warn"    },
];

const TEMP_ZONES: GaugeZone[] = [
  { upTo: 0.2,  color: "info"    },
  { upTo: 0.55, color: "nominal" },
  { upTo: 0.8,  color: "warn"    },
  { upTo: 1,    color: "fault"   },
];

export function EnvironmentCard({ pressure, temperature }: EnvironmentCardProps) {
  return (
    <Card title="Environment">
      <Flex gap={4} justify="space-around" flexWrap="wrap">
        <Gauge
          value={pressure ?? null}
          min={800}
          max={1100}
          unit="hPa"
          label="Pressure"
          zones={PRESSURE_ZONES}
          size={140}
        />
        <Gauge
          value={temperature ?? null}
          min={-40}
          max={85}
          unit="°C"
          label="Temperature"
          zones={TEMP_ZONES}
          size={140}
        />
      </Flex>
    </Card>
  );
}

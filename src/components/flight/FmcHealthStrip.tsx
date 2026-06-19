"use client";

import { Flex, Text } from "@chakra-ui/react";
import { Card, StatusDot } from "@/components/primitives";
import type { FmcStatus } from "@/lib/flight/types";

export interface FmcHealthStripProps {
  health: FmcStatus["health"] | undefined;
}

const SENSORS: { key: keyof NonNullable<FmcStatus["health"]>; label: string }[] = [
  { key: "imuOk",      label: "IMU"   },
  { key: "accelOk",    label: "Hi-G"  },
  { key: "magOk",      label: "Mag"   },
  { key: "baroOk",     label: "Baro"  },
  { key: "gpsPresent", label: "GPS"   },
];

export function FmcHealthStrip({ health }: FmcHealthStripProps) {
  return (
    <Card title="FMC Sensor Health">
      {health === undefined ? (
        <Flex justify="center" py={3}>
          <Text fontSize="xs" color="text.muted">No health beacon</Text>
        </Flex>
      ) : (
        <Flex gap={2} flexWrap="wrap">
          {SENSORS.map(({ key, label }) => {
            const ok = health[key];
            // ok undefined → unknown (neutral), not a confident fault.
            const status = ok === undefined ? "neutral" : ok ? "nominal" : "fault";
            return (
              <Flex
                key={key}
                align="center"
                gap={2}
                px={2.5}
                py={1.5}
                borderRadius="control"
                border="1px solid"
                borderColor="border.default"
                bg="bg.surfaceRaised"
              >
                <StatusDot status={status} size={8} glow={status === "nominal"} />
                <Text fontSize="xs" fontWeight="600" color="text.primary">
                  {label}
                </Text>
              </Flex>
            );
          })}
        </Flex>
      )}
    </Card>
  );
}

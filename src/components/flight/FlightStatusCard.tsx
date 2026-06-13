"use client";

import { Flex, Text, Box } from "@chakra-ui/react";
import { Card, Chip, Mono } from "@/components/primitives";
import type { FlightMilestones } from "@/lib/flight/types";

export interface FlightStatusCardProps {
  milestones: FlightMilestones;
  phase?: string;
  state?: string;
}

const MILESTONE_LABELS: { key: keyof FlightMilestones; label: string }[] = [
  { key: "launchDetected", label: "Launch Detected" },
  { key: "motorCutoff",    label: "Motor Cutoff"    },
  { key: "apogee",         label: "Apogee"          },
  { key: "drogueDeployed", label: "Drogue Deploy"   },
  { key: "mainDeployed",   label: "Main Deploy"     },
  { key: "landed",         label: "Landing"         },
];

export function FlightStatusCard({ milestones, phase, state }: FlightStatusCardProps) {
  return (
    <Card title="Flight Status">
      <Flex direction="column" gap={2}>
        {MILESTONE_LABELS.map(({ key, label }) => {
          const achieved = milestones[key];
          return (
            <Flex key={key} align="center" justify="space-between">
              <Text fontSize="sm" color="text.primary">{label}</Text>
              <Chip status={achieved ? "nominal" : "neutral"}>
                {achieved ? "TRUE" : "FALSE"}
              </Chip>
            </Flex>
          );
        })}

        <Box
          mt={2}
          pt={2}
          borderTop="1px solid"
          borderColor="border.default"
        >
          <Flex gap={4} flexWrap="wrap">
            <Flex align="center" gap={2}>
              <Text fontSize="xs" color="text.muted" textTransform="uppercase" letterSpacing="0.06em">
                Phase
              </Text>
              <Mono fontSize="xs" color="text.primary">
                {phase ?? "—"}
              </Mono>
            </Flex>
            <Flex align="center" gap={2}>
              <Text fontSize="xs" color="text.muted" textTransform="uppercase" letterSpacing="0.06em">
                State
              </Text>
              <Mono fontSize="xs" color="text.primary">
                {state ?? "—"}
              </Mono>
            </Flex>
          </Flex>
        </Box>
      </Flex>
    </Card>
  );
}

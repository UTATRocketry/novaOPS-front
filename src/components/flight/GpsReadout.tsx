"use client";

import { Grid, GridItem, Flex, Text } from "@chakra-ui/react";
import { Card, Mono } from "@/components/primitives";
import type { GpsData } from "@/lib/flight/types";

export interface GpsReadoutProps {
  gps: GpsData | undefined;
}

interface Cell {
  label: string;
  value: string;
}

function buildCells(gps: GpsData): Cell[] {
  return [
    { label: "fix",   value: gps.fix === undefined ? "—" : gps.fix ? "yes" : "no" },
    { label: "sats",  value: gps.satellites !== undefined ? String(gps.satellites) : "—" },
    { label: "lat",   value: gps.lat.toFixed(6) },
    { label: "lon",   value: gps.lon.toFixed(6) },
    { label: "alt",   value: gps.alt !== undefined ? `${gps.alt.toFixed(1)} m` : "—" },
    { label: "HDOP",  value: gps.hdop !== undefined ? gps.hdop.toFixed(1) : "—" },
    { label: "speed", value: gps.speed !== undefined ? `${gps.speed.toFixed(1)} m/s` : "—" },
  ];
}

export function GpsReadout({ gps }: GpsReadoutProps) {
  return (
    <Card title="GPS">
      {gps === undefined ? (
        <Flex justify="center" py={3}>
          <Text fontSize="xs" color="text.muted">No GPS fix</Text>
        </Flex>
      ) : (
        <Grid templateColumns="repeat(auto-fit, minmax(72px, 1fr))" gap={3}>
          {buildCells(gps).map((cell) => (
            <GridItem key={cell.label}>
              <Flex direction="column" gap={0.5}>
                <Text
                  fontSize="2xs"
                  color="text.muted"
                  textTransform="uppercase"
                  letterSpacing="0.06em"
                >
                  {cell.label}
                </Text>
                <Mono fontSize="sm" color="text.primary">{cell.value}</Mono>
              </Flex>
            </GridItem>
          ))}
        </Grid>
      )}
    </Card>
  );
}

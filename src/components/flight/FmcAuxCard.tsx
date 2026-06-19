"use client";

import { Flex, Text, Box } from "@chakra-ui/react";
import { Card, Mono } from "@/components/primitives";
import type { FmcStatus } from "@/lib/flight/types";

export interface FmcAuxCardProps {
  fmc: FmcStatus | undefined;
}

interface Cell {
  label: string;
  value: string;
}

function num(v: number | undefined, suffix = "", digits = 1): string {
  return v !== undefined ? `${v.toFixed(digits)}${suffix}` : "—";
}

function group(title: string, cells: Cell[]) {
  return (
    <Box key={title} flex="1" minW="140px">
      <Text
        fontSize="2xs"
        color="text.muted"
        textTransform="uppercase"
        letterSpacing="0.06em"
        mb={2}
      >
        {title}
      </Text>
      <Flex direction="column" gap={1}>
        {cells.map((c) => (
          <Flex key={c.label} align="baseline" justify="space-between" gap={2}>
            <Text fontSize="xs" color="text.muted">{c.label}</Text>
            <Mono fontSize="xs" color="text.primary">{c.value}</Mono>
          </Flex>
        ))}
      </Flex>
    </Box>
  );
}

export function FmcAuxCard({ fmc }: FmcAuxCardProps) {
  const temp = fmc?.temp;
  const sd = fmc?.sd;
  const radio = fmc?.radio;

  return (
    <Card title="FMC Onboard">
      <Flex gap={6} flexWrap="wrap">
        {group("board temps", [
          { label: "near H7",     value: num(temp?.h7, " °C") },
          { label: "power stage", value: num(temp?.pwr, " °C") },
        ])}
        {group("SD card log", [
          { label: "state",   value: sd?.stateName ?? "—" },
          { label: "free",    value: num(sd?.freeMb, " MB", 0) },
          { label: "written", value: num(sd?.writtenKb, " KB", 0) },
        ])}
        {group("RFD900x radio", [
          { label: "power",  value: radio?.powered === undefined ? "—" : radio.powered ? "on" : "off" },
          { label: "mirror", value: radio?.enabled === undefined ? "—" : radio.enabled ? "on" : "off" },
          { label: "frames", value: num(radio?.txFrames, "", 0) },
        ])}
      </Flex>
    </Card>
  );
}

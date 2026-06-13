"use client";

import { Box, Flex, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { Mono } from "./Mono";

export interface KpiTileProps {
  label: string;
  /** The headline value. null/undefined renders an explicit no-data dash. */
  value?: ReactNode;
  unit?: string;
  /** Dim + mark when the underlying stream is stale. */
  stale?: boolean;
}

const NO_DATA = "—";

/** A small label over a large monospaced value-and-unit. */
export function KpiTile({ label, value, unit, stale = false }: KpiTileProps) {
  const hasValue = value !== undefined && value !== null && value !== "";
  return (
    <Box opacity={stale ? 0.55 : 1} transition="opacity 0.2s">
      <Text
        fontSize="2xs"
        textTransform="uppercase"
        letterSpacing="0.08em"
        color="text.muted"
        mb={1}
      >
        {label}
      </Text>
      <Flex align="baseline" gap={1}>
        <Mono fontSize="2xl" fontWeight="600" color={hasValue ? "text.primary" : "text.muted"}>
          {hasValue ? value : NO_DATA}
        </Mono>
        {hasValue && unit && (
          <Mono fontSize="sm" color="text.muted">
            {unit}
          </Mono>
        )}
      </Flex>
    </Box>
  );
}

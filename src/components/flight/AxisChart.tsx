"use client";

import { Box, Flex, Text } from "@chakra-ui/react";
import { Card, Mono } from "@/components/primitives";
import type { Axis3 } from "@/lib/flight/types";

export interface AxisChartProps {
  title: string;
  data: Axis3 | undefined;
  unit: string;
  noDataLabel?: string;
}

interface AxisRow {
  label: string;
  value: number;
  borderColor: string;
  textColor: string;
}

function formatVal(v: number): string {
  if (Math.abs(v) >= 1000) return v.toFixed(0);
  if (Math.abs(v) >= 100)  return v.toFixed(1);
  return v.toFixed(3);
}

export function AxisChart({ title, data, unit, noDataLabel }: AxisChartProps) {
  if (!data) {
    return (
      <Card title={title}>
        <Flex direction="column" align="center" justify="center" gap={1} py={4}>
          <Mono fontSize="2xl" color="text.muted">—</Mono>
          {noDataLabel && (
            <Text fontSize="xs" color="text.muted">{noDataLabel}</Text>
          )}
        </Flex>
      </Card>
    );
  }

  const rows: AxisRow[] = [
    {
      label: "X",
      value: data.x,
      borderColor: "var(--chakra-colors-fault)",
      textColor: "fault",
    },
    {
      label: "Y",
      value: data.y,
      borderColor: "var(--chakra-colors-accent-solid)",
      textColor: "accent.solid",
    },
    {
      label: "Z",
      value: data.z,
      borderColor: "var(--chakra-colors-nominal)",
      textColor: "nominal",
    },
    {
      label: "Mag",
      value: data.magnitude,
      borderColor: "var(--chakra-colors-text\\.muted)",
      textColor: "text.muted",
    },
  ];

  return (
    <Card title={title}>
      <Flex direction="column" gap={2}>
        {rows.map((row) => (
          <Flex
            key={row.label}
            align="center"
            gap={3}
            pl={3}
            borderLeft="4px solid"
            borderColor={row.borderColor}
          >
            <Text
              fontSize="xs"
              fontWeight="600"
              color={row.textColor}
              w="3ch"
              flexShrink={0}
            >
              {row.label}
            </Text>
            <Flex align="baseline" gap={1} flex={1}>
              <Mono fontSize="sm" color="text.primary">
                {formatVal(row.value)}
              </Mono>
              <Mono fontSize="xs" color="text.muted">
                {unit}
              </Mono>
            </Flex>
          </Flex>
        ))}
      </Flex>
    </Card>
  );
}

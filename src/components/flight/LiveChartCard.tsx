"use client";

import { Box, Flex, Text } from "@chakra-ui/react";
import { Card, Mono, Plot } from "@/components/primitives";
import type { PlotSeriesDef } from "@/components/primitives";
import type { Axis3 } from "@/lib/flight/types";

export interface LiveChartCardProps {
  title: string;
  series: PlotSeriesDef[];
  values: (number | null | undefined)[];
  unit: string;
  yMin?: number;
  yMax?: number;
  /** Rolling-window reset trigger — pass launchEpochMs so it clears at launch. */
  resetKey?: string | number | null;
  height?: number;
  noDataLabel?: string;
}

function fmt(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (Math.abs(v) >= 1000) return v.toFixed(0);
  if (Math.abs(v) >= 100) return v.toFixed(1);
  return v.toFixed(2);
}

/** A live rolling chart with a per-series value readout header. */
export function LiveChartCard({
  title, series, values, unit, yMin, yMax, resetKey, height = 200, noDataLabel,
}: LiveChartCardProps) {
  const hasData = values.some((v) => v != null && Number.isFinite(v));

  return (
    <Card
      title={title}
      headerAction={
        <Flex gap={3} align="baseline">
          {series.map((s, i) => (
            <Flex key={s.label} align="baseline" gap={1}>
              <Text fontSize="2xs" fontWeight="700" color={s.colorToken}>{s.label}</Text>
              <Mono fontSize="xs" color="text.primary">{fmt(values[i])}</Mono>
            </Flex>
          ))}
          <Mono fontSize="2xs" color="text.muted">{unit}</Mono>
        </Flex>
      }
    >
      {!hasData && noDataLabel && (
        <Text fontSize="xs" color="text.muted" mb={1}>{noDataLabel}</Text>
      )}
      <Plot
        series={series}
        values={values}
        unit={unit}
        yMin={yMin}
        yMax={yMax}
        resetKey={resetKey}
        height={height}
      />
    </Card>
  );
}

/** Series defs for a 3-axis (+magnitude) vector, matching the X/Y/Z/Mag palette. */
export const AXIS3_SERIES: PlotSeriesDef[] = [
  { label: "X",   colorToken: "fault" },
  { label: "Y",   colorToken: "accent.solid" },
  { label: "Z",   colorToken: "nominal" },
  { label: "Mag", colorToken: "text.muted" },
];

/** Values array for the AXIS3_SERIES from an optional Axis3. */
export function axis3Values(a: Axis3 | undefined): (number | null)[] {
  if (!a) return [null, null, null, null];
  return [a.x, a.y, a.z, a.magnitude];
}

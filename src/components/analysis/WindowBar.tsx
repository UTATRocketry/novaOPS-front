"use client";

import { Box, Flex, Text } from "@chakra-ui/react";
import { Icon, Mono } from "@/components/primitives";
import { MiniButton } from "./controls";
import type { TimeWindow } from "@/lib/analysis";

/** "Last N seconds" presets, mirroring the script's `--last` flag. */
const LAST_PRESETS = [30, 60, 120] as const;

export interface WindowBarProps {
  window: TimeWindow | null;
  fullRange: TimeWindow;
  onChange: (window: TimeWindow | null) => void;
  /** Whether the x-axis is elapsed seconds or a bare sample index. */
  xIsIndex: boolean;
}

/**
 * The shared time window. Every chart, the statistics table, and the CSV export
 * read from this one value, so what you zoom into is exactly what you measure
 * and exactly what you export.
 */
export function WindowBar({ window: win, fullRange, onChange, xIsIndex }: WindowBarProps) {
  const total = fullRange.end - fullRange.start;
  const active = win !== null;
  const shown = win ?? fullRange;
  const unit = xIsIndex ? "" : "s";

  return (
    <Flex
      align="center"
      gap={3}
      flexWrap="wrap"
      px={3}
      py={2}
      bg="bg.surface"
      border="1px solid"
      borderColor="border.default"
      borderRadius="card"
    >
      <Flex align="center" gap={1.5} color="text.muted" flexShrink={0}>
        <Icon name="crop_free" size={15} />
        <Text fontSize="xs" fontWeight="600">
          Window
        </Text>
      </Flex>

      <Mono fontSize="xs" color={active ? "accent.solid" : "text.muted"}>
        {shown.start.toFixed(2)}
        {unit} → {shown.end.toFixed(2)}
        {unit}
      </Mono>
      <Mono fontSize="2xs" color="text.muted">
        ({(shown.end - shown.start).toFixed(2)}
        {unit} of {total.toFixed(2)}
        {unit})
      </Mono>

      <Box flex={1} minW="8px" />

      {!xIsIndex &&
        LAST_PRESETS.filter((n) => n < total).map((n) => (
          <MiniButton
            key={n}
            title={`Keep the last ${n} seconds`}
            onClick={() => onChange({ start: fullRange.end - n, end: fullRange.end })}
          >
            last {n}s
          </MiniButton>
        ))}

      <MiniButton onClick={() => onChange(null)} disabled={!active}>
        Full capture
      </MiniButton>

      <Text fontSize="2xs" color="text.muted" whiteSpace="nowrap">
        drag a chart to zoom · double-click to reset
      </Text>
    </Flex>
  );
}

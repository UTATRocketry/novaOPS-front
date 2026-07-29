"use client";

import { useMemo } from "react";
import { Box, Flex, Grid, Text } from "@chakra-ui/react";
import { Card, Chip, Icon, Mono } from "@/components/primitives";
import { AnalysisChart } from "./AnalysisChart";
import { groupChannels } from "@/lib/analysis";
import type { Channel, Dataset, TimeWindow } from "@/lib/analysis";

export interface ChartGridProps {
  dataset: Dataset;
  channels: Channel[];
  window: TimeWindow | null;
  onWindowChange: (window: TimeWindow | null) => void;
  cursorIndex: number | null;
  onCursorIndex: (index: number | null) => void;
  colors: Map<string, string>;
  autoSplit: boolean;
  chartHeight: number;
  /** Draw actuation-event markers over every chart. */
  showEvents: boolean;
  /** Also draw the event labels (off keeps a busy capture readable). */
  showEventLabels?: boolean;
}

/** Legend under a chart: one swatch per trace, with the value at the cursor. */
function Legend({
  channels,
  colors,
  cursorIndex,
}: {
  channels: Channel[];
  colors: Map<string, string>;
  cursorIndex: number | null;
}) {
  return (
    <Flex gap={3} flexWrap="wrap" px={2} pb={1}>
      {channels.map((ch) => {
        const v = cursorIndex != null ? ch.values[cursorIndex] : undefined;
        return (
          <Flex key={ch.id} align="center" gap={1.5}>
            <Box
              width="10px"
              height="2px"
              borderRadius="1px"
              bg={colors.get(ch.id) ?? "plot.1"}
              flexShrink={0}
            />
            <Mono fontSize="2xs" color="text.muted">
              {ch.name}
            </Mono>
            {cursorIndex != null && (
              <Mono fontSize="2xs" fontWeight="600" color="text.primary">
                {v != null && Number.isFinite(v) ? v.toPrecision(5) : "—"}
              </Mono>
            )}
          </Flex>
        );
      })}
    </Flex>
  );
}

/**
 * One chart per engineering unit, with range outliers broken out onto their own
 * axis (see `groupChannels`). All charts share a cursor and the zoom window, so
 * reading a transient across pressure, thrust, and temperature is one hover.
 */
export function ChartGrid({
  dataset,
  channels,
  window: win,
  onWindowChange,
  cursorIndex,
  onCursorIndex,
  colors,
  autoSplit,
  chartHeight,
  showEvents,
  showEventLabels = true,
}: ChartGridProps) {
  const groups = useMemo(
    () => groupChannels(channels, dataset.elapsed, win, autoSplit),
    [channels, dataset.elapsed, win, autoSplit],
  );

  const xIsIndex = dataset.epochMs === null;
  const events = showEvents ? dataset.events : undefined;

  if (channels.length === 0) {
    return (
      <Card>
        <Flex direction="column" align="center" justify="center" py={14} gap={2} color="text.muted">
          <Icon name="show_chart" size={30} />
          <Text fontSize="sm">No channels selected.</Text>
          <Text fontSize="xs">Pick one from the Channels panel to plot it.</Text>
        </Flex>
      </Card>
    );
  }

  return (
    <Grid templateColumns="repeat(auto-fit, minmax(520px, 1fr))" gap={3}>
      {groups.map((group) => (
        <Card
          key={group.key}
          flush
          title={
            <Flex align="center" gap={2}>
              <Text fontSize="sm" fontWeight="600">
                {group.unit === "unitless" ? "Unitless" : group.unit}
              </Text>
              <Mono fontSize="2xs" color="text.muted">
                {group.channels.length} ch
              </Mono>
            </Flex>
          }
          headerAction={
            group.splitReason && (
              <Box title={group.splitReason}>
                <Chip status="info">
                  <Icon name="call_split" size={12} /> split by range
                </Chip>
              </Box>
            )
          }
        >
          <Box px={2} pt={2}>
            <AnalysisChart
              xs={dataset.elapsed}
              series={group.channels.map((ch) => ({
                label: ch.name,
                values: ch.values,
                colorToken: colors.get(ch.id) ?? "plot.1",
              }))}
              unit={group.unit === "unitless" ? undefined : group.unit}
              height={chartHeight}
              syncKey="nova-analysis"
              window={win}
              onWindowChange={onWindowChange}
              xIsIndex={xIsIndex}
              onCursorIndex={onCursorIndex}
              events={events}
              showEventLabels={showEventLabels}
            />
          </Box>
          <Legend channels={group.channels} colors={colors} cursorIndex={cursorIndex} />
          {group.splitReason && (
            <Text fontSize="2xs" color="text.muted" px={3} pb={2} lineHeight="1.4">
              {group.splitReason}
            </Text>
          )}
        </Card>
      ))}
    </Grid>
  );
}

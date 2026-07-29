"use client";

import { useMemo } from "react";
import { Box, Flex, Table, Text } from "@chakra-ui/react";
import { Card, Mono } from "@/components/primitives";
import { channelStats } from "@/lib/analysis";
import type { Channel, Dataset, TimeWindow } from "@/lib/analysis";

/**
 * Format a measurement with a precision that suits its magnitude. Returns the
 * explicit em-dash for absent data — a control surface must never show a
 * fabricated 0 where there was no reading.
 */
function fmt(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a !== 0 && (a < 1e-3 || a >= 1e6)) return v.toExponential(2);
  if (a >= 100) return v.toFixed(1);
  if (a >= 1) return v.toFixed(2);
  return v.toFixed(4);
}

export interface StatsTableProps {
  dataset: Dataset;
  channels: Channel[];
  window: TimeWindow | null;
  /** Sample index under the chart cursor, or null. */
  cursorIndex: number | null;
  colors: Map<string, string>;
}

const HEAD = ["Channel", "Unit", "Rate", "Min", "Max", "Mean"] as const;

/** Rates span 1 Hz thermocouples to kHz DAQ channels, so scale the precision. */
function fmtRate(hz: number | null): string {
  if (hz == null || !Number.isFinite(hz)) return "—";
  if (hz >= 1000) return `${(hz / 1000).toFixed(1)}k`;
  if (hz >= 100) return hz.toFixed(0);
  if (hz >= 10) return hz.toFixed(1);
  return hz.toFixed(2);
}

/**
 * Per-channel statistics over the current window, plus the value under the
 * shared chart cursor.
 */
export function StatsTable({
  dataset,
  channels,
  window: win,
  cursorIndex,
  colors,
}: StatsTableProps) {
  const rows = useMemo(
    () =>
      channels.map((ch) => ({
        channel: ch,
        stats: channelStats(ch, dataset.elapsed, win),
      })),
    [channels, dataset.elapsed, win],
  );

  const cursorTime =
    cursorIndex != null && cursorIndex >= 0 && cursorIndex < dataset.elapsed.length
      ? dataset.elapsed[cursorIndex]
      : null;

  return (
    <Card
      title="Statistics"
      flush
      headerAction={
        <Flex align="center" gap={3}>
          {cursorTime != null && (
            <Mono fontSize="sm" color="accent.solid">
              t = {cursorTime.toFixed(3)}s
            </Mono>
          )}
          <Mono fontSize="xs" color="text.muted">
            {win ? `${win.start.toFixed(2)}–${win.end.toFixed(2)}s` : "full capture"}
          </Mono>
        </Flex>
      }
    >
      {channels.length === 0 ? (
        <Box p={4}>
          <Text fontSize="sm" color="text.muted">
            Select at least one channel to see statistics.
          </Text>
        </Box>
      ) : (
        <Box overflowX="auto">
          <Table.Root size="md">
            <Table.Header>
              <Table.Row bg="bg.surfaceRaised">
                {HEAD.map((h) => (
                  <Table.ColumnHeader
                    key={h}
                    fontSize="xs"
                    color="text.muted"
                    letterSpacing="0.06em"
                    textAlign={h === "Channel" || h === "Unit" ? "left" : "right"}
                    whiteSpace="nowrap"
                    borderColor="border.default"
                  >
                    {h}
                  </Table.ColumnHeader>
                ))}
                {cursorIndex != null && (
                  <Table.ColumnHeader
                    fontSize="xs"
                    color="accent.solid"
                    letterSpacing="0.06em"
                    textAlign="right"
                    whiteSpace="nowrap"
                    borderColor="border.default"
                  >
                    @ CURSOR
                  </Table.ColumnHeader>
                )}
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {rows.map(({ channel, stats }) => (
                <Table.Row key={channel.id} _hover={{ bg: "bg.surfaceRaised" }}>
                  <Table.Cell borderColor="border.default">
                    <Flex align="center" gap={2}>
                      <Box
                        flexShrink={0}
                        width="8px"
                        height="8px"
                        borderRadius="2px"
                        bg={colors.get(channel.id) ?? "plot.1"}
                      />
                      <Mono fontSize="sm" color="text.primary" whiteSpace="nowrap">
                        {channel.name}
                      </Mono>
                    </Flex>
                  </Table.Cell>
                  <Table.Cell borderColor="border.default">
                    <Mono fontSize="xs" color="text.muted">
                      {channel.unit || "—"}
                    </Mono>
                  </Table.Cell>
                  {/* A channel merged from a slower log has one row per primary
                      sample but only its own source's resolution, so this can
                      differ between rows of the same capture. */}
                  <Table.Cell textAlign="right" borderColor="border.default">
                    <Flex align="baseline" justify="flex-end" gap={1}>
                      <Mono
                        fontSize="sm"
                        color={channel.sampleRateHz == null ? "text.muted" : "text.primary"}
                      >
                        {fmtRate(channel.sampleRateHz)}
                      </Mono>
                      {channel.sampleRateHz != null && (
                        <Mono fontSize="2xs" color="text.muted">
                          Hz
                        </Mono>
                      )}
                    </Flex>
                  </Table.Cell>
                  {(
                    [
                      //stats.count,
                      stats.min,
                      stats.max,
                      stats.mean,
                      //stats.stdev,
                      //stats.delta,
                      //stats.integral,
                    ] as Array<number | null>
                  ).map((v, i) => (
                    <Table.Cell key={i} textAlign="right" borderColor="border.default">
                      <Mono fontSize="sm" color={v == null ? "text.muted" : "text.primary"}>
                        {fmt(v)}
                      </Mono>
                    </Table.Cell>
                  ))}
                  {cursorIndex != null && (
                    <Table.Cell textAlign="right" borderColor="border.default">
                      <Mono fontSize="sm" fontWeight="600" color="accent.solid">
                        {fmt(channel.values[cursorIndex])}
                      </Mono>
                    </Table.Cell>
                  )}
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Box>
      )}
    </Card>
  );
}

"use client";

import { useMemo, useState } from "react";
import { Box, Flex, Table, Text } from "@chakra-ui/react";
import { Card, Chip, Icon, Mono } from "@/components/primitives";
import { MiniButton } from "./controls";
import type { ActuationEvent, ActuationKind, TimeWindow } from "@/lib/analysis";

/** Zoom padding, in seconds, applied either side of a clicked event. */
const SEEK_PAD_S = 2;

const KIND_LABEL: Record<ActuationKind, string> = {
  servo: "servo",
  relay: "relay",
  gpio: "gpio",
  recording: "log",
};

/** Green for opening/energising, muted for closing, blue for log markers. */
function toneOf(event: ActuationEvent): "nominal" | "neutral" | "info" {
  if (event.kind === "recording") return "info";
  const s = event.state.toLowerCase();
  if (s.includes("open") || /(^|\s|·\s)on\b/.test(s) || s === "high") return "nominal";
  return "neutral";
}

export interface EventsCardProps {
  events: ActuationEvent[];
  window: TimeWindow | null;
  onSeek: (window: TimeWindow | null) => void;
  showMarkers: boolean;
  onToggleMarkers: (next: boolean) => void;
  /** True when an actuator log is loaded but can't be placed on the timeline. */
  unplaceable: boolean;
}

/**
 * Actuation timeline recovered from the `*_actuators.csv` log.
 *
 * Rows are the commands themselves — which valve, which way, and when relative
 * to the capture — so a pressure transient can be tied to the thing that caused
 * it. Clicking an event zooms every chart to a few seconds around it.
 */
export function EventsCard({
  events,
  window: win,
  onSeek,
  showMarkers,
  onToggleMarkers,
  unplaceable,
}: EventsCardProps) {
  const [onlyInWindow, setOnlyInWindow] = useState(false);
  const [hideUnmapped, setHideUnmapped] = useState(false);

  const rows = useMemo(() => {
    let list = events.filter((e) => !e.outsideCapture);
    if (onlyInWindow && win) {
      list = list.filter((e) => e.elapsed >= win.start && e.elapsed <= win.end);
    }
    if (hideUnmapped) {
      list = list.filter((e) => e.actuator != null || e.kind === "recording");
    }
    return list;
  }, [events, onlyInWindow, win, hideUnmapped]);

  const outsideCount = events.filter((e) => e.outsideCapture).length;
  const unmappedCount = events.filter(
    (e) => e.actuator == null && e.kind !== "recording",
  ).length;

  if (unplaceable) {
    return (
      <Card title="Actuation events">
        <Flex direction="column" gap={2}>
          <Chip status="warn">
            <Icon name="schedule" size={13} /> Cannot place events on this timeline
          </Chip>
          <Text fontSize="xs" color="text.muted" lineHeight="1.6">
            The actuator log is stamped with wall-clock time, but the loaded sensor
            capture has no usable wall clock to line it up against. Load a sensor CSV
            with an epoch <Mono fontSize="xs">timestamp</Mono> column to place them.
          </Text>
        </Flex>
      </Card>
    );
  }

  return (
    <Card
      title="Actuation events"
      flush
      headerAction={
        <Flex align="center" gap={1.5} flexWrap="wrap">
          <MiniButton active={showMarkers} onClick={() => onToggleMarkers(!showMarkers)}>
            markers
          </MiniButton>
          <MiniButton
            active={onlyInWindow}
            disabled={!win}
            onClick={() => setOnlyInWindow((v) => !v)}
          >
            in window
          </MiniButton>
          {unmappedCount > 0 && (
            <MiniButton
              active={hideUnmapped}
              onClick={() => setHideUnmapped((v) => !v)}
              title={`${unmappedCount} channel change(s) no configured actuator claims`}
            >
              hide unmapped
            </MiniButton>
          )}
          <Mono fontSize="2xs" color="text.muted">
            {rows.length}
          </Mono>
        </Flex>
      }
    >
      {rows.length === 0 ? (
        <Box p={4}>
          <Text fontSize="xs" color="text.muted">
            {events.length === 0
              ? "No actuator log loaded. Drop a *_actuators.csv to see commands on the charts."
              : "No events match the current filters."}
          </Text>
        </Box>
      ) : (
        <Box maxH="360px" overflowY="auto">
          <Table.Root size="sm">
            <Table.Header>
              <Table.Row bg="bg.surfaceRaised">
                {["Time", "Actuator", "Channel", "Change", "Kind"].map((h) => (
                  <Table.ColumnHeader
                    key={h}
                    fontSize="2xs"
                    color="text.muted"
                    letterSpacing="0.06em"
                    whiteSpace="nowrap"
                    borderColor="border.default"
                    textAlign={h === "Time" ? "right" : "left"}
                  >
                    {h}
                  </Table.ColumnHeader>
                ))}
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {rows.map((e) => (
                <Table.Row
                  key={e.id}
                  cursor="pointer"
                  _hover={{ bg: "bg.surfaceRaised" }}
                  onClick={() =>
                    onSeek({
                      start: e.elapsed - SEEK_PAD_S,
                      end: e.elapsed + SEEK_PAD_S,
                    })
                  }
                  title="Zoom every chart to this event"
                >
                  <Table.Cell textAlign="right" borderColor="border.default">
                    <Mono fontSize="xs" color="text.primary" whiteSpace="nowrap">
                      {e.elapsed.toFixed(3)}s
                    </Mono>
                  </Table.Cell>
                  <Table.Cell borderColor="border.default">
                    {e.actuator ? (
                      <Mono fontSize="xs" color="text.primary" whiteSpace="nowrap">
                        {e.actuator}
                      </Mono>
                    ) : (
                      <Mono fontSize="xs" color="text.muted">
                        —
                      </Mono>
                    )}
                  </Table.Cell>
                  <Table.Cell borderColor="border.default">
                    <Mono fontSize="2xs" color="text.muted" whiteSpace="nowrap">
                      {e.channel}
                    </Mono>
                  </Table.Cell>
                  <Table.Cell borderColor="border.default">
                    <Flex align="center" gap={1.5} whiteSpace="nowrap">
                      {e.previousState && (
                        <>
                          <Mono fontSize="2xs" color="text.muted">
                            {e.previousState}
                          </Mono>
                          <Icon
                            name="arrow_forward"
                            size={11}
                            color="var(--chakra-colors-text-muted)"
                          />
                        </>
                      )}
                      <Chip status={toneOf(e)}>{e.state}</Chip>
                    </Flex>
                  </Table.Cell>
                  <Table.Cell borderColor="border.default">
                    <Mono fontSize="2xs" color="text.muted">
                      {KIND_LABEL[e.kind]}
                    </Mono>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Box>
      )}

      {outsideCount > 0 && (
        <Box px={4} py={2} borderTop="1px solid" borderColor="border.default">
          <Text fontSize="2xs" color="text.muted">
            {outsideCount} event{outsideCount === 1 ? "" : "s"} fall outside the loaded
            capture&apos;s time span and are not shown.
          </Text>
        </Box>
      )}
    </Card>
  );
}

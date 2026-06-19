"use client";

import { useMemo } from "react";
import { Box, Table, Text } from "@chakra-ui/react";
import { Card, Chip, Mono } from "@/components/primitives";
import { useNovaStore, sel } from "@/lib/store";
import type { FlightEvent } from "@/lib/flight/types";

/** Render the non-name/timestamp fields of an event as a compact detail string. */
function details(event: FlightEvent): string {
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(event)) {
    if (k === "name" || k === "timestamp") continue;
    rest[k] = v;
  }
  const keys = Object.keys(rest);
  return keys.length ? JSON.stringify(rest) : "—";
}

export function EventsLog() {
  const flightEvents = useNovaStore(sel.flightEvents);
  const status = useNovaStore(sel.flightEventsStatus);

  const events = flightEvents?.events ?? [];
  // Newest first.
  const ordered = useMemo(() => [...events].reverse(), [events]);

  return (
    <Card
      title="Flight Events"
      flush
      headerAction={
        <Chip status={status === "live" ? "nominal" : status === "stale" ? "warn" : "neutral"}>
          {status}
        </Chip>
      }
    >
      <Box maxH="600px" overflowY="auto">
        {ordered.length === 0 ? (
          <Box px={4} py={6} color="text.muted" fontSize="sm">
            No flight events received.
          </Box>
        ) : (
          <Table.Root size="sm">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeader>Time</Table.ColumnHeader>
                <Table.ColumnHeader>Event</Table.ColumnHeader>
                <Table.ColumnHeader>Details</Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {ordered.map((e, i) => (
                <Table.Row key={`${e.name}-${e.timestamp ?? i}`}>
                  <Table.Cell>
                    <Mono fontSize="xs" color="text.muted">
                      {e.timestamp != null ? String(e.timestamp) : "—"}
                    </Mono>
                  </Table.Cell>
                  <Table.Cell>
                    <Mono fontSize="xs" color="text.primary">{e.name}</Mono>
                  </Table.Cell>
                  <Table.Cell>
                    <Text fontFamily="mono" fontSize="xs" color="text.muted" wordBreak="break-word">
                      {details(e)}
                    </Text>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        )}
      </Box>
    </Card>
  );
}

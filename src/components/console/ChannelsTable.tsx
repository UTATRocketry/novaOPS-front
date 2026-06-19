"use client";

import { useCallback } from "react";
import { Box, Flex, Table, Text } from "@chakra-ui/react";
import { Card, Chip, Mono, StatusDot } from "@/components/primitives";
import type { Status } from "@/components/primitives";
import { useNovaStore, sel } from "@/lib/store";
import { useActuators, useConfig, useSensors } from "@/hooks/useConfig";
import type { ActuatorEntry, ActuatorState, PacketEntry, SensorEntry } from "@/lib/types";
import type { FasBoard } from "@/lib/flight/types";

// ---------------------------------------------------------------------------
// Liveness → status colour. Present + live = nominal; present + stale = warn;
// absent or no stream = neutral (never a fabricated value).
// ---------------------------------------------------------------------------

function liveness(present: boolean, streamStatus: string): Status {
  if (!present) return "neutral";
  if (streamStatus === "live") return "nominal";
  if (streamStatus === "stale") return "warn";
  return "neutral";
}

const STATUS_LABEL: Record<Status, string> = {
  nominal: "live",
  warn: "stale",
  error: "error",
  fault: "fault",
  info: "info",
  neutral: "—",
};

// ---------------------------------------------------------------------------
// Sensor row — narrow per-sensor subscription.
// ---------------------------------------------------------------------------

function SensorRow({ sensor }: { sensor: SensorEntry }) {
  const value = useNovaStore(useCallback(sel.engineValue(sensor.name), [sensor.name]));
  const streamStatus = useNovaStore(sel.engineDataStatus);
  const present = value?.value != null;
  const status = liveness(present, streamStatus);

  return (
    <Table.Row>
      <Table.Cell><Mono fontSize="xs">{sensor.name}</Mono></Table.Cell>
      <Table.Cell><Chip status="neutral">{sensor.type}</Chip></Table.Cell>
      <Table.Cell><Mono fontSize="xs" color="text.muted">RX</Mono></Table.Cell>
      <Table.Cell>
        <Mono fontSize="xs" color={present ? "text.primary" : "text.muted"}>
          {present ? `${value!.value} ${value!.unit ?? sensor.unit ?? ""}`.trim() : "—"}
        </Mono>
      </Table.Cell>
      <Table.Cell>
        <Flex align="center" gap={2}>
          <StatusDot status={status} size={8} glow={status !== "neutral"} />
          <Text fontSize="xs" color="text.muted">{STATUS_LABEL[status]}</Text>
        </Flex>
      </Table.Cell>
    </Table.Row>
  );
}

// ---------------------------------------------------------------------------
// Actuator row — narrow per-actuator subscription.
// ---------------------------------------------------------------------------

function summariseState(s: ActuatorState | null): string {
  if (!s) return "—";
  const parts = [s.position, s.enable, s.power, s.arming, s.state].filter(Boolean);
  return parts.length ? parts.join(" · ") : "—";
}

function ActuatorRow({ entry }: { entry: ActuatorEntry }) {
  const state = useNovaStore(sel.actuatorState(entry.name));
  const streamStatus = useNovaStore(sel.actuatorStatesStatus);
  const present = state != null;
  const status = liveness(present, streamStatus);

  return (
    <Table.Row>
      <Table.Cell><Mono fontSize="xs">{entry.name}</Mono></Table.Cell>
      <Table.Cell><Chip status="neutral">{entry.type}</Chip></Table.Cell>
      <Table.Cell><Mono fontSize="xs" color="text.muted">TX/RX</Mono></Table.Cell>
      <Table.Cell>
        <Mono fontSize="xs" color={present ? "text.primary" : "text.muted"}>
          {summariseState(state)}
        </Mono>
      </Table.Cell>
      <Table.Cell>
        <Flex align="center" gap={2}>
          <StatusDot status={status} size={8} glow={status !== "neutral"} />
          <Text fontSize="xs" color="text.muted">{STATUS_LABEL[status]}</Text>
        </Flex>
      </Table.Cell>
    </Table.Row>
  );
}

// ---------------------------------------------------------------------------
// Devices — FAS board fleet from the flight_data adapter.
// ---------------------------------------------------------------------------

function uptime(ms?: number): string {
  if (ms == null) return "—";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(h)}:${p(m)}:${p(sec)}`;
}

function DevicesCard() {
  const flightData = useNovaStore(sel.flightData);
  const flightStatus = useNovaStore(sel.flightDataStatus);
  const boards: FasBoard[] = flightData?.boards ?? [];

  return (
    <Card title={`Devices (${boards.length})`} flush>
      {boards.length === 0 ? (
        <Box px={4} py={3} color="text.muted" fontSize="sm">
          No FAS boards reported.
        </Box>
      ) : (
        <Table.Root size="sm">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>Board</Table.ColumnHeader>
              <Table.ColumnHeader>FW</Table.ColumnHeader>
              <Table.ColumnHeader>Ch</Table.ColumnHeader>
              <Table.ColumnHeader>Sensors</Table.ColumnHeader>
              <Table.ColumnHeader>Uptime</Table.ColumnHeader>
              <Table.ColumnHeader>Status</Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {boards.map((b) => {
              // Online only counts when the stream itself is live; a stale stream
              // means we cannot trust the last-known online flag.
              const isOnline = b.online && flightStatus === "live";
              const status: Status = isOnline ? "nominal" : b.online ? "warn" : "neutral";
              return (
                <Table.Row key={b.key}>
                  <Table.Cell>
                    <Flex align="center" gap={2}>
                      <Mono fontSize="xs">{b.key}</Mono>
                      <Chip status="neutral">{b.kind}</Chip>
                    </Flex>
                  </Table.Cell>
                  <Table.Cell><Mono fontSize="xs" color="text.muted">{b.fwVersion ?? "—"}</Mono></Table.Cell>
                  <Table.Cell><Mono fontSize="xs" color="text.muted">{b.numChannels ?? "—"}</Mono></Table.Cell>
                  <Table.Cell><Mono fontSize="xs" color="text.muted">{b.numSensors ?? "—"}</Mono></Table.Cell>
                  <Table.Cell><Mono fontSize="xs" color="text.muted">{uptime(b.uptimeMs)}</Mono></Table.Cell>
                  <Table.Cell>
                    <Flex align="center" gap={2}>
                      <StatusDot status={status} size={8} glow={status !== "neutral"} />
                      <Text fontSize="xs" color="text.muted">
                        {isOnline ? "online" : b.online ? "stale" : "offline"}
                      </Text>
                    </Flex>
                  </Table.Cell>
                </Table.Row>
              );
            })}
          </Table.Body>
        </Table.Root>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// ChannelsTable
// ---------------------------------------------------------------------------

function PacketsCard() {
  const { data: config } = useConfig();
  const packets: PacketEntry[] = config?.Packets ?? [];

  return (
    <Card title={`Packets (${packets.length})`} flush>
      {packets.length === 0 ? (
        <Box px={4} py={3} color="text.muted" fontSize="sm">
          No packets defined. Add a <Mono fontSize="xs">Packets</Mono> section in config (Config page).
        </Box>
      ) : (
        <Table.Root size="sm">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>Name</Table.ColumnHeader>
              <Table.ColumnHeader>Op</Table.ColumnHeader>
              <Table.ColumnHeader>Parameters</Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {packets.map((p, i) => (
              <Table.Row key={i}>
                <Table.Cell><Mono fontSize="xs">{p.name || "—"}</Mono></Table.Cell>
                <Table.Cell><Mono fontSize="xs" color="text.muted">{p.op || "—"}</Mono></Table.Cell>
                <Table.Cell><Mono fontSize="xs" color="text.muted">{p.fields.map((f) => f.key).join(", ") || "—"}</Mono></Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      )}
    </Card>
  );
}

export function ChannelsTable() {
  const { data: sensors } = useSensors();
  const { data: actuators } = useActuators();

  const sensorList: SensorEntry[] = sensors ?? [];
  const actuatorList: ActuatorEntry[] = actuators ?? [];

  return (
    <Flex direction="column" gap={4}>
      <DevicesCard />
      <Card title={`Sensors (${sensorList.length})`} flush>
        {sensorList.length === 0 ? (
          <Box px={4} py={3} color="text.muted" fontSize="sm">No sensors in config.</Box>
        ) : (
          <Table.Root size="sm">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeader>Channel</Table.ColumnHeader>
                <Table.ColumnHeader>Type</Table.ColumnHeader>
                <Table.ColumnHeader>Dir</Table.ColumnHeader>
                <Table.ColumnHeader>Last Value</Table.ColumnHeader>
                <Table.ColumnHeader>Status</Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {sensorList.map((s) => <SensorRow key={s.name} sensor={s} />)}
            </Table.Body>
          </Table.Root>
        )}
      </Card>

      <Card title={`Actuators (${actuatorList.length})`} flush>
        {actuatorList.length === 0 ? (
          <Box px={4} py={3} color="text.muted" fontSize="sm">No actuators in config.</Box>
        ) : (
          <Table.Root size="sm">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeader>Channel</Table.ColumnHeader>
                <Table.ColumnHeader>Type</Table.ColumnHeader>
                <Table.ColumnHeader>Dir</Table.ColumnHeader>
                <Table.ColumnHeader>State</Table.ColumnHeader>
                <Table.ColumnHeader>Status</Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {actuatorList.map((a) => <ActuatorRow key={a.name} entry={a} />)}
            </Table.Body>
          </Table.Root>
        )}
      </Card>

      <PacketsCard />
    </Flex>
  );
}

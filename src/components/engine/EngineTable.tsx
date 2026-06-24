"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Box, Flex, Table, Tooltip } from "@chakra-ui/react";
import { useNovaStore } from "@/lib/store/store";
import { sel } from "@/lib/store/selectors";
import { sendCommand } from "@/lib/api/commands";
import { useCommandGate } from "@/hooks/useCommandGate";
import { Card, Chip, Mono, StatusDot } from "@/components/primitives";
import type { SensorEntry, ActuatorEntry, ActuatorState } from "@/lib/types";
import {
  deriveControls,
  activeOption,
  computeButtons,
  segmentFaceColours,
} from "@/lib/pid/actuatorControls";
import type { ControlButton, SegmentKind } from "@/lib/pid/actuatorControls";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface EngineTableProps {
  sensors: SensorEntry[];
  actuators: ActuatorEntry[];
}

// ---------------------------------------------------------------------------
// Optimistic-state helper
// ---------------------------------------------------------------------------

// Fix 1: return null when base is null — never fabricate a confident state
// from nothing. A null base means the backend has never reported this actuator;
// overlaying commands onto it would show OPEN/CLOSED when state is truly unknown.
function applyOptimistic(
  state: ActuatorState | null,
  optimistic: Record<string, string>,
): ActuatorState | null {
  if (state === null) return null;
  if (Object.keys(optimistic).length === 0) return state;
  const s: ActuatorState = { ...state };
  for (const [kind, cmd] of Object.entries(optimistic)) {
    if (kind === "position") s.position = cmd;
    else if (kind === "enable") s.enable = cmd;
    else if (kind === "power") s.power = cmd;
    else if (kind === "arming") s.arming = cmd;
  }
  return s;
}

// ---------------------------------------------------------------------------
// Optimistic expiry — how long before an unconfirmed override is auto-cleared.
// ---------------------------------------------------------------------------

const OPTIMISTIC_TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// TableControlButton
// ---------------------------------------------------------------------------

interface TableControlButtonProps {
  entry: ActuatorEntry;
  button: ControlButton;
  pending: boolean;
  onFire: (button: ControlButton) => void;
}

function TableControlButton({ entry, button, pending, onFire }: TableControlButtonProps) {
  const gate = useCommandGate({ name: entry.name, state: button.command });
  const [bg, text, stroke] = segmentFaceColours(button.color);

  const el = (
    <Box
      as="button"
      onClick={gate.canSend ? () => onFire(button) : undefined}
      aria-disabled={!gate.canSend}
      px={2}
      py={1}
      minW="58px"
      textAlign="center"
      fontSize="2xs"
      fontFamily="mono"
      fontWeight="700"
      borderRadius="control"
      border="1px solid"
      style={{ backgroundColor: bg, color: text, borderColor: stroke }}
      cursor={gate.canSend ? "pointer" : "not-allowed"}
      opacity={!gate.canSend ? 0.4 : pending ? 0.65 : 1}
      transition="all 0.12s"
      _hover={gate.canSend ? { filter: "brightness(1.25)" } : {}}
    >
      {button.label}
    </Box>
  );

  if (!gate.canSend && gate.reason) {
    return (
      <Tooltip.Root>
        <Tooltip.Trigger asChild>{el}</Tooltip.Trigger>
        <Tooltip.Content>{gate.reason}</Tooltip.Content>
      </Tooltip.Root>
    );
  }
  return el;
}

// ---------------------------------------------------------------------------
// ActuatorControlRow
// ---------------------------------------------------------------------------

interface ActuatorControlRowProps {
  entry: ActuatorEntry;
  actuatorState: ActuatorState | null;
  optimistic: Record<string, string>;
  onFire: (button: ControlButton) => void;
}

function ActuatorControlRow({ entry, actuatorState, optimistic, onFire }: ActuatorControlRowProps) {
  const effective = applyOptimistic(actuatorState, optimistic);
  const buttons = computeButtons(entry, effective);
  return (
    <Flex gap={1.5} flexWrap="wrap">
      {buttons.map((b, i) => (
        <TableControlButton
          key={`${b.kind}-${b.command}-${i}`}
          entry={entry}
          button={b}
          pending={!!optimistic[b.kind]}
          onFire={onFire}
        />
      ))}
    </Flex>
  );
}

// ---------------------------------------------------------------------------
// ActuatorRow — optimistic updates with expiry + session flush
// ---------------------------------------------------------------------------

interface ActuatorRowProps {
  entry: ActuatorEntry;
}

function ActuatorRow({ entry }: ActuatorRowProps) {
  const actuatorState = useNovaStore(sel.actuatorState(entry.name));
  const clientId      = useNovaStore(sel.clientId);

  // Optimistic override: { segmentKind → command string }
  const [optimistic, setOptimistic] = useState<Record<string, string>>({});
  // Per-kind expiry timers — cleared on reconcile or error.
  const timeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Fix 3: flush all optimistic overrides on session change (new clientId = reconnect).
  // A new session means a fresh snapshot is incoming; any pending optimistic from the
  // old session must not contaminate the new confirmed state.
  useEffect(() => {
    for (const id of Object.values(timeoutsRef.current)) clearTimeout(id);
    timeoutsRef.current = {};
    setOptimistic((prev) => (Object.keys(prev).length === 0 ? prev : {}));
  }, [clientId]);

  // Fix 1 + 2: reconciliation. When WS confirms, clear matching overrides and their
  // timers. When actuatorState is null (never reported / cleared by snapshot), drop
  // all overrides — nothing to display, and applyOptimistic already returns null.
  useEffect(() => {
    if (!actuatorState) {
      // State gone: clear everything so there's no leak on reconnect.
      setOptimistic((prev) => {
        if (Object.keys(prev).length === 0) return prev;
        for (const id of Object.values(timeoutsRef.current)) clearTimeout(id);
        timeoutsRef.current = {};
        return {};
      });
      return;
    }
    setOptimistic((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      const segs = deriveControls(entry);
      const next = { ...prev };
      let changed = false;
      for (const kind of Object.keys(prev) as SegmentKind[]) {
        const seg = segs.find((s) => s.kind === kind);
        const wsActive = seg ? activeOption(seg, actuatorState) : null;
        if (!seg || (wsActive && wsActive.command === prev[kind])) {
          clearTimeout(timeoutsRef.current[kind]);
          delete timeoutsRef.current[kind];
          delete next[kind];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [actuatorState, entry]);

  // Cleanup all timers on unmount.
  useEffect(() => {
    return () => {
      for (const id of Object.values(timeoutsRef.current)) clearTimeout(id);
    };
  }, []);

  // Fix 2: schedule an expiry timer for an optimistic key. If the WS has not
  // confirmed within OPTIMISTIC_TIMEOUT_MS, drop the override so stale optimistic
  // values don't persist forever after a dropped socket.
  function scheduleExpiry(kind: string) {
    clearTimeout(timeoutsRef.current[kind]);
    timeoutsRef.current[kind] = setTimeout(() => {
      delete timeoutsRef.current[kind];
      setOptimistic((prev) => {
        if (!(kind in prev)) return prev;
        const next = { ...prev };
        delete next[kind];
        return next;
      });
    }, OPTIMISTIC_TIMEOUT_MS);
  }

  async function fireButton(button: ControlButton) {
    setOptimistic((prev) => ({ ...prev, [button.kind]: button.command }));
    scheduleExpiry(button.kind);
    try {
      await sendCommand(
        { type: entry.type, name: entry.name, state: button.command },
        clientId ?? "",
      );
    } catch (err) {
      console.error("[EngineTable] command error:", err);
      clearTimeout(timeoutsRef.current[button.kind]);
      delete timeoutsRef.current[button.kind];
      setOptimistic((prev) => {
        const next = { ...prev };
        delete next[button.kind];
        return next;
      });
    }
  }

  return (
    <Table.Row transition="background-color 0.12s" _hover={{ bg: "bg.surfaceRaised" }}>
      <Table.Cell><Mono fontSize="xs">{entry.name}</Mono></Table.Cell>
      <Table.Cell><Chip status="neutral">{entry.type}</Chip></Table.Cell>
      <Table.Cell>
        <ActuatorControlRow
          entry={entry}
          actuatorState={actuatorState}
          optimistic={optimistic}
          onFire={fireButton}
        />
      </Table.Cell>
    </Table.Row>
  );
}

// ---------------------------------------------------------------------------
// InstrumentRow — Fix 4: narrow per-sensor selector, not the full map.
// Each row subscribes only to its own sensor; re-renders only when that sensor
// value changes, not on every engine_data message for all sensors.
// ---------------------------------------------------------------------------

interface InstrumentRowProps {
  sensor: SensorEntry;
  isStale: boolean;
}

function InstrumentRow({ sensor, isStale }: InstrumentRowProps) {
  const entry = useNovaStore(
    useCallback(sel.engineValue(sensor.name), [sensor.name]),
  );
  const hasValue = entry?.value != null;
  const displayValue = hasValue ? String(entry!.value) : "—";
  const unit = entry?.unit ?? sensor.unit ?? "";

  return (
    <Table.Row
      opacity={isStale ? 0.55 : 1}
      transition="opacity 0.3s, background-color 0.12s"
      _hover={{ bg: "bg.surfaceRaised" }}
    >
      <Table.Cell>
        <Mono fontSize="xs">{sensor.name}</Mono>
      </Table.Cell>
      <Table.Cell>
        <Chip status="neutral">{sensor.type}</Chip>
      </Table.Cell>
      <Table.Cell>
        <Mono fontSize="xs" color={hasValue ? "text.primary" : "text.muted"}>
          {displayValue}
        </Mono>
      </Table.Cell>
      <Table.Cell>
        <Mono fontSize="xs" color="text.muted">
          {unit || "—"}
        </Mono>
      </Table.Cell>
      <Table.Cell>
        <StatusDot
          status={!hasValue ? "neutral" : isStale ? "warn" : "nominal"}
          size={8}
          glow={hasValue && !isStale}
        />
      </Table.Cell>
    </Table.Row>
  );
}

// ---------------------------------------------------------------------------
// Main component — Fix 4: no longer subscribes to the full engineData map.
// Only engineDataStatus is needed here (re-renders only on status transitions).
// ---------------------------------------------------------------------------

export function EngineTable({ sensors, actuators }: EngineTableProps) {
  const engineStatus = useNovaStore(sel.engineDataStatus);
  // Anything that isn't actively "live" (stale, disconnected, connecting, error)
  // must read as not-current — otherwise a backend drop leaves the last values
  // looking live. Mirrors the Console Channels liveness treatment.
  const isStale = engineStatus !== "live";

  return (
    <Flex gap={4} align="flex-start" flexWrap="wrap">
      {/* ── Instruments card ── */}
      <Box flex="1" minW="280px">
        <Card title="Instruments" flush>
          {sensors.length === 0 ? (
            <Box px={4} py={3} color="text.muted" fontSize="sm">
              No sensors in config.
            </Box>
          ) : (
            <Table.Root size="sm">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeader>Tag</Table.ColumnHeader>
                  <Table.ColumnHeader>Type</Table.ColumnHeader>
                  <Table.ColumnHeader>Value</Table.ColumnHeader>
                  <Table.ColumnHeader>Unit</Table.ColumnHeader>
                  <Table.ColumnHeader>Status</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {sensors.map((sensor) => (
                  <InstrumentRow key={sensor.name} sensor={sensor} isStale={isStale} />
                ))}
              </Table.Body>
            </Table.Root>
          )}
        </Card>
      </Box>

      {/* ── Actuators card ── */}
      <Box flex="1" minW="280px">
        <Card title="Actuators" flush>
          {actuators.length === 0 ? (
            <Box px={4} py={3} color="text.muted" fontSize="sm">
              No actuators in config.
            </Box>
          ) : (
            <Table.Root size="sm">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeader>Tag</Table.ColumnHeader>
                  <Table.ColumnHeader>Type</Table.ColumnHeader>
                  <Table.ColumnHeader>State</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {actuators.map((actuator) => (
                  <ActuatorRow key={actuator.name} entry={actuator} />
                ))}
              </Table.Body>
            </Table.Root>
          )}
        </Card>
      </Box>
    </Flex>
  );
}

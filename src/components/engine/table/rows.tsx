"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Box, Flex, Table, Tooltip } from "@chakra-ui/react";
import { useNovaStore } from "@/lib/store/store";
import { sel } from "@/lib/store/selectors";
import { sendCommand } from "@/lib/api/commands";
import { useCommandGate } from "@/hooks/useCommandGate";
import { Mono, StatusDot } from "@/components/primitives";
import type { SensorEntry, ActuatorEntry, ActuatorState } from "@/lib/types";
import {
  deriveControls,
  activeOption,
  computeButtons,
  segmentFaceColours,
} from "@/lib/pid/actuatorControls";
import type { ControlButton, SegmentKind } from "@/lib/pid/actuatorControls";
import { EditableRow } from "./EditableRow";

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
  /** Edit mode: the table is being rearranged, so commanding is inert. */
  inert: boolean;
  onFire: (button: ControlButton) => void;
}

function TableControlButton({ entry, button, pending, inert, onFire }: TableControlButtonProps) {
  const gate = useCommandGate({ name: entry.name, state: button.command });
  const [bg, text, stroke] = segmentFaceColours(button.color);
  const canSend = gate.canSend && !inert;

  const el = (
    <Box
      as="button"
      onClick={canSend ? () => onFire(button) : undefined}
      aria-disabled={!canSend}
      px={2}
      py={0.25}
      minW="58px"
      textAlign="center"
      fontSize="xs"
      fontFamily="mono"
      fontWeight="700"
      borderRadius="control"
      border="1px solid"
      style={{ backgroundColor: bg, color: text, borderColor: stroke }}
      cursor={canSend ? "pointer" : "not-allowed"}
      opacity={!canSend ? 0.4 : pending ? 0.65 : 1}
      transition="all 0.12s"
      _hover={canSend ? { filter: "brightness(1.25)" } : {}}
    >
      {button.label}
    </Box>
  );

  const reason = inert ? "Finish editing to send commands" : gate.reason;
  if (!canSend && reason) {
    return (
      <Tooltip.Root>
        <Tooltip.Trigger asChild>{el}</Tooltip.Trigger>
        <Tooltip.Content>{reason}</Tooltip.Content>
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
  inert: boolean;
  onFire: (button: ControlButton) => void;
}

function ActuatorControlRow({
  entry,
  actuatorState,
  optimistic,
  inert,
  onFire,
}: ActuatorControlRowProps) {
  const effective = applyOptimistic(actuatorState, optimistic);
  const buttons = computeButtons(entry, effective);
  return (
    <Flex gap={1.5} direction="row" flexWrap="wrap" align="center" justify="center">
      {buttons.map((b, i) => (
        <TableControlButton
          key={`${b.kind}-${b.command}-${i}`}
          entry={entry}
          button={b}
          pending={!!optimistic[b.kind]}
          inert={inert}
          onFire={onFire}
        />
      ))}
    </Flex>
  );
}

// ---------------------------------------------------------------------------
// ActuatorRow — optimistic updates with expiry + session flush
// ---------------------------------------------------------------------------

export interface ActuatorRowProps {
  entry: ActuatorEntry;
  editing: boolean;
  hidden: boolean;
  onToggleHidden: (name: string) => void;
}

export function ActuatorRow({ entry, editing, hidden, onToggleHidden }: ActuatorRowProps) {
  const liveState = useNovaStore(sel.actuatorState(entry.name));
  const clientId  = useNovaStore(sel.clientId);

  // Edit mode freezes the row: the displayed state is the snapshot taken when
  // editing began, so rows don't mutate under the cursor mid-drag.
  const frozenRef = useRef(liveState);
  if (!editing) frozenRef.current = liveState;
  const actuatorState = editing ? frozenRef.current : liveState;

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
  // timers. When liveState is null (never reported / cleared by snapshot), drop
  // all overrides — nothing to display, and applyOptimistic already returns null.
  // Reconciles against the *live* state, never the frozen snapshot, so a command
  // fired before entering edit mode still settles correctly.
  useEffect(() => {
    if (!liveState) {
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
        const wsActive = seg ? activeOption(seg, liveState) : null;
        if (!seg || (wsActive && wsActive.command === prev[kind])) {
          clearTimeout(timeoutsRef.current[kind]);
          delete timeoutsRef.current[kind];
          delete next[kind];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [liveState, entry]);

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
    if (editing) return;
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
    <EditableRow id={entry.name} editing={editing} hidden={hidden} onToggleHidden={onToggleHidden}>
      <Table.Cell textAlign="center">
        <Mono fontSize="md">{entry.name}</Mono>
      </Table.Cell>
      <Table.Cell textAlign="center">
        <ActuatorControlRow
          entry={entry}
          actuatorState={actuatorState}
          optimistic={optimistic}
          inert={editing}
          onFire={fireButton}
        />
      </Table.Cell>
    </EditableRow>
  );
}

// ---------------------------------------------------------------------------
// Numeric formatter for the running-average column — precision scales with
// magnitude so a mean never sprawls across the cell.
// ---------------------------------------------------------------------------

function fmtNum(v: number): string {
  const a = Math.abs(v);
  if (a >= 1000) return v.toFixed(0);
  if (a >= 100) return v.toFixed(1);
  return v.toFixed(2);
}

// ---------------------------------------------------------------------------
// SensorRow — Fix 4: narrow per-sensor selector, not the full map.
// Each row subscribes only to its own sensor; re-renders only when that sensor
// value changes, not on every engine_data message for all sensors.
// ---------------------------------------------------------------------------

export interface SensorRowProps {
  sensor: SensorEntry;
  isStale: boolean;
  editing: boolean;
  hidden: boolean;
  onToggleHidden: (name: string) => void;
}

export function SensorRow({ sensor, isStale, editing, hidden, onToggleHidden }: SensorRowProps) {
  const live = useNovaStore(useCallback(sel.engineValue(sensor.name), [sensor.name]));

  // Edit mode freezes the reading — see ActuatorRow.
  const frozenRef = useRef(live);
  if (!editing) frozenRef.current = live;
  const entry = editing ? frozenRef.current : live;

  const hasValue = entry?.value != null;
  const displayValue = hasValue ? String(entry!.value) : "—";
  const hasAvg = entry?.avg != null && Number.isFinite(entry.avg);
  const displayAvg = hasAvg ? fmtNum(entry!.avg) : "—";
  const unit = entry?.unit ?? sensor.unit ?? "";
  const fontSize = "md";
  const align = "center";

  return (
    <EditableRow id={sensor.name} editing={editing} hidden={hidden} onToggleHidden={onToggleHidden}>
      <Table.Cell textAlign={align}>
        <Mono fontSize={fontSize}>{sensor.name}</Mono>
      </Table.Cell>
      <Table.Cell textAlign={align}>
        <Mono fontSize={fontSize} color={hasValue ? "text.primary" : "text.muted"}>
          {displayValue}
        </Mono>
      </Table.Cell>
      <Table.Cell textAlign={align}>
        <Mono fontSize={fontSize} color={hasAvg ? "text.primary" : "text.muted"}>
          {displayAvg}
        </Mono>
      </Table.Cell>
      <Table.Cell textAlign={align}>
        <Mono fontSize={fontSize} color="text.muted">
          {unit || "—"}
        </Mono>
      </Table.Cell>
      <Table.Cell textAlign={align}>
        <StatusDot
          status={!hasValue ? "neutral" : isStale ? "warn" : "nominal"}
          size={8}
          glow={hasValue && !isStale}
        />
      </Table.Cell>
    </EditableRow>
  );
}

"use client";

import { useState } from "react";
import { Box, Flex, Table } from "@chakra-ui/react";
import { useNovaStore } from "@/lib/store/store";
import { sel } from "@/lib/store/selectors";
import type { SensorEntry, ActuatorEntry } from "@/lib/types";
import { TableSection } from "./table/TableSection";
import { SensorRow, ActuatorRow } from "./table/rows";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface EngineTableProps {
  sensors: SensorEntry[];
  actuators: ActuatorEntry[];
}

// Two independent layouts — sensors and actuators customise separately.
const SENSOR_LAYOUT_KEY = "nova.engine.table.sensors";
const ACTUATOR_LAYOUT_KEY = "nova.engine.table.actuators";

const TABLE_SIZE = "lg";

const SENSOR_HEADER = (
  <>
    <Table.ColumnHeader textAlign="center">Tag</Table.ColumnHeader>
    <Table.ColumnHeader textAlign="center">Value</Table.ColumnHeader>
    <Table.ColumnHeader textAlign="center">Avg</Table.ColumnHeader>
    <Table.ColumnHeader textAlign="center">Unit</Table.ColumnHeader>
    <Table.ColumnHeader textAlign="center">Status</Table.ColumnHeader>
  </>
);

const ACTUATOR_HEADER = (
  <>
    <Table.ColumnHeader textAlign="center">Tag</Table.ColumnHeader>
    <Table.ColumnHeader textAlign="center">State</Table.ColumnHeader>
  </>
);

/** Edit mode inserts the drag/hide controls column, so the group grows to match. */
function actuatorColGroup(editing: boolean) {
  return (
    <Table.ColumnGroup>
      {editing && <Table.Column htmlWidth="1%" />}
      <Table.Column />
      <Table.Column htmlWidth="90%" />
    </Table.ColumnGroup>
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

  // Edit mode is per-section and deliberately not persisted: it's a transient
  // authoring state, and no one should return to a control surface that is
  // still frozen with its commands disabled.
  const [editingSensors, setEditingSensors] = useState(false);
  const [editingActuators, setEditingActuators] = useState(false);

  return (
    <Flex gap={4} align="flex-start" flexWrap="wrap">
      {/* ── Sensors ── */}
      <Box flex="1" minW="280px">
        <TableSection<SensorEntry>
          storageKey={SENSOR_LAYOUT_KEY}
          baseTitle="Sensors"
          items={sensors}
          getName={(s) => s.name}
          header={SENSOR_HEADER}
          size={TABLE_SIZE}
          emptyMessage="No sensors in config."
          editing={editingSensors}
          onEditingChange={setEditingSensors}
          renderRow={(sensor, opts) => (
            <SensorRow
              sensor={sensor}
              isStale={isStale}
              editing={opts.editing}
              hidden={opts.hidden}
              onToggleHidden={opts.onToggleHidden}
            />
          )}
        />
      </Box>

      {/* ── Actuators ── */}
      <Box flex="2" minW="280px">
        <TableSection<ActuatorEntry>
          storageKey={ACTUATOR_LAYOUT_KEY}
          baseTitle="Actuators"
          items={actuators}
          getName={(a) => a.name}
          header={ACTUATOR_HEADER}
          colGroup={actuatorColGroup}
          size={TABLE_SIZE}
          emptyMessage="No actuators in config."
          editing={editingActuators}
          onEditingChange={setEditingActuators}
          renderRow={(actuator, opts) => (
            <ActuatorRow
              entry={actuator}
              editing={opts.editing}
              hidden={opts.hidden}
              onToggleHidden={opts.onToggleHidden}
            />
          )}
        />
      </Box>
    </Flex>
  );
}

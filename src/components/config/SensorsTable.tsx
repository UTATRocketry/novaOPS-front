"use client";

import { useState } from "react";
import { Box, Flex, Table } from "@chakra-ui/react";
import { Card, Chip, Icon } from "@/components/primitives";
import type { ConvertMethod, SensorEntry, SensorType } from "@/lib/types";
import {
  AddRowButton,
  Cell,
  IconButton,
  NumberCell,
  SelectCell,
  TABLE_CSS,
  TextCell,
} from "./fields";
import { CalibrationModal } from "./CalibrationModal";

const SENSOR_TYPES: SensorType[] = ["PT", "LC", "TC"];
const SOURCES = ["GCS", "TCS", "FAS"] as const;
const CONVERT_METHODS: ConvertMethod[] = ["none", "linear", "polynomial"];

export interface SensorsTableProps {
  sensors: SensorEntry[];
  onChange: (next: SensorEntry[]) => void;
}

export function SensorsTable({ sensors, onChange }: SensorsTableProps) {
  const [calibrating, setCalibrating] = useState<number | null>(null);

  function update(i: number, patch: Partial<SensorEntry>) {
    onChange(sensors.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function updateBinding(i: number, patch: Record<string, unknown>) {
    update(i, { binding: { ...(sensors[i].binding as Record<string, unknown>), ...patch } as SensorEntry["binding"] });
  }
  function setSource(i: number, source: string) {
    // Swap to the binding shape for the chosen source (discriminated union).
    const binding =
      source === "FAS"
        ? { source: "FAS" as const, node: "", channel: 0 }
        : { source: source as "GCS" | "TCS", hat_id: 0, channel_id: 0 };
    update(i, { binding });
  }
  function remove(i: number) {
    onChange(sensors.filter((_, idx) => idx !== i));
  }
  function add() {
    onChange([
      ...sensors,
      { name: "", type: "PT", unit: "", binding: { source: "GCS", hat_id: 0, channel_id: 0 }, convert: { method: "none" } },
    ]);
  }

  return (
    <Card title="Sensors" flush>
      <Box overflowX="auto">
        <Table.Root size="sm" css={TABLE_CSS}>
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>Name</Table.ColumnHeader>
              <Table.ColumnHeader>Type</Table.ColumnHeader>
              <Table.ColumnHeader>Unit</Table.ColumnHeader>
              <Table.ColumnHeader>Source</Table.ColumnHeader>
              <Table.ColumnHeader>Hat / Node</Table.ColumnHeader>
              <Table.ColumnHeader>Channel</Table.ColumnHeader>
              <Table.ColumnHeader>Convert</Table.ColumnHeader>
              <Table.ColumnHeader>Calibration</Table.ColumnHeader>
              <Table.ColumnHeader />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {sensors.length === 0 ? (
              <Table.Row>
                <Table.Cell colSpan={9}>
                  <Box color="text.muted" fontSize="sm" py={2}>No sensors. Add one below.</Box>
                </Table.Cell>
              </Table.Row>
            ) : (
              sensors.map((s, i) => {
                const b = s.binding;
                const isFas = b.source === "FAS";
                const pointCount = s.convert?.calibration?.length ?? 0;
                return (
                  <Table.Row key={i}>
                    <Table.Cell><Cell><TextCell value={s.name} onChange={(v) => update(i, { name: v })} placeholder="TAG" /></Cell></Table.Cell>
                    <Table.Cell><Cell><SelectCell value={s.type} options={SENSOR_TYPES} onChange={(v) => update(i, { type: v as SensorType })} /></Cell></Table.Cell>
                    <Table.Cell><Cell><TextCell value={s.unit ?? ""} onChange={(v) => update(i, { unit: v })} placeholder="psi" /></Cell></Table.Cell>
                    <Table.Cell><Cell><SelectCell value={b.source} options={SOURCES} onChange={(v) => setSource(i, v)} /></Cell></Table.Cell>
                    <Table.Cell>
                      <Cell>
                        {isFas ? (
                          <TextCell value={b.node} onChange={(v) => updateBinding(i, { node: v })} placeholder="EPB_1" />
                        ) : (
                          <NumberCell value={b.hat_id} onChange={(v) => updateBinding(i, { hat_id: v ?? 0 })} />
                        )}
                      </Cell>
                    </Table.Cell>
                    <Table.Cell>
                      <Cell>
                        {isFas ? (
                          <NumberCell value={b.channel} onChange={(v) => updateBinding(i, { channel: v ?? 0 })} />
                        ) : (
                          <NumberCell value={b.channel_id} onChange={(v) => updateBinding(i, { channel_id: v ?? 0 })} />
                        )}
                      </Cell>
                    </Table.Cell>
                    <Table.Cell><Cell><SelectCell value={s.convert?.method ?? "none"} options={CONVERT_METHODS} onChange={(v) => update(i, { convert: { ...s.convert, method: v as ConvertMethod } })} /></Cell></Table.Cell>
                    <Table.Cell>
                      <Cell>
                        <Flex
                          as="button"
                          align="center"
                          gap={1}
                          onClick={() => setCalibrating(i)}
                          px={2}
                          py={1}
                          borderRadius="control"
                          border="1px solid"
                          borderColor="border.default"
                          fontSize="xs"
                          color="text.muted"
                          cursor="pointer"
                          _hover={{ borderColor: "accent.solid", color: "accent.solid" }}
                        >
                          <Icon name="tune" size={14} />
                          {pointCount > 0 ? `${pointCount} pts` : "Calibrate"}
                        </Flex>
                      </Cell>
                    </Table.Cell>
                    <Table.Cell><Cell><IconButton icon="delete" label="Remove sensor" tone="fault" onClick={() => remove(i)} /></Cell></Table.Cell>
                  </Table.Row>
                );
              })
            )}
          </Table.Body>
        </Table.Root>
      </Box>
      <AddRowButton label="Add sensor" onClick={add} />

      {calibrating !== null && sensors[calibrating] && (
        <CalibrationModal
          sensor={sensors[calibrating]}
          onClose={() => setCalibrating(null)}
          onSave={(calibration) => {
            const s = sensors[calibrating];
            const method = s.convert?.method && s.convert.method !== "none" ? s.convert.method : "linear";
            update(calibrating, {
              convert: { method, calibration: calibration.length ? calibration : null },
            });
          }}
        />
      )}

      <Box px={3} pb={3}>
        <Chip status="neutral">Calibration is applied by the backend; this only authors the pairs.</Chip>
      </Box>
    </Card>
  );
}

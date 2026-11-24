"use client";

import { useState } from "react";
import { Box, Flex, Table, Text } from "@chakra-ui/react";
import { Card, Chip, Icon } from "@/components/primitives";
import type { ConvertMethod, PiGpioBinding, SensorBinding, SensorEntry, SensorType, TcType } from "@/lib/types";
import { isGpioBinding } from "@/lib/types";
import { DEFAULT_TC_TYPE, PI_GPIO_PINS, TC_TYPES, isPiTarget, piPinProblem } from "@/lib/config/piIo";
import {
  AddRowButton,
  Cell,
  ChannelSelectCell,
  IconButton,
  NumberCell,
  SelectCell,
  TABLE_CSS,
  TextCell,
} from "./fields";
import { CalibrationModal } from "./CalibrationModal";

const SENSOR_TYPES: SensorType[] = ["PT", "LC", "TC", "DI"];
const SOURCES = ["GCS", "TCS", "FAS"] as const;
/** A digital input is a Pi GPIO pin, so only the Pis are offered. */
const DI_SOURCES = ["GCS", "TCS"] as const;
const CONVERT_METHODS: ConvertMethod[] = [
  "none",
  "zero_offset",
  "linear",
  "polynomial",
  "theil_sen",
  "repeated_median",
];

/**
 * A DI sensor's pin, or undefined while none is chosen. A new DI has no
 * `gpio_channel` key yet (no pin is a safe default), so the row is laid out by
 * sensor type, not by `isGpioBinding`, which needs the key.
 */
function diPin(b: SensorBinding): number | undefined {
  const pin = (b as unknown as Record<string, unknown>).gpio_channel;
  return typeof pin === "number" ? pin : undefined;
}

/** What's wrong with a DI's pin, mirroring the backend's check; null when fine. */
export function diPinProblem(b: SensorBinding): string | null {
  const pin = diPin(b);
  if (pin === undefined) return "pick a GPIO pin";
  return piPinProblem(pin);
}

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
    const s = sensors[i];
    if (s.type === "DI") {
      // A DI keeps its pin (if it has one yet) when moving between Pis.
      const pin = diPin(s.binding);
      update(i, { binding: { source: source as "GCS" | "TCS", ...(pin !== undefined ? { gpio_channel: pin } : {}) } as PiGpioBinding });
      return;
    }
    // Swap to the binding shape for the chosen source (discriminated union).
    const binding =
      source === "FAS"
        ? { source: "FAS" as const, node: "", channel: 0 }
        : { source: source as "GCS" | "TCS", hat_id: 0, channel_id: 0 };
    // Only a Pi's MCC 134 takes a thermocouple type.
    update(i, { binding, ...(source === "FAS" && s.tc_type != null ? { tc_type: null } : {}) });
  }
  function setType(i: number, type: SensorType) {
    const s = sensors[i];
    const patch: Partial<SensorEntry> = { type };
    if (type !== "TC" && s.tc_type != null) patch.tc_type = null;
    if (type === "DI" && !isGpioBinding(s.binding)) {
      // GPIO pin left unset: 0 is reserved, so there's no safe default, and
      // validation asks for one.
      const source = isPiTarget(s.binding.source) ? s.binding.source : "GCS";
      patch.binding = { source } as PiGpioBinding;
      // A DI reads 0 or 1; the backend ignores any conversion.
      patch.convert = { method: "none" };
    } else if (type !== "DI" && (s.type === "DI" || isGpioBinding(s.binding))) {
      // Back to a DAQ channel, including from a DI that had no pin yet.
      const source = isPiTarget(s.binding.source) ? s.binding.source : "GCS";
      patch.binding = { source, hat_id: 0, channel_id: 0 };
    }
    update(i, patch);
  }
  /** Set a DI's pin, writing a clean `{source, gpio_channel}` binding. */
  function setDiPin(i: number, pin: number | undefined) {
    const b = sensors[i].binding;
    const source = isPiTarget(b.source) ? b.source : "GCS";
    update(i, { binding: { source, ...(pin !== undefined ? { gpio_channel: pin } : {}) } as PiGpioBinding });
  }
  function setRange(i: number, index: 0 | 1, v: number | undefined) {
    const [lo, hi] = sensors[i].range ?? [0, 0];
    update(i, { range: index === 0 ? [v ?? 0, hi] : [lo, v ?? 0] });
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
              <Table.ColumnHeader>Range</Table.ColumnHeader>
              <Table.ColumnHeader>Convert</Table.ColumnHeader>
              <Table.ColumnHeader>Calibration</Table.ColumnHeader>
              <Table.ColumnHeader />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {sensors.length === 0 ? (
              <Table.Row>
                <Table.Cell colSpan={10}>
                  <Box color="text.muted" fontSize="sm" py={2}>No sensors. Add one below.</Box>
                </Table.Cell>
              </Table.Row>
            ) : (
              sensors.map((s, i) => {
                const b = s.binding;
                const isDi = s.type === "DI";
                const isFas = !isDi && b.source === "FAS";
                const showTcType = s.type === "TC" && !isFas;
                // DI pins used by OTHER DI sensors on the same Pi. Actuator
                // pins are checked by validation, which sees both tables.
                const usedPins = new Set<number>();
                if (isDi) {
                  sensors.forEach((o, j) => {
                    if (j !== i && o.type === "DI" && o.binding.source === b.source) {
                      const pin = diPin(o.binding);
                      if (pin !== undefined) usedPins.add(pin);
                    }
                  });
                }
                const pinProblem = isDi ? diPinProblem(b) : null;
                const pointCount = s.convert?.calibration?.length ?? 0;
                return (
                  <Table.Row key={i}>
                    <Table.Cell><Cell><TextCell value={s.name} onChange={(v) => update(i, { name: v })} placeholder="TAG" /></Cell></Table.Cell>
                    <Table.Cell>
                      <Cell>
                        <Flex gap={1} align="center">
                          <SelectCell value={s.type} options={SENSOR_TYPES} onChange={(v) => setType(i, v as SensorType)} />
                          {showTcType && (
                            <Box title="Thermocouple type (MCC 134)">
                              <SelectCell
                                value={s.tc_type ?? DEFAULT_TC_TYPE}
                                options={TC_TYPES}
                                onChange={(v) => update(i, { tc_type: v as TcType })}
                              />
                            </Box>
                          )}
                        </Flex>
                      </Cell>
                    </Table.Cell>
                    <Table.Cell><Cell><TextCell value={s.unit ?? ""} onChange={(v) => update(i, { unit: v })} placeholder="psi" /></Cell></Table.Cell>
                    <Table.Cell><Cell><SelectCell value={b.source} options={s.type === "DI" ? DI_SOURCES : SOURCES} onChange={(v) => setSource(i, v)} /></Cell></Table.Cell>
                    <Table.Cell>
                      <Cell>
                        {isFas && b.source === "FAS" ? (
                          <TextCell value={b.node} onChange={(v) => updateBinding(i, { node: v })} placeholder="EPB_1" />
                        ) : isDi ? (
                          <Box color="text.muted" fontSize="xs" fontFamily="mono" px={2}>GPIO</Box>
                        ) : (
                          <NumberCell value={"hat_id" in b ? b.hat_id : undefined} onChange={(v) => updateBinding(i, { hat_id: v ?? 0 })} />
                        )}
                      </Cell>
                    </Table.Cell>
                    <Table.Cell>
                      <Cell>
                        {isFas && b.source === "FAS" ? (
                          <NumberCell value={b.channel} onChange={(v) => updateBinding(i, { channel: v ?? 0 })} />
                        ) : isDi ? (
                          <Box title="BCM GPIO input pin (reserved pins not offered)">
                            <ChannelSelectCell
                              value={diPin(b)}
                              channels={PI_GPIO_PINS}
                              used={usedPins}
                              onChange={(v) => setDiPin(i, v)}
                            />
                            {pinProblem && (
                              <Text role="alert" fontSize="2xs" color="fault" mt={0.5} whiteSpace="nowrap">
                                {pinProblem}
                              </Text>
                            )}
                          </Box>
                        ) : (
                          <NumberCell value={"channel_id" in b ? b.channel_id : undefined} onChange={(v) => updateBinding(i, { channel_id: v ?? 0 })} />
                        )}
                      </Cell>
                    </Table.Cell>
                    <Table.Cell>
                      <Cell>
                        <Flex gap={1} align="center">
                          <NumberCell value={s.range?.[0]} onChange={(v) => setRange(i, 0, v)} placeholder="min" />
                          <NumberCell value={s.range?.[1]} onChange={(v) => setRange(i, 1, v)} placeholder="max" />
                          {s.range && <IconButton icon="close" label="Clear range" onClick={() => update(i, { range: undefined })} />}
                        </Flex>
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

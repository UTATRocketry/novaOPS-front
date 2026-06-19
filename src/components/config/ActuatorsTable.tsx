"use client";

import { Fragment, useState } from "react";
import { Box, Flex, Table, Text } from "@chakra-ui/react";
import { Card, Icon } from "@/components/primitives";
import type { ActuatorActions, ActuatorEntry, ActuatorType, SourceTarget } from "@/lib/types";
import {
  AddRowButton,
  Cell,
  ChannelSelectCell,
  CsvListCell,
  IconButton,
  SelectCell,
  TABLE_CSS,
  TextCell,
} from "./fields";

const ACTUATOR_TYPES: ActuatorType[] = [
  "servo",
  "solenoid",
  "powered_device",
  "powered_gpio_device",
  "gpio_device",
];
const TARGETS: SourceTarget[] = ["GCS", "FAS", "TCS"];
const SOLENOID_TYPES = ["", "nominally_closed", "nominally_open"] as const;
const RELAY_TYPES = ["", "nominally_off", "nominally_on"] as const;
// Hardware channel ranges (inclusive).
const RELAY_MAX = 23;
const SERVO_MAX = 15;

// ---------------------------------------------------------------------------
// Small labelled field used inside the per-type detail editor.
// ---------------------------------------------------------------------------

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box minW="120px">
      <Text fontSize="2xs" color="text.muted" mb={0.5}>{label}</Text>
      {children}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Type-specific detail editor — only the fields relevant to the actuator type.
// ---------------------------------------------------------------------------

interface DetailProps {
  entry: ActuatorEntry;
  setBinding: (patch: Partial<ActuatorEntry["binding"]>) => void;
  setActions: (patch: Partial<ActuatorActions>) => void;
  /** Relay channels used by OTHER actuators (current value stays selectable). */
  usedRelay: ReadonlySet<number>;
  /** Servo channels used by OTHER actuators. */
  usedServo: ReadonlySet<number>;
}

function aliasesField(entry: ActuatorEntry, setActions: DetailProps["setActions"]) {
  return (
    <Field label="position aliases">
      <CsvListCell
        value={entry.actions?.position_aliases}
        onChange={(a) => setActions({ position_aliases: a.length ? (a as string[]) : undefined })}
        placeholder="open, closed"
      />
    </Field>
  );
}

function relayChannelField(entry: ActuatorEntry, setBinding: DetailProps["setBinding"], used: ReadonlySet<number>) {
  return (
    <Field label="relay_channel">
      <ChannelSelectCell
        value={entry.binding.relay_channel ?? undefined}
        max={RELAY_MAX}
        used={used}
        onChange={(v) => setBinding({ relay_channel: v ?? null })}
      />
    </Field>
  );
}

function gpioField(entry: ActuatorEntry, setActions: DetailProps["setActions"], placeholder: string) {
  return (
    <Field label="gpio_commands">
      <CsvListCell
        value={entry.actions?.gpio_commands}
        onChange={(g) => setActions({ gpio_commands: g.length ? (g as string[]) : undefined })}
        placeholder={placeholder}
      />
    </Field>
  );
}

function TypeDetail({ entry, setBinding, setActions, usedRelay, usedServo }: DetailProps) {
  const act = entry.actions ?? {};
  switch (entry.type) {
    case "servo":
      return (
        <Flex gap={3} flexWrap="wrap">
          <Field label="servo_channel">
            <ChannelSelectCell
              value={entry.binding.servo_channel ?? undefined}
              max={SERVO_MAX}
              used={usedServo}
              onChange={(v) => setBinding({ servo_channel: v ?? null })}
            />
          </Field>
          {relayChannelField(entry, setBinding, usedRelay)}
          {aliasesField(entry, setActions)}
          <Field label="positions (µs)">
            <CsvListCell
              value={act.positions}
              numeric
              onChange={(p) => setActions({ positions: p.length ? (p as number[]) : undefined })}
              placeholder="2050, 1090"
            />
          </Field>
          <Field label="default_position">
            <TextCell value={act.default_position != null ? String(act.default_position) : ""} onChange={(v) => setActions({ default_position: v || null })} placeholder="closed" />
          </Field>
        </Flex>
      );
    case "solenoid":
      return (
        <Flex gap={3} flexWrap="wrap">
          <Field label="solenoid_type">
            <SelectCell value={(act.solenoid_type as string) ?? ""} options={SOLENOID_TYPES} onChange={(v) => setActions({ solenoid_type: v || null })} />
          </Field>
          {relayChannelField(entry, setBinding, usedRelay)}
          {aliasesField(entry, setActions)}
        </Flex>
      );
    case "powered_device":
      return (
        <Flex gap={3} flexWrap="wrap">
          <Field label="relay_type">
            <SelectCell value={(act.relay_type as string) ?? ""} options={RELAY_TYPES} onChange={(v) => setActions({ relay_type: v || null })} />
          </Field>
          {relayChannelField(entry, setBinding, usedRelay)}
        </Flex>
      );
    case "powered_gpio_device":
      return (
        <Flex gap={3} flexWrap="wrap">
          <Field label="relay_type">
            <SelectCell value={(act.relay_type as string) ?? ""} options={RELAY_TYPES} onChange={(v) => setActions({ relay_type: v || null })} />
          </Field>
          {relayChannelField(entry, setBinding, usedRelay)}
          {gpioField(entry, setActions, "arm, disarm")}
        </Flex>
      );
    case "gpio_device":
      return (
        <Flex gap={3} flexWrap="wrap">
          {gpioField(entry, setActions, "armed, disarmed")}
        </Flex>
      );
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// ActuatorsTable
// ---------------------------------------------------------------------------

export interface ActuatorsTableProps {
  actuators: ActuatorEntry[];
  onChange: (next: ActuatorEntry[]) => void;
}

export function ActuatorsTable({ actuators, onChange }: ActuatorsTableProps) {
  const [expanded, setExpanded] = useState<number | null>(null);

  // Channels already assigned anywhere — used to offer only remaining options
  // (each row's own current value stays selectable, handled in ChannelSelectCell).
  const usedRelay = new Set<number>();
  const usedServo = new Set<number>();
  for (const a of actuators) {
    if (a.binding.relay_channel != null) usedRelay.add(a.binding.relay_channel);
    if (a.binding.servo_channel != null) usedServo.add(a.binding.servo_channel);
  }

  function update(i: number, patch: Partial<ActuatorEntry>) {
    onChange(actuators.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  }
  function setBinding(i: number, patch: Partial<ActuatorEntry["binding"]>) {
    update(i, { binding: { ...actuators[i].binding, ...patch } });
  }
  function setActions(i: number, patch: Partial<ActuatorActions>) {
    update(i, { actions: { ...actuators[i].actions, ...patch } });
  }
  function remove(i: number) {
    onChange(actuators.filter((_, idx) => idx !== i));
    setExpanded(null);
  }
  function add() {
    onChange([...actuators, { name: "", type: "solenoid", binding: { target: "GCS" }, actions: {} }]);
    setExpanded(actuators.length);
  }

  return (
    <Card title="Actuators" flush>
      <Box overflowX="auto">
        <Table.Root size="sm" css={TABLE_CSS}>
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>Name</Table.ColumnHeader>
              <Table.ColumnHeader>Type</Table.ColumnHeader>
              <Table.ColumnHeader>Target</Table.ColumnHeader>
              <Table.ColumnHeader>Node</Table.ColumnHeader>
              <Table.ColumnHeader>Config</Table.ColumnHeader>
              <Table.ColumnHeader />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {actuators.length === 0 ? (
              <Table.Row>
                <Table.Cell colSpan={6}>
                  <Box color="text.muted" fontSize="sm" py={2}>No actuators. Add one below.</Box>
                </Table.Cell>
              </Table.Row>
            ) : (
              actuators.map((a, i) => (
                <Fragment key={i}>
                  <Table.Row>
                    <Table.Cell><Cell><TextCell value={a.name} onChange={(v) => update(i, { name: v })} placeholder="TAG" /></Cell></Table.Cell>
                    <Table.Cell><Cell><SelectCell value={a.type} options={ACTUATOR_TYPES} onChange={(v) => update(i, { type: v as ActuatorType })} /></Cell></Table.Cell>
                    <Table.Cell><Cell><SelectCell value={a.binding.target} options={TARGETS} onChange={(v) => setBinding(i, { target: v as SourceTarget })} /></Cell></Table.Cell>
                    <Table.Cell><Cell><TextCell value={a.binding.node ?? ""} onChange={(v) => setBinding(i, { node: v || null })} placeholder="—" /></Cell></Table.Cell>
                    <Table.Cell>
                      <Cell>
                        <Flex
                          as="button"
                          align="center"
                          gap={1}
                          onClick={() => setExpanded(expanded === i ? null : i)}
                          px={2}
                          py={1}
                          borderRadius="control"
                          border="1px solid"
                          borderColor={expanded === i ? "accent.solid" : "border.default"}
                          fontSize="xs"
                          color={expanded === i ? "accent.solid" : "text.muted"}
                          cursor="pointer"
                          _hover={{ borderColor: "accent.solid", color: "accent.solid" }}
                        >
                          <Icon name={expanded === i ? "expand_less" : "tune"} size={14} />
                          {a.type} settings
                        </Flex>
                      </Cell>
                    </Table.Cell>
                    <Table.Cell><Cell><IconButton icon="delete" label="Remove actuator" tone="fault" onClick={() => remove(i)} /></Cell></Table.Cell>
                  </Table.Row>
                  {expanded === i && (
                    <Table.Row>
                      <Table.Cell colSpan={6}>
                        <Box bg="bg.canvas" borderRadius="control" p={3} my={1}>
                          <TypeDetail
                            entry={a}
                            setBinding={(patch) => setBinding(i, patch)}
                            setActions={(patch) => setActions(i, patch)}
                            usedRelay={usedRelay}
                            usedServo={usedServo}
                          />
                        </Box>
                      </Table.Cell>
                    </Table.Row>
                  )}
                </Fragment>
              ))
            )}
          </Table.Body>
        </Table.Root>
      </Box>
      <AddRowButton label="Add actuator" onClick={add} />
    </Card>
  );
}

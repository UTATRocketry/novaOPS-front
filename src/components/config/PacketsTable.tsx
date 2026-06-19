"use client";

import { Fragment, useState } from "react";
import { Box, Flex, Table, Text } from "@chakra-ui/react";
import { Card, Chip, Icon } from "@/components/primitives";
import type { PacketEntry, PacketFieldDef, PacketFieldType } from "@/lib/types";
import {
  AddRowButton,
  Cell,
  IconButton,
  SelectCell,
  TABLE_CSS,
  TextCell,
} from "./fields";

const FIELD_TYPES: PacketFieldType[] = ["number", "bool"];
// Common FAS bridge ops (free-form — the bridge ultimately validates).
const OP_HINTS = "pwm_set · load_sw_set · imc_arm · imc_disarm · failsafe · actuator_query · discover";

export interface PacketsTableProps {
  packets: PacketEntry[];
  onChange: (next: PacketEntry[]) => void;
}

/** Editor for one packet's parameter list. */
function FieldsEditor({
  fields,
  onChange,
}: {
  fields: PacketFieldDef[];
  onChange: (next: PacketFieldDef[]) => void;
}) {
  function update(i: number, patch: Partial<PacketFieldDef>) {
    onChange(fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }
  function remove(i: number) {
    onChange(fields.filter((_, idx) => idx !== i));
  }
  function add() {
    onChange([...fields, { key: "", type: "number", default: 0 }]);
  }

  return (
    <Box>
      <Text fontSize="2xs" color="text.muted" mb={2}>Parameters — sent to the FAS bridge under this op</Text>
      <Flex direction="column" gap={2}>
        {fields.length === 0 && <Text fontSize="xs" color="text.muted">No parameters (e.g. discover / failsafe).</Text>}
        {fields.map((f, i) => (
          <Flex key={i} align="center" gap={2} flexWrap="wrap">
            <Box minW="130px"><TextCell value={f.key} onChange={(v) => update(i, { key: v })} placeholder="board_id" /></Box>
            <Box minW="90px">
              <SelectCell
                value={f.type}
                options={FIELD_TYPES}
                onChange={(v) => update(i, { type: v as PacketFieldType, default: v === "bool" ? false : 0 })}
              />
            </Box>
            <Text fontSize="2xs" color="text.muted">default</Text>
            <Box minW="110px">
              {f.type === "bool" ? (
                <SelectCell
                  value={f.default ? "true" : "false"}
                  options={["false", "true"]}
                  onChange={(v) => update(i, { default: v === "true" })}
                />
              ) : (
                <TextCell
                  value={f.default != null ? String(f.default) : ""}
                  onChange={(v) => update(i, { default: v === "" ? undefined : Number(v) })}
                  placeholder="0"
                />
              )}
            </Box>
            <IconButton icon="delete" label="Remove parameter" tone="fault" onClick={() => remove(i)} />
          </Flex>
        ))}
      </Flex>
      <AddRowButton label="Add parameter" onClick={add} />
    </Box>
  );
}

export function PacketsTable({ packets, onChange }: PacketsTableProps) {
  const [expanded, setExpanded] = useState<number | null>(null);

  function update(i: number, patch: Partial<PacketEntry>) {
    onChange(packets.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }
  function remove(i: number) {
    onChange(packets.filter((_, idx) => idx !== i));
    setExpanded(null);
  }
  function add() {
    onChange([...packets, { name: "", op: "", fields: [] }]);
    setExpanded(packets.length);
  }

  return (
    <Card title="Packets" flush headerAction={<Chip status="neutral">→ Console Transmit Packet</Chip>}>
      <Box overflowX="auto">
        <Table.Root size="sm" css={TABLE_CSS}>
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>Name</Table.ColumnHeader>
              <Table.ColumnHeader>Op</Table.ColumnHeader>
              <Table.ColumnHeader>Parameters</Table.ColumnHeader>
              <Table.ColumnHeader />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {packets.length === 0 ? (
              <Table.Row>
                <Table.Cell colSpan={4}>
                  <Box color="text.muted" fontSize="sm" py={2}>No packets. Add one below.</Box>
                </Table.Cell>
              </Table.Row>
            ) : (
              packets.map((p, i) => (
                <Fragment key={i}>
                  <Table.Row>
                    <Table.Cell><Cell><TextCell value={p.name} onChange={(v) => update(i, { name: v })} placeholder="PWM Set" mono={false} /></Cell></Table.Cell>
                    <Table.Cell><Cell><TextCell value={p.op} onChange={(v) => update(i, { op: v })} placeholder="pwm_set" /></Cell></Table.Cell>
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
                          {p.fields.length} params
                        </Flex>
                      </Cell>
                    </Table.Cell>
                    <Table.Cell><Cell><IconButton icon="delete" label="Remove packet" tone="fault" onClick={() => remove(i)} /></Cell></Table.Cell>
                  </Table.Row>
                  {expanded === i && (
                    <Table.Row>
                      <Table.Cell colSpan={4}>
                        <Box bg="bg.canvas" borderRadius="control" p={3} my={1}>
                          <FieldsEditor fields={p.fields} onChange={(fields) => update(i, { fields })} />
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
      <Box px={3} pt={1}>
        <Text fontSize="2xs" color="text.muted">Ops: {OP_HINTS}</Text>
      </Box>
      <AddRowButton label="Add packet" onClick={add} />
    </Card>
  );
}

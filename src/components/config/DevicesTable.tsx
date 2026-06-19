"use client";

import { Fragment, useState } from "react";
import { Box, Flex, Table, Text } from "@chakra-ui/react";
import { Card, Chip, Icon } from "@/components/primitives";
import type { DeviceEntry, DeviceRange } from "@/lib/types";
import { AddRowButton, Cell, IconButton, NumberCell, TABLE_CSS, TextCell } from "./fields";

export interface DevicesTableProps {
  devices: DeviceEntry[];
  onChange: (next: DeviceEntry[]) => void;
}

// Chart-level metric names the pages look up (one range per chart, not per rail).
const METRIC_HINTS = "EPB: voltage current · PMB: voltage temperature · FMC: accel gyro mag accelHi altitude pressure temperature";

/** Per-device chart-range editor (metric → [min, max]). */
function RangesEditor({
  ranges,
  onChange,
}: {
  ranges: Record<string, DeviceRange>;
  onChange: (next: Record<string, DeviceRange>) => void;
}) {
  const rows = Object.entries(ranges);

  function setMetric(oldKey: string, newKey: string) {
    const next: Record<string, DeviceRange> = {};
    for (const [k, v] of Object.entries(ranges)) next[k === oldKey ? newKey : k] = v;
    onChange(next);
  }
  function setBound(metric: string, idx: 0 | 1, value: number | undefined) {
    const cur = ranges[metric] ?? [0, 0];
    const pair: DeviceRange = idx === 0 ? [value ?? 0, cur[1]] : [cur[0], value ?? 0];
    onChange({ ...ranges, [metric]: pair });
  }
  function remove(metric: string) {
    const next = { ...ranges };
    delete next[metric];
    onChange(next);
  }
  function add() {
    onChange({ ...ranges, "": [0, 0] });
  }

  return (
    <Box>
      <Text fontSize="2xs" color="text.muted" mb={2}>Chart ranges — {METRIC_HINTS}</Text>
      <Flex direction="column" gap={2}>
        {rows.length === 0 && <Text fontSize="xs" color="text.muted">No ranges (charts autoscale).</Text>}
        {rows.map(([metric, pair], i) => (
          <Flex key={i} align="center" gap={2} flexWrap="wrap">
            <Box minW="160px"><TextCell value={metric} onChange={(v) => setMetric(metric, v)} placeholder="metric" /></Box>
            <Text fontSize="2xs" color="text.muted">min</Text>
            <Box minW="80px"><NumberCell value={pair[0]} onChange={(v) => setBound(metric, 0, v)} /></Box>
            <Text fontSize="2xs" color="text.muted">max</Text>
            <Box minW="80px"><NumberCell value={pair[1]} onChange={(v) => setBound(metric, 1, v)} /></Box>
            <IconButton icon="delete" label="Remove range" tone="fault" onClick={() => remove(metric)} />
          </Flex>
        ))}
      </Flex>
      <AddRowButton label="Add range" onClick={add} />
    </Box>
  );
}

export function DevicesTable({ devices, onChange }: DevicesTableProps) {
  const [expanded, setExpanded] = useState<number | null>(null);

  function update(i: number, patch: Partial<DeviceEntry>) {
    onChange(devices.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }
  function remove(i: number) {
    onChange(devices.filter((_, idx) => idx !== i));
    setExpanded(null);
  }
  function add() {
    onChange([...devices, { key: "", label: "", ranges: {} }]);
    setExpanded(devices.length);
  }

  return (
    <Card title="Devices" flush headerAction={<Chip status="neutral">chart ranges → Devices &amp; Flight</Chip>}>
      <Box overflowX="auto">
        <Table.Root size="sm" css={TABLE_CSS}>
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>Board key</Table.ColumnHeader>
              <Table.ColumnHeader>Label</Table.ColumnHeader>
              <Table.ColumnHeader>Ranges</Table.ColumnHeader>
              <Table.ColumnHeader />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {devices.length === 0 ? (
              <Table.Row>
                <Table.Cell colSpan={4}>
                  <Box color="text.muted" fontSize="sm" py={2}>No devices. Add one below.</Box>
                </Table.Cell>
              </Table.Row>
            ) : (
              devices.map((d, i) => (
                <Fragment key={i}>
                  <Table.Row>
                    <Table.Cell><Cell><TextCell value={d.key} onChange={(v) => update(i, { key: v })} placeholder="EPB:0" /></Cell></Table.Cell>
                    <Table.Cell><Cell><TextCell value={d.label ?? ""} onChange={(v) => update(i, { label: v })} placeholder="Engineering Peripheral Board" mono={false} /></Cell></Table.Cell>
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
                          {Object.keys(d.ranges ?? {}).length} ranges
                        </Flex>
                      </Cell>
                    </Table.Cell>
                    <Table.Cell><Cell><IconButton icon="delete" label="Remove device" tone="fault" onClick={() => remove(i)} /></Cell></Table.Cell>
                  </Table.Row>
                  {expanded === i && (
                    <Table.Row>
                      <Table.Cell colSpan={4}>
                        <Box bg="bg.canvas" borderRadius="control" p={3} my={1}>
                          <RangesEditor
                            ranges={d.ranges ?? {}}
                            onChange={(ranges) => update(i, { ranges })}
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
      <AddRowButton label="Add device" onClick={add} />
    </Card>
  );
}

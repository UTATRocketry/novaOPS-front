"use client";

import { Box, Flex, Table, Text } from "@chakra-ui/react";
import { Card, Chip } from "@/components/primitives";
import type { SafetyRules } from "@/lib/types";
import { AddRowButton, Cell, IconButton, TABLE_CSS, TextCell } from "./fields";

type RuleArray = NonNullable<SafetyRules["hazardous"]>;
type RuleKind = "hazardous" | "critical";

/** Flatten a single rule object to its (name, states-as-text) pair for editing. */
function ruleToPair(rule: Record<string, string | string[]>): { name: string; states: string } {
  const key = Object.keys(rule)[0] ?? "";
  const val = rule[key];
  const states = Array.isArray(val) ? val.join(", ") : (val ?? "");
  return { name: key, states };
}

/** Rebuild a rule object from edited name + states text. */
function pairToRule(name: string, states: string): Record<string, string | string[]> {
  const parts = states.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length <= 1) return { [name]: parts[0] ?? "ALL" };
  return { [name]: parts };
}

export interface RulesTableProps {
  rules: SafetyRules;
  onChange: (next: SafetyRules) => void;
}

function RuleSection({
  kind,
  rules,
  onChange,
}: {
  kind: RuleKind;
  rules: RuleArray;
  onChange: (next: RuleArray) => void;
}) {
  function update(i: number, name: string, states: string) {
    onChange(rules.map((r, idx) => (idx === i ? pairToRule(name, states) : r)));
  }
  function remove(i: number) {
    onChange(rules.filter((_, idx) => idx !== i));
  }
  function add() {
    onChange([...rules, { "": "ALL" }]);
  }

  return (
    <Card
      title={kind === "hazardous" ? "Hazardous (blocked by lockout)" : "Critical"}
      flush
      headerAction={
        <Chip status={kind === "hazardous" ? "fault" : "warn"}>{rules.length}</Chip>
      }
    >
      <Box overflowX="auto">
        <Table.Root size="sm" css={TABLE_CSS}>
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>Command / Actuator</Table.ColumnHeader>
              <Table.ColumnHeader>States (comma-sep, or ALL)</Table.ColumnHeader>
              <Table.ColumnHeader />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rules.length === 0 ? (
              <Table.Row>
                <Table.Cell colSpan={3}>
                  <Box color="text.muted" fontSize="sm" py={2}>No {kind} rules.</Box>
                </Table.Cell>
              </Table.Row>
            ) : (
              rules.map((r, i) => {
                const { name, states } = ruleToPair(r);
                return (
                  <Table.Row key={i}>
                    <Table.Cell><Cell><TextCell value={name} onChange={(v) => update(i, v, states)} placeholder="BVFTP" /></Cell></Table.Cell>
                    <Table.Cell><Cell><TextCell value={states} onChange={(v) => update(i, name, v)} placeholder="ALL" /></Cell></Table.Cell>
                    <Table.Cell><Cell><IconButton icon="delete" label="Remove rule" tone="fault" onClick={() => remove(i)} /></Cell></Table.Cell>
                  </Table.Row>
                );
              })
            )}
          </Table.Body>
        </Table.Root>
      </Box>
      <AddRowButton label={`Add ${kind} rule`} onClick={add} />
    </Card>
  );
}

export function RulesTable({ rules, onChange }: RulesTableProps) {
  return (
    <Flex direction="column" gap={4}>
      <Text fontSize="xs" color="text.muted">
        Safety rules classify commands. Hazardous commands are blocked while physical lockout is
        engaged; pad-role clients may only send safety-critical commands.
      </Text>
      <RuleSection
        kind="hazardous"
        rules={rules.hazardous ?? []}
        onChange={(next) => onChange({ ...rules, hazardous: next })}
      />
      <RuleSection
        kind="critical"
        rules={rules.critical ?? []}
        onChange={(next) => onChange({ ...rules, critical: next })}
      />
    </Flex>
  );
}

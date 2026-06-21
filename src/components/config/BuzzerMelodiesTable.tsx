"use client";

import { Fragment, useState } from "react";
import { Box, Flex, Table, Text, Textarea } from "@chakra-ui/react";
import { Card, Icon } from "@/components/primitives";
import { AddRowButton, IconButton, TABLE_CSS, TextCell } from "./fields";

type NoteArray = Array<[number, number] | [number, number, number]>;
type MelodyMap = Record<string, NoteArray>;

export interface BuzzerMelodiesTableProps {
  melodies: MelodyMap;
  onChange: (next: MelodyMap) => void;
}

function parseNotes(raw: string): NoteArray | null {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    for (const item of parsed) {
      if (!Array.isArray(item) || item.length < 2 || item.length > 3) return null;
      if (typeof item[0] !== "number" || typeof item[1] !== "number") return null;
      if (item.length === 3 && typeof item[2] !== "number") return null;
    }
    return parsed as NoteArray;
  } catch {
    return null;
  }
}

export function BuzzerMelodiesTable({ melodies, onChange }: BuzzerMelodiesTableProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({});
  const [parseErrors, setParseErrors] = useState<Record<string, string>>({});

  const names = Object.keys(melodies);

  function rename(oldName: string, newName: string) {
    if (oldName === newName) return;
    const next: MelodyMap = {};
    for (const [k, v] of Object.entries(melodies)) {
      next[k === oldName ? newName : k] = v;
    }
    onChange(next);
    if (expanded === oldName) setExpanded(newName);
  }

  function remove(name: string) {
    const next = { ...melodies };
    delete next[name];
    onChange(next);
    if (expanded === name) setExpanded(null);
  }

  function add() {
    let key = "new_melody";
    let n = 1;
    while (melodies[key] !== undefined) key = `new_melody_${n++}`;
    onChange({ ...melodies, [key]: [[440, 200]] });
    setExpanded(key);
    setEditingNotes((prev) => ({ ...prev, [key]: JSON.stringify([[440, 200]]) }));
  }

  function toggleExpand(name: string) {
    if (expanded === name) {
      setExpanded(null);
    } else {
      setExpanded(name);
      if (!(name in editingNotes)) {
        setEditingNotes((prev) => ({ ...prev, [name]: JSON.stringify(melodies[name]) }));
      }
    }
  }

  function handleNotesChange(name: string, raw: string) {
    setEditingNotes((prev) => ({ ...prev, [name]: raw }));
    const parsed = parseNotes(raw);
    if (parsed === null) {
      setParseErrors((prev) => ({ ...prev, [name]: "Invalid JSON — expected [[freq, ms], …]" }));
    } else {
      setParseErrors((prev) => { const n = { ...prev }; delete n[name]; return n; });
      onChange({ ...melodies, [name]: parsed });
    }
  }

  return (
    <Card title="Buzzer Melodies" flush>
      <Box overflowX="auto">
        <Table.Root size="sm" css={TABLE_CSS}>
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>Name</Table.ColumnHeader>
              <Table.ColumnHeader>Notes</Table.ColumnHeader>
              <Table.ColumnHeader />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {names.length === 0 ? (
              <Table.Row>
                <Table.Cell colSpan={3}>
                  <Box color="text.muted" fontSize="sm" py={2}>No melodies. Add one below.</Box>
                </Table.Cell>
              </Table.Row>
            ) : (
              names.map((name) => (
                <Fragment key={name}>
                  <Table.Row>
                    <Table.Cell>
                      <TextCell
                        value={name}
                        onChange={(v) => rename(name, v)}
                        placeholder="melody_name"
                      />
                    </Table.Cell>
                    <Table.Cell>
                      <Flex
                        as="button"
                        align="center"
                        gap={1}
                        onClick={() => toggleExpand(name)}
                        px={2}
                        py={1}
                        borderRadius="control"
                        border="1px solid"
                        borderColor={expanded === name ? "accent.solid" : "border.default"}
                        fontSize="xs"
                        color={expanded === name ? "accent.solid" : "text.muted"}
                        cursor="pointer"
                        fontFamily="mono"
                        _hover={{ borderColor: "accent.solid", color: "accent.solid" }}
                      >
                        <Icon name={expanded === name ? "expand_less" : "expand_more"} size={14} />
                        {melodies[name].length} note{melodies[name].length !== 1 ? "s" : ""}
                      </Flex>
                    </Table.Cell>
                    <Table.Cell>
                      <IconButton icon="delete" label="Remove melody" tone="fault" onClick={() => remove(name)} />
                    </Table.Cell>
                  </Table.Row>
                  {expanded === name && (
                    <Table.Row>
                      <Table.Cell colSpan={3}>
                        <Box bg="bg.canvas" borderRadius="control" p={3} my={1}>
                          <Text fontSize="2xs" color="text.muted" mb={1}>
                            JSON array of [freq_hz, dur_ms] or [freq_hz, dur_ms, vol] tuples
                          </Text>
                          <Textarea
                            value={editingNotes[name] ?? JSON.stringify(melodies[name])}
                            onChange={(e) => handleNotesChange(name, e.target.value)}
                            fontFamily="mono"
                            fontSize="xs"
                            rows={4}
                            bg="bg.canvas"
                            borderColor={parseErrors[name] ? "fault" : "border.default"}
                            borderRadius="control"
                            resize="vertical"
                          />
                          {parseErrors[name] && (
                            <Text fontSize="2xs" color="fault" mt={1}>{parseErrors[name]}</Text>
                          )}
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
      <AddRowButton label="Add melody" onClick={add} />
    </Card>
  );
}

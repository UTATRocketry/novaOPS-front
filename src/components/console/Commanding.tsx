"use client";

import { useMemo, useState } from "react";
import { Box, Flex, Table, Text, chakra } from "@chakra-ui/react";
import { Card, Chip, Mono } from "@/components/primitives";
import { useNovaStore, sel } from "@/lib/store";
import { useActuators, useConfig } from "@/hooks/useConfig";
import { useCommandGate } from "@/hooks/useCommandGate";
import { sendCommand, sendSystemCommand } from "@/lib/api";
import { deriveControls } from "@/lib/pid/actuatorControls";
import type { ActuatorEntry, CommandEntry } from "@/lib/types";
import { SerialConnection } from "./SerialConnection";
import { TransmitPacket } from "./TransmitPacket";
import { SELECT_STYLE } from "./controlStyles";

const NativeSelect = chakra("select");

// ---------------------------------------------------------------------------
// Target model — an actuator command (/api/commands) or a system command
// (/api/system-commands, from config.Commands).
// ---------------------------------------------------------------------------

type TargetKind = "actuator" | "system";

interface Target {
  kind: TargetKind;
  /** Composite option value, e.g. "actuator:BVFTP". */
  key: string;
  /** Backend command/actuator name. */
  name: string;
  /** Actuator type (actuator targets only), used for the command `type` field. */
  actuatorType?: string;
  /** Valid state strings for the state dropdown. Empty = no state required. */
  states: string[];
}

/** Flatten an actuator's control segments into the unique command verbs it accepts. */
function actuatorCommandStates(entry: ActuatorEntry): string[] {
  const out: string[] = [];
  for (const seg of deriveControls(entry)) {
    for (const opt of seg.options) {
      if (!out.includes(opt.command)) out.push(opt.command);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Commanding
// ---------------------------------------------------------------------------

export function Commanding() {
  const { data: actuators } = useActuators();
  const { data: config } = useConfig();
  const clientId = useNovaStore(sel.clientId);
  const push = useNovaStore((s) => s.pushConsoleEntry);

  // Build the target list from actuators + config.Commands.
  const targets = useMemo<Target[]>(() => {
    const list: Target[] = [];
    for (const a of actuators ?? []) {
      list.push({
        kind: "actuator",
        key: `actuator:${a.name}`,
        name: a.name,
        actuatorType: a.type,
        states: actuatorCommandStates(a),
      });
    }
    for (const [name, entry] of Object.entries<CommandEntry>(config?.Commands ?? {})) {
      list.push({
        kind: "system",
        key: `system:${name}`,
        name,
        states: entry.states ?? [],
      });
    }
    return list;
  }, [actuators, config]);

  const [targetKey, setTargetKey] = useState<string>("");
  const [stateValue, setStateValue] = useState<string>("");
  const [sending, setSending] = useState(false);

  const target = targets.find((t) => t.key === targetKey) ?? null;

  // Keep the state selection valid when the target changes.
  const effectiveState = useMemo(() => {
    if (!target) return "";
    if (target.states.length === 0) return "";
    if (target.states.includes(stateValue)) return stateValue;
    return target.states[0];
  }, [target, stateValue]);

  const gate = useCommandGate({
    name: target?.name ?? "",
    state: effectiveState || undefined,
  });

  // Live command preview.
  const preview = useMemo(() => {
    if (!target) return "";
    if (target.kind === "actuator") {
      return `POST /api/commands ${JSON.stringify({
        type: target.actuatorType,
        name: target.name,
        state: effectiveState,
      })}`;
    }
    const body: Record<string, unknown> = { name: target.name };
    if (effectiveState) body.state = effectiveState;
    return `POST /api/system-commands ${JSON.stringify(body)}`;
  }, [target, effectiveState]);

  const needsState = (target?.states.length ?? 0) > 0;
  const missingState = needsState && !effectiveState;
  const canSend = !!target && !!clientId && gate.canSend && !missingState && !sending;

  async function handleSend() {
    if (!target || !clientId) return;
    setSending(true);
    push({ status: "info", kind: "command", text: `» ${preview}` });
    try {
      if (target.kind === "actuator") {
        await sendCommand(
          { type: target.actuatorType ?? "", name: target.name, state: effectiveState },
          clientId,
        );
      } else {
        await sendSystemCommand(
          { name: target.name, state: effectiveState || null },
          clientId,
        );
      }
      push({ status: "nominal", kind: "command", text: `✓ ${target.name} accepted` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      push({ status: "error", kind: "error", text: `✗ ${target.name}: ${msg}` });
    } finally {
      setSending(false);
    }
  }

  return (
    <Flex gap={4} align="flex-start" flexWrap="wrap">
      {/* Composer */}
      <Flex direction="column" gap={4} flex="2" minW="320px">
        <Card title="Compose Command">
          <Flex direction="column" gap={4}>
            {/* Target + state dropdowns */}
            <Flex gap={3} flexWrap="wrap">
              <Box flex="2" minW="200px">
                <Text fontSize="xs" color="text.muted" mb={1}>
                  Target device
                </Text>
                <NativeSelect
                  style={SELECT_STYLE}
                  value={targetKey}
                  onChange={(e) => {
                    setTargetKey(e.target.value);
                    setStateValue("");
                  }}
                >
                  <option value="">— select —</option>
                  <optgroup label="Actuators">
                    {targets
                      .filter((t) => t.kind === "actuator")
                      .map((t) => (
                        <option key={t.key} value={t.key}>
                          {t.name}
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="System Commands">
                    {targets
                      .filter((t) => t.kind === "system")
                      .map((t) => (
                        <option key={t.key} value={t.key}>
                          {t.name}
                        </option>
                      ))}
                  </optgroup>
                </NativeSelect>
              </Box>

              <Box flex="1" minW="140px">
                <Text fontSize="xs" color="text.muted" mb={1}>
                  Packet type / state
                </Text>
                <NativeSelect
                  style={SELECT_STYLE}
                  value={effectiveState}
                  disabled={!target || !needsState}
                  onChange={(e) => setStateValue(e.target.value)}
                >
                  {!needsState ? (
                    <option value="">(no state)</option>
                  ) : (
                    target!.states.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))
                  )}
                </NativeSelect>
              </Box>
            </Flex>

            {/* Parameter table */}
            <Box>
              <Text fontSize="xs" color="text.muted" mb={1}>
                Parameters
              </Text>
              <Box
                border="1px solid"
                borderColor="border.default"
                borderRadius="control"
                overflow="hidden"
              >
              <Table.Root
                size="sm"
                css={{
                  "& thead th": {
                    backgroundColor: "var(--chakra-colors-bg-surfaceRaised)",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    fontSize: "0.6875rem",
                    color: "var(--chakra-colors-text-muted)",
                  },
                }}
              >
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeader>Field</Table.ColumnHeader>
                    <Table.ColumnHeader>Value</Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {!target ? (
                    <Table.Row>
                      <Table.Cell colSpan={2}>
                        <Text fontSize="sm" color="text.muted">
                          Select a target to fill in fields.
                        </Text>
                      </Table.Cell>
                    </Table.Row>
                  ) : (
                    <>
                      {target.kind === "actuator" && (
                        <Table.Row>
                          <Table.Cell>
                            <Text fontSize="xs" color="text.muted">type</Text>
                          </Table.Cell>
                          <Table.Cell>
                            <Mono fontSize="xs">{target.actuatorType}</Mono>
                          </Table.Cell>
                        </Table.Row>
                      )}
                      <Table.Row>
                        <Table.Cell>
                          <Text fontSize="xs" color="text.muted">name</Text>
                        </Table.Cell>
                        <Table.Cell>
                          <Mono fontSize="xs">{target.name}</Mono>
                        </Table.Cell>
                      </Table.Row>
                      <Table.Row>
                        <Table.Cell>
                          <Text fontSize="xs" color="text.muted">state</Text>
                        </Table.Cell>
                        <Table.Cell>
                          <Mono fontSize="xs" color={effectiveState ? "text.primary" : "text.muted"}>
                            {effectiveState || "—"}
                          </Mono>
                        </Table.Cell>
                      </Table.Row>
                    </>
                  )}
                </Table.Body>
              </Table.Root>
              </Box>
            </Box>

            {/* Live preview */}
            <Box>
              <Text fontSize="xs" color="text.muted" mb={1}>
                Command preview
              </Text>
              <Box
                bg="#0a0e16"
                border="1px solid"
                borderColor="border.default"
                borderRadius="control"
                p={3}
                fontFamily="mono"
                fontSize="xs"
                color="chrome.text"
                whiteSpace="pre-wrap"
                wordBreak="break-word"
                minH="44px"
              >
                {preview || <Box as="span" color="chrome.textMuted">— nothing composed —</Box>}
              </Box>
            </Box>

            {/* Send */}
            <Flex align="center" gap={3}>
              <Box
                as="button"
                onClick={canSend ? handleSend : undefined}
                aria-disabled={!canSend}
                px={4}
                py={2}
                borderRadius="control"
                fontSize="sm"
                fontWeight="600"
                bg={canSend ? "accent.solid" : "bg.surfaceRaised"}
                color={canSend ? "white" : "text.muted"}
                cursor={canSend ? "pointer" : "not-allowed"}
                border="1px solid"
                borderColor={canSend ? "accent.solid" : "border.default"}
                transition="all 0.15s"
                _hover={canSend ? { filter: "brightness(1.1)" } : {}}
              >
                {sending ? "Sending…" : "Send Command"}
              </Box>
              {!gate.canSend && gate.reason && (
                <Chip status="warn">{gate.reason}</Chip>
              )}
              {gate.canSend && missingState && (
                <Chip status="warn">Select a state</Chip>
              )}
              {!clientId && <Chip status="neutral">Not connected</Chip>}
            </Flex>
          </Flex>
        </Card>

        <TransmitPacket />
      </Flex>

      {/* Serial connection + console terminal */}
      <Flex direction="column" gap={4} flex="3" minW="320px">
        <SerialConnection />
      </Flex>
    </Flex>
  );
}

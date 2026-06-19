"use client";

import { useMemo, useState } from "react";
import { Box, Flex, Input, Text, chakra } from "@chakra-ui/react";
import { Card, Chip } from "@/components/primitives";
import { useNovaStore, sel } from "@/lib/store";
import { useConfig } from "@/hooks/useConfig";
import { sendConsoleCommand } from "@/lib/api";
import type { ConsoleCommand } from "@/lib/api";
import type { PacketEntry, PacketFieldDef } from "@/lib/types";
import { SELECT_STYLE, INPUT_PROPS } from "./controlStyles";

const NativeSelect = chakra("select");

// ---------------------------------------------------------------------------
// Built-in fallback packet defs — used only when config.Packets is empty, so
// the card still works before any Packets are authored on the Config page.
// ---------------------------------------------------------------------------

const FALLBACK_PACKETS: PacketEntry[] = [
  { name: "PWM Set (servo)", op: "pwm_set", fields: [
    { key: "board_id", type: "number", default: 0 },
    { key: "channel", type: "number", default: 0 },
    { key: "pulse_us", type: "number", default: 1500 },
    { key: "period_us", type: "number", default: 20000 },
  ]},
  { name: "Load Switch (relay)", op: "load_sw_set", fields: [
    { key: "board_id", type: "number", default: 0 },
    { key: "channel", type: "number", default: 0 },
    { key: "enable", type: "bool", default: false },
    { key: "hold_ms", type: "number", default: 0 },
  ]},
  { name: "IMC Arm", op: "imc_arm", fields: [
    { key: "board_id", type: "number", default: 0 },
    { key: "pulse_ms", type: "number", default: 0 },
  ]},
  { name: "IMC Disarm", op: "imc_disarm", fields: [
    { key: "board_id", type: "number", default: 0 },
    { key: "pulse_ms", type: "number", default: 0 },
  ]},
  { name: "Actuator Failsafe", op: "failsafe", fields: [
    { key: "board_id", type: "number", default: 0 },
  ]},
  { name: "Actuator Query", op: "actuator_query", fields: [
    { key: "board_id", type: "number", default: 0 },
    { key: "channel", type: "number", default: 0 },
  ]},
  { name: "Discover", op: "discover", fields: [] },
];

export function TransmitPacket() {
  const clientId = useNovaStore(sel.clientId);
  const role = useNovaStore(sel.sessionRole);
  const push = useNovaStore((s) => s.pushConsoleEntry);
  const { data: config } = useConfig();

  // Available packets are config-driven (fall back to built-ins when none set).
  const configPackets: PacketEntry[] = config?.Packets ?? [];
  const packets = configPackets.length > 0 ? configPackets : FALLBACK_PACKETS;
  const usingConfig = configPackets.length > 0;

  const canSend = (role === "operator" || role === "admin") && !!clientId;
  const gateReason = !clientId
    ? "Not connected"
    : !canSend
      ? "Operator or admin role required"
      : null;

  const [opIndexRaw, setOpIndex] = useState(0);
  const opIndex = Math.min(opIndexRaw, Math.max(packets.length - 1, 0));
  const opDef = packets[opIndex] ?? { name: "", op: "", fields: [] };
  const [fieldValues, setFieldValues] = useState<Record<string, string | boolean>>({});

  function fieldVal(f: PacketFieldDef): string | boolean {
    return fieldValues[`${opDef.op}.${f.key}`] ?? f.default ?? (f.type === "bool" ? false : "");
  }
  function setField(f: PacketFieldDef, v: string | boolean) {
    setFieldValues((prev) => ({ ...prev, [`${opDef.op}.${f.key}`]: v }));
  }

  const txCommand = useMemo<ConsoleCommand>(() => {
    const cmd: ConsoleCommand = { action: "tx", op: opDef.op };
    for (const f of opDef.fields) {
      const raw = fieldValues[`${opDef.op}.${f.key}`] ?? f.default ?? (f.type === "bool" ? false : 0);
      cmd[f.key] = f.type === "bool" ? Boolean(raw) : Number(raw);
    }
    return cmd;
  }, [opDef, fieldValues]);

  const preview = `POST /api/console/command ${JSON.stringify(txCommand)}`;

  async function transmit() {
    if (!clientId) return;
    push({ status: "info", kind: "command", text: `» tx ${opDef.op}` });
    try {
      await sendConsoleCommand(txCommand, clientId);
      push({ status: "nominal", kind: "tx", text: `✓ tx ${opDef.op} published` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      push({ status: "error", kind: "error", text: `✗ tx ${opDef.op}: ${msg}` });
    }
  }

  return (
    <Card title="Transmit Packet (FAS)" headerAction={<Chip status="neutral">{usingConfig ? "config" : "built-in"}</Chip>}>
      <Flex direction="column" gap={3}>
        <Box>
          <Text fontSize="xs" color="text.muted" mb={1}>Packet</Text>
          <NativeSelect
            style={SELECT_STYLE}
            value={String(opIndex)}
            onChange={(e) => setOpIndex(Number(e.target.value))}
          >
            {packets.map((o, i) => <option key={`${o.op}-${i}`} value={i}>{o.name || o.op}</option>)}
          </NativeSelect>
        </Box>

        {opDef.fields.length > 0 && (
          <Flex gap={3} flexWrap="wrap">
            {opDef.fields.map((f) => (
              <Box key={f.key} minW="120px" flex="1">
                <Text fontSize="xs" color="text.muted" mb={1}>{f.label ?? f.key}</Text>
                {f.type === "bool" ? (
                  <NativeSelect
                    style={SELECT_STYLE}
                    value={fieldVal(f) ? "1" : "0"}
                    onChange={(e) => setField(f, e.target.value === "1")}
                  >
                    <option value="0">false</option>
                    <option value="1">true</option>
                  </NativeSelect>
                ) : (
                  <Input
                    size="sm"
                    type="number"
                    fontFamily="mono"
                    value={String(fieldVal(f))}
                    onChange={(e) => setField(f, e.target.value)}
                    {...INPUT_PROPS}
                  />
                )}
              </Box>
            ))}
          </Flex>
        )}

        <Box>
          <Text fontSize="xs" color="text.muted" mb={1}>Preview</Text>
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
          >
            {preview}
          </Box>
        </Box>

        <Flex align="center" gap={3}>
          <Box
            as="button"
            onClick={canSend ? transmit : undefined}
            aria-disabled={!canSend}
            px={4}
            py={2}
            borderRadius="control"
            fontSize="sm"
            fontWeight="600"
            bg={canSend ? "accent.solid" : "bg.surfaceRaised"}
            color={canSend ? "white" : "text.muted"}
            border="1px solid"
            borderColor={canSend ? "accent.solid" : "border.default"}
            cursor={canSend ? "pointer" : "not-allowed"}
            _hover={canSend ? { filter: "brightness(1.1)" } : {}}
          >
            Transmit
          </Box>
          {gateReason && <Chip status="warn">{gateReason}</Chip>}
        </Flex>
      </Flex>
    </Card>
  );
}

"use client";

import { useState } from "react";
import { Box, Flex, Input, Text } from "@chakra-ui/react";
import { Card, Chip, Mono } from "@/components/primitives";
import { useCommandGate } from "@/hooks/useCommandGate";
import type { PmbStatus } from "@/lib/flight/types";
import { FlagDot, Readout, num } from "./shared";

export interface ChargerCardProps {
  boardKey: string;
  charger: NonNullable<PmbStatus["charger"]>;
  /** Firmware charge DAC read-back (`fas_pmb[key].chg_cfg`). */
  chgCfg?: PmbStatus["chgCfg"];
  stale?: boolean;
}

const INPUT_PROPS = {
  size: "sm" as const,
  bg: "bg.canvas",
  borderColor: "border.default",
  fontFamily: "mono",
  _focusVisible: { borderColor: "accent.solid" },
};

export function ChargerCard({ boardKey, charger, chgCfg, stale = false }: ChargerCardProps) {
  // Control state — enable defaults OFF (safety).
  const [enable, setEnable] = useState(false);
  const [chargeCurrent, setChargeCurrent] = useState("");
  const [maxVPerCell, setMaxVPerCell] = useState("");

  // Charger control is a command write → gate on role + physical lockout.
  const gate = useCommandGate({ name: "CHARGER", state: enable ? "on" : "off" });

  function applyChargerSettings() {
    // TODO(backend): no charger-control command exists yet. When the backend
    // adds one (e.g. POST /api/commands with an LTC4162 charger payload, or a
    // dedicated system-command), dispatch it here — gated by `gate.canSend`.
    // Intentionally a no-op until that endpoint exists; do not invent one.
  }

  const canApply = gate.canSend;

  return (
    <Card title={`${boardKey} · LTC4162 charger`} flex="1" minW="320px">
      {/* Telemetry */}
      <Box opacity={stale ? 0.55 : 1} transition="opacity 0.2s" mb={4}>
        <Flex gap={6} flexWrap="wrap" mb={3}>
          <Flex direction="column" gap={1} flex="1" minW="130px">
            <Readout label="VBAT" value={num(charger.vBat, " V")} />
            <Readout label="charge current" value={num(charger.iChg, " A")} />
            <Readout label="cells" value={charger.cells != null ? String(charger.cells) : "—"} />
          </Flex>
          <Flex direction="column" gap={1} flex="1" minW="130px">
            <Readout label="state" value={charger.state ?? "—"} />
            <Readout label="status" value={charger.status ?? "—"} />
          </Flex>
        </Flex>
        <Flex gap={4} flexWrap="wrap">
          <FlagDot label="present" value={charger.present} />
          <FlagDot label="VIN good" value={charger.vinGood} />
          <FlagDot label="charging" value={charger.charging} />
          <FlagDot label="enabled" value={charger.enabled} />
        </Flex>

        {/* Firmware DAC read-back — what the charger is actually configured to. */}
        {chgCfg && (
          <Box borderTop="1px solid" borderColor="border.default" mt={3} pt={3}>
            <Flex align="center" justify="space-between" mb={2}>
              <Text fontSize="2xs" color="text.muted" textTransform="uppercase" letterSpacing="0.06em">
                Firmware limits
              </Text>
              {chgCfg.vlimit === true && <Chip status="warn">cutoff active</Chip>}
            </Flex>
            <Flex gap={6} flexWrap="wrap">
              <Flex direction="column" gap={1} flex="1" minW="130px">
                <Readout
                  label="I setting"
                  value={chgCfg.iSetting != null ? `${chgCfg.iSetting} / 31` : "—"}
                />
                <Readout
                  label="V setting"
                  value={chgCfg.vSetting != null ? `${chgCfg.vSetting} / 31` : "—"}
                />
              </Flex>
              <Flex direction="column" gap={1} flex="1" minW="130px">
                <Readout
                  label="cells"
                  value={chgCfg.cells != null ? String(chgCfg.cells) : "—"}
                />
              </Flex>
            </Flex>
          </Box>
        )}
      </Box>

      {/* Control (telemetry-backed; command path pending backend) */}
      <Box borderTop="1px solid" borderColor="border.default" pt={3}>
        <Flex align="center" justify="space-between" mb={2}>
          <Text fontSize="2xs" color="text.muted" textTransform="uppercase" letterSpacing="0.06em">
            Charger control
          </Text>
          <Chip status="warn">backend cmd pending</Chip>
        </Flex>

        <Flex align="center" gap={2} mb={3}>
          <Box
            as="button"
            onClick={() => setEnable((v) => !v)}
            px={3}
            py={1}
            borderRadius="chip"
            fontSize="xs"
            fontFamily="mono"
            fontWeight="700"
            border="1px solid"
            bg={enable ? "color-mix(in srgb, var(--chakra-colors-nominal) 16%, transparent)" : "bg.surfaceRaised"}
            borderColor={enable ? "nominal" : "border.default"}
            color={enable ? "nominal" : "text.muted"}
            cursor="pointer"
          >
            {enable ? "ENABLE" : "DISABLED"}
          </Box>
          <Text fontSize="2xs" color="text.muted">default off</Text>
        </Flex>

        <Flex gap={3} mb={3} flexWrap="wrap">
          <Box flex="1" minW="130px">
            <Text fontSize="2xs" color="text.muted" mb={1}>charge current (A)</Text>
            <Input {...INPUT_PROPS} type="number" value={chargeCurrent} placeholder="—" onChange={(e) => setChargeCurrent(e.target.value)} />
          </Box>
          <Box flex="1" minW="130px">
            <Text fontSize="2xs" color="text.muted" mb={1}>max V / cell</Text>
            <Input {...INPUT_PROPS} type="number" value={maxVPerCell} placeholder="—" onChange={(e) => setMaxVPerCell(e.target.value)} />
          </Box>
        </Flex>

        <Flex align="center" gap={3}>
          <Box
            as="button"
            onClick={canApply ? applyChargerSettings : undefined}
            aria-disabled={!canApply}
            px={4}
            py={2}
            borderRadius="control"
            fontSize="sm"
            fontWeight="600"
            bg={canApply ? "accent.solid" : "bg.surfaceRaised"}
            color={canApply ? "white" : "text.muted"}
            border="1px solid"
            borderColor={canApply ? "accent.solid" : "border.default"}
            cursor={canApply ? "pointer" : "not-allowed"}
            _hover={canApply ? { filter: "brightness(1.1)" } : {}}
          >
            Apply
          </Box>
          {gate.reason && <Chip status="warn">{gate.reason}</Chip>}
        </Flex>
        <Text fontSize="2xs" color="text.muted" mt={2}>
          Control wired through the role + lockout gate; the backend charger command does not exist yet.
        </Text>
      </Box>
    </Card>
  );
}

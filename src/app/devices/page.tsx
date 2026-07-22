"use client";

import { Box, Flex, Text } from "@chakra-ui/react";
import { PageHeader } from "@/components/shell";
import { Chip } from "@/components/primitives";
import { useNovaStore } from "@/lib/store/store";
import { sel } from "@/lib/store/selectors";
import { useConfig } from "@/hooks/useConfig";
import type { DeviceEntry, DeviceRange } from "@/lib/types";
import {
  BoardFleetStrip,
  EpbPowerCard,
  PmbPowerCard,
  ChargerCard,
  DiagnosticsCard,
} from "@/components/devices";

// ---------------------------------------------------------------------------
// Devices — FAS avionics fleet & power management (NOVA_OPS_IMPLEMENTATION_PLAN
// §13.3). All telemetry comes from the live flightData store slice via the
// flight adapter; no new backend calls for the monitoring portions.
// ---------------------------------------------------------------------------

const STATUS_CHIP: Record<string, { status: "nominal" | "warn" | "error" | "neutral"; label: string }> = {
  live:         { status: "nominal", label: "live" },
  stale:        { status: "warn",    label: "stale" },
  connecting:   { status: "neutral", label: "connecting" },
  disconnected: { status: "neutral", label: "disconnected" },
  error:        { status: "error",   label: "error" },
};

export default function DevicesPage() {
  const telemetry = useNovaStore(sel.flightData);
  const status = useNovaStore(sel.flightDataStatus);
  const stale = status === "stale";
  const { data: config } = useConfig();

  // config.Devices[].ranges keyed by board key → chart Y-ranges.
  const rangesByKey: Record<string, Record<string, DeviceRange>> = {};
  for (const d of (config?.Devices ?? []) as DeviceEntry[]) {
    if (d.key && d.ranges) rangesByKey[d.key] = d.ranges;
  }

  const boards = telemetry?.boards ?? [];
  const boardPower = telemetry?.boardPower ?? {};
  const pmb = telemetry?.pmb ?? {};

  const epbKeys = Object.keys(boardPower);
  const pmbKeys = Object.keys(pmb);
  const chargerKeys = pmbKeys.filter((k) => pmb[k]?.charger);

  const chip = STATUS_CHIP[status] ?? STATUS_CHIP.disconnected;
  const hasAny = boards.length > 0 || epbKeys.length > 0 || pmbKeys.length > 0;

  return (
    <Box>
      <PageHeader
        title="Devices"
        subtitle="Avionics fleet · power"
        action={<Chip status={chip.status}>{chip.label}</Chip>}
      />

      {!hasAny ? (
        <Flex direction="column" align="center" justify="center" py={16} gap={2} color="text.muted">
          <Text fontSize="sm">No FAS telemetry yet.</Text>
          <Text fontSize="xs">Board fleet & power data appear here once the FAS stack is reporting.</Text>
        </Flex>
      ) : (
        <Flex direction="column" gap={4}>
          {/* Fleet roster — full width */}
          <BoardFleetStrip boards={boards} stale={stale} />

          {/* EPB bus power — one card per EPB rail set */}
          {epbKeys.length > 0 && (
            <Flex gap={4} align="flex-start" flexWrap="wrap">
              {epbKeys.map((k) => (
                <EpbPowerCard key={k} boardKey={k} power={boardPower[k]} stale={stale} ranges={rangesByKey[k]} />
              ))}
            </Flex>
          )}

          {/* PMB power management — one card per PMB */}
          {pmbKeys.length > 0 && (
            <Flex gap={4} align="flex-start" flexWrap="wrap">
              {pmbKeys.map((k) => (
                <PmbPowerCard key={k} boardKey={k} pmb={pmb[k]} stale={stale} ranges={rangesByKey[k]} />
              ))}
            </Flex>
          )}

          {/* Charger control + diagnostics */}
          <Flex gap={4} align="flex-start" flexWrap="wrap">
            {chargerKeys.map((k) => (
              <ChargerCard
                key={k}
                boardKey={k}
                charger={pmb[k]!.charger!}
                chgCfg={pmb[k]!.chgCfg}
                stale={stale}
              />
            ))}
            <DiagnosticsCard />
          </Flex>
        </Flex>
      )}
    </Box>
  );
}

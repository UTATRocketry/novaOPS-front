"use client";

import { useState } from "react";
import { Box, Button, Flex, Text } from "@chakra-ui/react";
import { Card, Mono } from "@/components/primitives";
import { useNovaStore } from "@/lib/store/store";
import { sel } from "@/lib/store/selectors";
import { sendFasAux, sendFasRf } from "@/lib/api/direct";
import type { FmcAuxStatus, FmcRfStatus, FmcStatus } from "@/lib/flight/types";

export interface FmcAuxCardProps {
  fmc: FmcStatus | undefined;
  aux?: FmcAuxStatus;
  rf?: FmcRfStatus;
  /** Node addressed by the aux / RF commands. */
  node?: string;
}

interface Cell {
  label: string;
  value: string;
}

function num(v: number | undefined, suffix = "", digits = 1): string {
  return v !== undefined ? `${v.toFixed(digits)}${suffix}` : "—";
}

function group(title: string, cells: Cell[]) {
  return (
    <Box key={title} flex="1" minW="140px">
      <Text
        fontSize="2xs"
        color="text.muted"
        textTransform="uppercase"
        letterSpacing="0.06em"
        mb={2}
      >
        {title}
      </Text>
      <Flex direction="column" gap={1}>
        {cells.map((c) => (
          <Flex key={c.label} align="baseline" justify="space-between" gap={2}>
            <Text fontSize="xs" color="text.muted">{c.label}</Text>
            <Mono fontSize="xs" color="text.primary">{c.value}</Mono>
          </Flex>
        ))}
      </Flex>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// RF rate / power mode
//
// The mode is persisted on the FMC and echoed ~1 Hz. This control is display-only
// until the operator picks a mode — it must never push a default on mount, which
// would clobber the FMC's stored choice.
// ---------------------------------------------------------------------------

const RF_MODES: Array<{ mode: 0 | 1 | 2; label: string; hint: string }> = [
  { mode: 0, label: "low",    hint: "power-saving (default)" },
  { mode: 1, label: "normal", hint: "normal rate" },
  { mode: 2, label: "high",   hint: "bench / close-range" },
];

function RfModeControl({ rf, node }: { rf: FmcRfStatus | undefined; node: string }) {
  const clientId   = useNovaStore(sel.clientId);
  const canCommand = useNovaStore(sel.canCommand);
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const current = rf?.rateMode;
  const disabled = !clientId || !canCommand || busy;

  async function pick(mode: 0 | 1 | 2) {
    if (!clientId || mode === current) return;
    setBusy(true);
    setError(null);
    try {
      await sendFasRf({ node, mode }, clientId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box flex="1" minW="180px">
      <Text fontSize="2xs" color="text.muted" textTransform="uppercase" letterSpacing="0.06em" mb={2}>
        RF rate / power
      </Text>
      <Flex align="baseline" justify="space-between" gap={2} mb={2}>
        <Text fontSize="xs" color="text.muted">mode</Text>
        <Mono fontSize="xs" color="text.primary">
          {rf?.rateName ?? (current !== undefined ? RF_MODES[current]?.label ?? String(current) : "—")}
        </Mono>
      </Flex>
      <Flex gap={1}>
        {RF_MODES.map((m) => (
          <Button
            key={m.mode}
            size="xs"
            flex="1"
            variant={current === m.mode ? "solid" : "outline"}
            disabled={disabled}
            onClick={() => pick(m.mode)}
            title={m.hint}
          >
            {m.label}
          </Button>
        ))}
      </Flex>
      <Text fontSize="2xs" color="text.muted" mt={1}>
        low = power-saving (default)
      </Text>
      {error && <Text fontSize="2xs" color="fault" mt={1}>{error}</Text>}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// RFD / RunCam load-switch power
// ---------------------------------------------------------------------------

function PowerToggle({
  label, device, powered, node,
}: {
  label: string;
  device: "rfd" | "runcam";
  powered: boolean | undefined;
  node: string;
}) {
  const clientId   = useNovaStore(sel.clientId);
  const canCommand = useNovaStore(sel.canCommand);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    // Unknown power state → no defensible target to send; leave it to telemetry.
    if (!clientId || powered === undefined) return;
    setBusy(true);
    try {
      await sendFasAux({ node, device, enable: !powered }, clientId);
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      size="xs"
      variant="outline"
      flex="1"
      colorPalette={powered === undefined ? "gray" :powered ? "green" : "red"}
      loading={busy}
      disabled={!clientId || !canCommand || powered === undefined}
      onClick={toggle}
    >
      {label} {powered === undefined ? "—" : powered ? "on" : "off"}
    </Button>
  );
}

export function FmcAuxCard({ fmc, aux, rf, node = "FMC_0" }: FmcAuxCardProps) {
  const temp = fmc?.temp;
  const radio = fmc?.radio;
  const canCommand = useNovaStore(sel.canCommand);

  return (
    <Card title="FMC Onboard">
      <Flex gap={6} flexWrap="wrap">
        {group("board temps", [
          { label: "near H7",     value: num(temp?.h7, " °C") },
          { label: "power stage", value: num(temp?.pwr, " °C") },
        ])}
        {group("RFD900x radio", [
          { label: "power",  value: radio?.powered === undefined ? "—" : radio.powered ? "on" : "off" },
          { label: "mirror", value: radio?.enabled === undefined ? "—" : radio.enabled ? "on" : "off" },
          { label: "frames", value: num(radio?.txFrames, "", 0) },
        ])}
        {group("peripherals", [
          { label: "RunCam",   value: aux?.runcamPowered === undefined ? "—" : aux.runcamPowered ? "on" : "off" },
          { label: "GNSS PPS", value: aux?.ppsPresent === undefined ? "—" : aux.ppsPresent ? "lock" : "no" },
          { label: "PPS age",  value: aux?.ppsAgeMs === undefined ? "—" : `${(aux.ppsAgeMs / 1000).toFixed(1)} s` },
        ])}
        <RfModeControl rf={rf} node={node} />
      </Flex>

      {canCommand && (
        <Flex gap={2} mt={3} pt={3} borderTop="1px solid" borderColor="border.default">
          <PowerToggle label="RFD" device="rfd" powered={radio?.powered} node={node} />
          <PowerToggle label="RunCam" device="runcam" powered={aux?.runcamPowered} node={node} />
        </Flex>
      )}
    </Card>
  );
}

"use client";

import { useState } from "react";
import { Box, Button, Flex, Text } from "@chakra-ui/react";
import { Card, Chip, Mono } from "@/components/primitives";
import { FlagDot } from "@/components/devices/shared";
import { useNovaStore } from "@/lib/store/store";
import { sel } from "@/lib/store/selectors";
import { sendFasRab } from "@/lib/api/direct";
import type { RabStatus } from "@/lib/flight/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** "RAB:0" → "A". Falls back to the raw id when it is outside the known pair. */
function rabLabel(rabId: number): string {
  return rabId === 0 ? "A" : rabId === 1 ? "B" : String(rabId);
}

function onOff(v: boolean | undefined): string {
  return v === undefined ? "—" : v ? "high" : "low";
}

// ---------------------------------------------------------------------------
// Arm / disarm controls
// ---------------------------------------------------------------------------

interface RabArmControlsProps {
  rabId: number;
  armExpected: boolean;
}

/**
 * Pyro-adjacent arming. Two guards beyond the role check:
 *  - ARM is blocked while the physical lockout is engaged (or its state is
 *    unknown — `sel.isLocked` treats non-live as locked). DISARM is always
 *    permitted for a commanding role: moving toward the safe state must never
 *    be gated on a link we may have just lost.
 *  - Both actions require an explicit second click to confirm.
 */
function RabArmControls({ rabId, armExpected }: RabArmControlsProps) {
  const clientId   = useNovaStore(sel.clientId);
  const canCommand = useNovaStore(sel.canCommand);
  const isLocked   = useNovaStore(sel.isLocked);

  const [pending, setPending] = useState<"arm" | "disarm" | null>(null);
  const [busy, setBusy]       = useState(false);
  const [result, setResult]   = useState<string | null>(null);

  // rab_id is typed 0 | 1 on the wire; anything else is not addressable.
  const addressable = rabId === 0 || rabId === 1;
  const connected   = !!clientId && addressable;

  async function send(action: "arm" | "disarm") {
    if (!clientId || !addressable) return;
    setBusy(true);
    try {
      await sendFasRab({ action, rab_id: rabId as 0 | 1 }, clientId);
      setResult(`${action} sent`);
      setPending(null);
    } catch (e) {
      setResult(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  if (!canCommand) {
    return (
      <Text fontSize="2xs" color="text.muted" mt={2}>
        Operator role required to arm
      </Text>
    );
  }

  if (pending) {
    return (
      <Flex direction="column" gap={1} mt={2}>
        <Text fontSize="2xs" color={pending === "arm" ? "fault" : "warn"}>
          {pending === "arm" ? `Arm RAB ${rabLabel(rabId)}?` : `Disarm RAB ${rabLabel(rabId)}?`}
        </Text>
        <Flex gap={2}>
          <Button
            size="xs"
            colorPalette={pending === "arm" ? "red" : "orange"}
            onClick={() => send(pending)}
            loading={busy}
            disabled={!connected}
          >
            Confirm
          </Button>
          <Button size="xs" variant="ghost" onClick={() => setPending(null)} disabled={busy}>
            Cancel
          </Button>
        </Flex>
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap={1} mt={2}>
      <Flex gap={2}>
        <Button
          size="xs"
          variant="outline"
          colorPalette="red"
          onClick={() => setPending("arm")}
          disabled={!connected || isLocked || armExpected}
          title={isLocked ? "Physical lockout active" : undefined}
        >
          Arm
        </Button>
        <Button
          size="xs"
          variant="outline"
          onClick={() => setPending("disarm")}
          disabled={!connected || !armExpected}
        >
          Disarm
        </Button>
      </Flex>
      {isLocked && !armExpected && (
        <Text fontSize="2xs" color="warn">Physical lockout active</Text>
      )}
      {!clientId && <Text fontSize="2xs" color="text.muted">Not connected</Text>}
      {result && <Mono fontSize="2xs" color="text.muted">{result}</Mono>}
    </Flex>
  );
}

// ---------------------------------------------------------------------------
// Per-RAB column
// ---------------------------------------------------------------------------

function RabColumn({ boardKey, rab }: { boardKey: string; rab: RabStatus }) {
  return (
    <Box flex="1" minW="150px">
      <Flex align="center" gap={2} mb={2}>
        <Text fontSize="2xs" color="text.muted" textTransform="uppercase" letterSpacing="0.06em">
          RAB {rabLabel(rab.rabId)}
        </Text>
        <FlagDot label={rab.online === false ? "offline" : "online"} value={rab.online} />
      </Flex>

      {/* Alarms first — these are the reason to look at this card. */}
      <Flex direction="column" gap={1} mb={2}>
        {rab.armMismatch && (
          <Chip status="fault" title="commanded arm state disagrees with readback">
            <Mono>ARM MISMATCH</Mono>
          </Chip>
        )}
        {!rab.fmcRx && (
          <Chip status="warn" title="RAB is not hearing the FMC">
            <Mono>LINK DOWN</Mono>
          </Chip>
        )}
      </Flex>

      <Flex direction="column" gap={1}>
        <Flex align="baseline" justify="space-between" gap={2}>
          <Text fontSize="xs" color="text.muted">FC armed</Text>
          <Mono fontSize="xs" color={rab.fcArmed ? "fault" : "text.primary"}>
            {rab.fcArmed ? "ARMED" : "safe"}
          </Mono>
        </Flex>
        <Flex align="baseline" justify="space-between" gap={2}>
          <Text fontSize="xs" color="text.muted">expected</Text>
          <Mono fontSize="xs" color={rab.armMismatch ? "fault" : "text.primary"}>
            {rab.armExpected ? "ARMED" : "safe"}
          </Mono>
        </Flex>
        <Flex align="baseline" justify="space-between" gap={2}>
          <Text fontSize="xs" color="text.muted">ARM line</Text>
          <Mono fontSize="xs" color="text.primary">{onOff(rab.armLine)}</Mono>
        </Flex>
        <Flex align="baseline" justify="space-between" gap={2}>
          <Text fontSize="xs" color="text.muted">DISARM line</Text>
          <Mono fontSize="xs" color="text.primary">{onOff(rab.disarmLine)}</Mono>
        </Flex>
        <Flex align="baseline" justify="space-between" gap={2}>
          <Text fontSize="xs" color="text.muted">FMC link</Text>
          <Mono fontSize="xs" color={rab.fmcRx ? "text.primary" : "warn"}>
            {rab.fmcRx ? "up" : "down"}
          </Mono>
        </Flex>
        <Flex align="baseline" justify="space-between" gap={2}>
          <Text fontSize="xs" color="text.muted">RX count</Text>
          <Mono fontSize="xs" color="text.primary">
            {rab.rxCount8 !== undefined ? String(rab.rxCount8) : "—"}
          </Mono>
        </Flex>
      </Flex>

      <Flex gap={3} mt={2} flexWrap="wrap">
        <FlagDot label="FMC read" value={rab.fcArmedGpio} />
      </Flex>

      <Box borderTop="1px solid" borderColor="border.default" mt={2} pt={1}>
        <Text fontSize="2xs" color="text.muted">{boardKey}</Text>
        <RabArmControls rabId={rab.rabId} armExpected={rab.armExpected} />
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// RabCard
// ---------------------------------------------------------------------------

export interface RabCardProps {
  rab?: Record<string, RabStatus>;
}

/**
 * Recovery Arming Boards (A / B).
 *
 * Renders even when `fas_rab` is absent — a recovery board that has stopped
 * reporting is itself information, so the card shows `—` rather than hiding.
 */
export function RabCard({ rab }: RabCardProps) {
  const entries = rab ? Object.entries(rab).sort(([a], [b]) => a.localeCompare(b)) : [];
  const anyMismatch = entries.some(([, r]) => r.armMismatch);

  return (
    <Card
      title="Recovery Arming"
      headerAction={anyMismatch ? <Chip status="fault"><Mono>ALARM</Mono></Chip> : undefined}
    >
      {entries.length === 0 ? (
        <Flex direction="column" gap={1}>
          <Text fontSize="xs" color="text.muted">No RAB telemetry</Text>
          <Flex align="baseline" justify="space-between" gap={2}>
            <Text fontSize="xs" color="text.muted">RAB A</Text>
            <Mono fontSize="xs" color="text.muted">—</Mono>
          </Flex>
          <Flex align="baseline" justify="space-between" gap={2}>
            <Text fontSize="xs" color="text.muted">RAB B</Text>
            <Mono fontSize="xs" color="text.muted">—</Mono>
          </Flex>
        </Flex>
      ) : (
        <Flex gap={6} flexWrap="wrap">
          {entries.map(([key, value]) => (
            <RabColumn key={key} boardKey={key} rab={value} />
          ))}
        </Flex>
      )}
    </Card>
  );
}

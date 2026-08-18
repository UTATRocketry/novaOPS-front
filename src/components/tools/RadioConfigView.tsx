"use client";

import { Box, Flex, Text } from "@chakra-ui/react";
import { Card, Chip, Mono } from "@/components/primitives";
import { useNovaStore } from "@/lib/store/store";
import { sel } from "@/lib/store/selectors";
import type { RadioConfigState } from "@/lib/flight/types";

// ---------------------------------------------------------------------------
// Read-only view of the FMC-authoritative radio configuration record
// (`fas_radio_cfg`, FMC_RADIO_CONFIG 0x3D).
//
// The record is the FMC's own copy: everything here is a read-back, not an
// intent. Editing is deliberately not implemented yet — the backend
// `POST /api/fas/radio_config` endpoint does not exist. `sendFasRadioConfig`
// in `lib/api/direct` is the hook for when it does.
// ---------------------------------------------------------------------------

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Flex align="baseline" justify="space-between" gap={3}>
      <Text fontSize="xs" color="text.muted">{label}</Text>
      <Mono fontSize="xs" color="text.primary">{value}</Mono>
    </Flex>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box flex="1" minW="240px">
      <Text
        fontSize="2xs"
        color="text.muted"
        textTransform="uppercase"
        letterSpacing="0.06em"
        mb={2}
      >
        {title}
      </Text>
      <Flex direction="column" gap={1}>{children}</Flex>
    </Box>
  );
}

function hz(v: number | undefined): string {
  if (v === undefined) return "—";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(3)} MHz`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)} kHz`;
  return `${v} Hz`;
}

function ms(v: number | undefined): string {
  return v === undefined ? "—" : `${v} ms`;
}

/** Peripheral bindings are `null` when the board/channel is unfitted. */
function binding(board: number | null | undefined, channel: number | null | undefined): string {
  if (board == null || channel == null) return "unfitted";
  return `EPB ${board} · ch ${channel}`;
}

function flag(v: boolean | undefined): string {
  return v === undefined ? "—" : v ? "yes" : "no";
}

function TransactionBadges({ state }: { state: RadioConfigState }) {
  return (
    <Flex gap={2} flexWrap="wrap" mb={4}>
      {state.statusName && (
        <Chip status={state.statusName === "applied" ? "nominal" : "info"}>
          <Mono>{state.statusName}</Mono>
        </Chip>
      )}
      <Chip status={state.persisted ? "nominal" : "warn"}>
        <Mono>{state.persisted ? "persisted" : "not persisted"}</Mono>
      </Chip>
      <Chip status={state.linkReady ? "nominal" : "warn"}>
        <Mono>{state.linkReady ? "link ready" : "link not ready"}</Mono>
      </Chip>
      <Chip status={state.readbackMatches === false ? "error" : state.readbackMatches ? "nominal" : "neutral"}>
        <Mono>
          {state.readbackMatches === false
            ? "readback MISMATCH"
            : state.readbackMatches
              ? "readback matches"
              : "readback unknown"}
        </Mono>
      </Chip>
      {state.placeholderId && (
        <Chip status="warn"><Mono>placeholder callsign</Mono></Chip>
      )}
      {state.validationError !== undefined && state.validationError !== 0 && (
        <Chip status="error"><Mono>validation error {state.validationError}</Mono></Chip>
      )}
    </Flex>
  );
}

export function RadioConfigView() {
  const telemetry = useNovaStore(sel.flightData);
  const state = telemetry?.radioConfig;

  if (!state) {
    return (
      <Card title="Vehicle radio configuration">
        <Text fontSize="sm" color="text.muted">
          No <Mono>fas_radio_cfg</Mono> block in the current telemetry. The FMC publishes the
          record on request; a backend that predates the STM32WL wave never sends it at all.
        </Text>
      </Card>
    );
  }

  if (state.decodeError) {
    return (
      <Card title="Vehicle radio configuration">
        <TransactionBadges state={state} />
        <Chip status="error"><Mono>decode failed</Mono></Chip>
        <Text fontSize="xs" color="text.muted" mt={2}>{state.decodeError}</Text>
        <Text fontSize="2xs" color="text.muted" mt={2}>
          The 88-byte record could not be unpacked. Nothing below can be trusted, so nothing is
          shown — check the firmware/bridge protocol versions.
        </Text>
      </Card>
    );
  }

  const cfg = state.config;
  if (!cfg) {
    return (
      <Card title="Vehicle radio configuration">
        <TransactionBadges state={state} />
        <Text fontSize="sm" color="text.muted" mt={2}>
          A transaction is in flight but no config record has been read back yet.
        </Text>
      </Card>
    );
  }

  const { lora, rfChain } = cfg;

  return (
    <Flex direction="column" gap={4}>
      <Card title="Vehicle radio configuration">
        <TransactionBadges state={state} />

        {state.placeholderId && (
          <Text fontSize="2xs" color="warn" mb={3}>
            Callsign is still the <Mono>XXXXXX</Mono> placeholder. This is a warning only —
            operation is deliberately never gated on it.
          </Text>
        )}

        <Flex gap={8} flexWrap="wrap">
          <Section title="identity">
            <Row label="callsign" value={cfg.callsign || "—"} />
            <Row label="network id" value={String(cfg.networkId)} />
            <Row label="vehicle node" value={String(cfg.vehicleNodeId)} />
            <Row label="allocation low" value={hz(cfg.allocationLowHz)} />
            <Row label="allocation high" value={hz(cfg.allocationHighHz)} />
            {state.generation !== undefined && (
              <Row label="generation" value={String(state.generation)} />
            )}
            {state.transactionId !== undefined && (
              <Row label="transaction" value={String(state.transactionId)} />
            )}
          </Section>

          <Section title="LoRa">
            <Row label="frequency" value={hz(lora.frequencyHz)} />
            <Row label="bandwidth" value={hz(lora.bandwidthHz)} />
            <Row label="power" value={`${lora.powerDbm} dBm`} />
            <Row label="spreading factor" value={`SF${lora.spreadingFactor}`} />
            <Row label="coding rate" value={lora.codingRate || "—"} />
            <Row label="preamble" value={`${lora.preambleSymbols} sym`} />
          </Section>

          <Section title="pressure channels">
            {cfg.pressureChannels.length === 0 ? (
              <Text fontSize="xs" color="text.muted">none selected</Text>
            ) : (
              cfg.pressureChannels.map((c, i) => (
                <Row key={`${c.boardId}-${c.channel}-${i}`} label={`stream ${i + 1}`} value={`EPB ${c.boardId} · ch ${c.channel}`} />
              ))
            )}
          </Section>
        </Flex>
      </Card>

      <Card title="RF chain">
        <Flex gap={8} flexWrap="wrap">
          <Section title="bindings">
            <Row label="RF amplifier" value={binding(rfChain.paBoardId, rfChain.paChannel)} />
            <Row label="RunCam" value={binding(rfChain.runcamBoardId, rfChain.runcamChannel)} />
          </Section>

          <Section title="duty cycle">
            <Row label="enabled" value={flag(rfChain.dutyCycle)} />
            <Row label="cycle period" value={ms(rfChain.cyclePeriodMs)} />
            <Row label="warmup" value={ms(rfChain.warmupMs)} />
            <Row label="tail" value={ms(rfChain.tailMs)} />
            <Row label="max on" value={ms(rfChain.maxOnMs)} />
            <Row label="min off" value={ms(rfChain.minOffMs)} />
          </Section>

          <Section title="camera & boot">
            <Row label="auto-stop" value={flag(rfChain.runcamAutostop)} />
            <Row label="auto-stop after" value={`${rfChain.runcamAutostopS} s`} />
            <Row label="record on power" value={flag(rfChain.recOnPower)} />
            <Row label="boot sound" value={flag(rfChain.bootSound)} />
          </Section>
        </Flex>

        {rfChain.recOnPower && (
          <Text fontSize="2xs" color="text.muted" mt={3}>
            Record-on-power is set: energising the camera rail starts a recording on its own.
          </Text>
        )}
      </Card>
    </Flex>
  );
}

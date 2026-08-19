"use client";

import { useState } from "react";
import { Box, Button, Flex, Input, Text } from "@chakra-ui/react";
import { Card, Chip, Mono } from "@/components/primitives";
import type { Status } from "@/components/primitives";
import { useNovaStore } from "@/lib/store/store";
import { sel } from "@/lib/store/selectors";
import { sendFasAux, sendFasRuncamRecord, withBackendSupport } from "@/lib/api/direct";
import type { FmcAuxStatus, FmcStatus } from "@/lib/flight/types";

export interface FmcAuxCardProps {
  fmc: FmcStatus | undefined;
  aux?: FmcAuxStatus;
  /** Node addressed by the aux / recording commands. */
  node?: string;
}

/** Firmware clamp on the RunCam auto-stop timer (12 h). */
const RUNCAM_AUTOSTOP_MAX_S = 43200;

interface Cell {
  label: string;
  value: string;
  /** Colour for the value — used to make faults and dropped frames stand out. */
  status?: Status;
}

function num(v: number | undefined, suffix = "", digits = 1): string {
  return v !== undefined ? `${v.toFixed(digits)}${suffix}` : "—";
}

function onOff(v: boolean | undefined, on = "on", off = "off"): string {
  return v === undefined ? "—" : v ? on : off;
}

function group(title: string, cells: Cell[]) {
  return (
    <Box key={title} flex="1" minW="150px">
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
            <Mono fontSize="xs" color={c.status ? c.status : "text.primary"}>{c.value}</Mono>
          </Flex>
        ))}
      </Flex>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// STM32WL radio rows
//
// `powered` is the rail's own read-back and `powerRequested` is what the
// operator asked for: they can disagree, and that disagreement is the state
// worth showing loudest after an outright fault.
// ---------------------------------------------------------------------------

function radioCells(radio: FmcStatus["radio"]): Cell[] {
  const powerValue =
    radio?.powered === undefined && radio?.powerRequested === undefined
      ? "—"
      : radio?.powered
        ? "on"
        : radio?.powerRequested
          ? "requested, not on"
          : "off";

  const configValue =
    radio?.configValid === undefined
      ? "—"
      : !radio.configValid
        ? "invalid"
        : radio.readbackMatches === false
          ? "valid / MISMATCH"
          : radio.readbackMatches
            ? "valid / matches"
            : "valid";

  const dropped = radio?.txDropped;

  return [
    {
      label: "fault",
      value: radio?.fault === undefined ? "—" : radio.fault ? "FAULT" : "none",
      status: radio?.fault ? "error" : undefined,
    },
    {
      label: "ready",
      value: onOff(radio?.ready, "yes", "no"),
      status: radio?.ready === false ? "warn" : undefined,
    },
    {
      label: "power",
      value: powerValue,
      status: powerValue === "requested, not on" ? "warn" : undefined,
    },
    {
      label: "config",
      value: configValue,
      status: configValue === "invalid" || configValue === "valid / MISMATCH" ? "warn" : undefined,
    },
    { label: "clock", value: onOff(radio?.clockCalibrated, "calibrated", "uncalibrated") },
    { label: "queue", value: num(radio?.queueDepth, "", 0) },
    {
      label: "tx",
      value:
        radio?.txAccepted === undefined && dropped === undefined
          ? "—"
          : `${num(radio?.txAccepted, "", 0)} ok / ${num(dropped, "", 0)} drop`,
      status: dropped !== undefined && dropped > 0 ? "warn" : undefined,
    },
  ];
}

// ---------------------------------------------------------------------------
// Aux rail power
//
// The vehicle modem rail (`radio`) is an FMC-local load switch. The RunCam and
// RF amplifier rails are EPB load switches driven through the actuator path, so
// they carry the same physical-lockout gate as the relay/servo tools.
// ---------------------------------------------------------------------------

function PowerToggle({
  label, device, powered, node, gated,
}: {
  label: string;
  device: "radio" | "runcam" | "rf_pa";
  powered: boolean | undefined;
  node: string;
  /** True for the EPB actuator rails, which the physical lockout blocks. */
  gated: boolean;
}) {
  const clientId   = useNovaStore(sel.clientId);
  const canCommand = useNovaStore(sel.canCommand);
  const isLocked   = useNovaStore(sel.isLocked);
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lockBlocked = gated && isLocked;
  // Unknown power state → no defensible target to send; leave it to telemetry.
  const disabled = !clientId || !canCommand || powered === undefined || lockBlocked;

  async function toggle() {
    if (!clientId || powered === undefined || lockBlocked) return;
    setBusy(true);
    setError(null);
    try {
      await withBackendSupport(label, () =>
        sendFasAux({ node, device, enable: !powered }, clientId),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box flex="1" minW="110px">
      <Button
        size="xs"
        variant="outline"
        width="100%"
        colorPalette={powered === undefined ? "gray" : powered ? "green" : "red"}
        loading={busy}
        disabled={disabled}
        title={lockBlocked ? "Nova lockout active" : undefined}
        onClick={toggle}
      >
        {label} {powered === undefined ? "—" : powered ? "on" : "off"}
      </Button>
      {lockBlocked && <Text fontSize="2xs" color="warn" mt={1}>Nova lockout active</Text>}
      {error && <Text fontSize="2xs" color="fault" mt={1}>{error}</Text>}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// RunCam recording
//
// Separate from RunCam *power*: with `recOnPower` set on the radio config
// record (the firmware default), energising the camera rail starts a recording
// by itself, so the two controls can disagree without anyone having pressed
// anything here.
// ---------------------------------------------------------------------------

function RuncamRecordControl({ aux, node }: { aux: FmcAuxStatus | undefined; node: string }) {
  const clientId   = useNovaStore(sel.clientId);
  const canCommand = useNovaStore(sel.canCommand);
  // Blank = send no autostop_s, which the FMC reads as "use my persisted
  // runcam_autostop_s". 0 is NOT that: 0 is an explicit "no timer at all", so
  // it must not be the default an operator gets without asking for it.
  const [autostop, setAutostop] = useState("");
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const disabled  = !clientId || !canCommand || busy;

  async function send(enable: boolean) {
    if (!clientId) return;
    setBusy(true);
    setError(null);
    try {
      const body: Parameters<typeof sendFasRuncamRecord>[0] = { node, enable };
      if (enable && autostop.trim() !== "") {
        // The firmware clamps too, but a silent server-side clamp is a bad
        // surprise — do it here so the operator sees the value that was sent.
        const parsed = Number(autostop);
        const seconds = Number.isFinite(parsed) ? Math.round(parsed) : 0;
        const clamped = Math.min(Math.max(seconds, 0), RUNCAM_AUTOSTOP_MAX_S);
        if (clamped !== seconds) setAutostop(String(clamped));
        body.autostop_s = clamped;
      }
      // Left blank the field is omitted entirely, so the FMC applies its own
      // persisted default instead of being told "never stop".
      await withBackendSupport("RunCam recording", () => sendFasRuncamRecord(body, clientId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  const countdown =
    aux?.runcamRecordS === undefined || aux.runcamRecordS === null
      ? "—"
      : `${aux.runcamRecordS} s`;

  return (
    <Box flex="1" minW="200px">
      <Text fontSize="2xs" color="text.muted" textTransform="uppercase" letterSpacing="0.06em" mb={2}>
        RunCam rail
      </Text>

      {/* Raising the 8V4 rail is what starts a recording and dropping it is what
          ends one — there is no record command and no way to ask the camera
          anything. So this shows the rail as the EPB echoed it and the FMC's own
          timer, and claims nothing about the camera itself. */}
      <Flex direction="column" gap={1} mb={2}>
        <Flex align="baseline" justify="space-between" gap={2}>
          <Text fontSize="xs" color="text.muted">rail</Text>
          <Mono fontSize="xs" color={aux?.runcamPowered ? "nominal" : "text.primary"}>
            {onOff(aux?.runcamPowered, "on", "off")}
          </Mono>
        </Flex>
        <Flex align="baseline" justify="space-between" gap={2}>
          <Text fontSize="xs" color="text.muted">auto-stop in</Text>
          <Mono fontSize="xs" color="text.primary">{countdown}</Mono>
        </Flex>
      </Flex>

      {canCommand && (
        <>
          <Flex gap={2} align="center" mb={1}>
            <Input
              size="xs"
              type="number"
              min={0}
              max={RUNCAM_AUTOSTOP_MAX_S}
              value={autostop}
              onChange={(e) => setAutostop(e.target.value)}
              bg="bg.canvas"
              borderColor="border.default"
              fontFamily="mono"
              flex="1"
              minW="70px"
              placeholder="FMC default"
              aria-label="RunCam auto-stop seconds (blank = FMC persisted default, 0 = no timer)"
            />
            <Button size="xs" variant="outline" colorPalette="green" disabled={disabled} onClick={() => send(true)}>
              Rail on
            </Button>
            <Button size="xs" variant="outline" disabled={disabled} onClick={() => send(false)}>
              Rail off
            </Button>
          </Flex>
          <Text fontSize="2xs" color="text.muted">
            auto-stop seconds, 0 = until stopped (max {RUNCAM_AUTOSTOP_MAX_S})
          </Text>
        </>
      )}

      <Text fontSize="2xs" color="text.muted" mt={1}>
        With rec-on-power set, powering the camera rail starts a recording by itself.
      </Text>
      {error && <Text fontSize="2xs" color="fault" mt={1}>{error}</Text>}
    </Box>
  );
}

export function FmcAuxCard({ fmc, aux, node = "FMC_0" }: FmcAuxCardProps) {
  const temp = fmc?.temp;
  const radio = fmc?.radio;
  const canCommand = useNovaStore(sel.canCommand);

  return (
    <Card title="FMC Onboard">
      {radio?.fault === true && (
        <Flex mb={3}>
          <Chip status="error">
            <Mono>
              radio fault{radio.lastFault ? ` · code ${radio.lastFault}` : ""}
            </Mono>
          </Chip>
        </Flex>
      )}

      <Flex gap={6} flexWrap="wrap">
        {group("board temps", [
          { label: "near H7",     value: num(temp?.h7, " °C") },
          { label: "power stage", value: num(temp?.pwr, " °C") },
        ])}
        {group("STM32WL radio", radioCells(radio))}
        {group("peripherals", [
          {
            label: "RunCam",
            value: onOff(aux?.runcamPowered),
          },
          {
            label: "RF amp",
            value:
              aux?.rfPaOn === undefined && aux?.rfPaRequested === undefined
                ? "—"
                : aux?.rfPaOn
                  ? aux?.rfPaCycling ? "on (cycling)" : "on"
                  : aux?.rfPaInhibited
                    ? "inhibited"
                    : aux?.rfPaRequested
                      ? "requested, not on"
                      : "off",
            status:
              aux?.rfPaInhibited || (aux?.rfPaRequested && aux?.rfPaOn === false) ? "warn" : undefined,
          },
          { label: "GNSS PPS", value: aux?.ppsPresent === undefined ? "—" : aux.ppsPresent ? "lock" : "no" },
          { label: "PPS age",  value: aux?.ppsAgeMs === undefined ? "—" : `${(aux.ppsAgeMs / 1000).toFixed(1)} s` },
        ])}
        <RuncamRecordControl aux={aux} node={node} />
      </Flex>

      {aux?.rfPaInhibited && (
        <Text fontSize="2xs" color="warn" mt={2}>
          RF amplifier inhibited — the firmware is holding the PA off because the modem is not
          ready. This is not a failed command.
        </Text>
      )}

      {canCommand && (
        <Flex gap={2} mt={3} pt={3} borderTop="1px solid" borderColor="border.default" flexWrap="wrap">
          <PowerToggle label="Radio" device="radio" powered={radio?.powered} node={node} gated={false} />
          <PowerToggle label="RunCam" device="runcam" powered={aux?.runcamPowered} node={node} gated />
          <PowerToggle label="RF amp" device="rf_pa" powered={aux?.rfPaOn} node={node} gated />
        </Flex>
      )}
    </Card>
  );
}

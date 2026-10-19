"use client";

import { useEffect, useRef, useState } from "react";
import { Box, Button, Flex, Input, Text } from "@chakra-ui/react";
import { Card, Chip, Mono } from "@/components/primitives";
import { useNovaStore } from "@/lib/store/store";
import { sel } from "@/lib/store/selectors";
import { sendFasCharger } from "@/lib/api/direct";
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

/** "PMB:0" → "PMB_0" (charger commands address the PMB node). */
function boardNode(boardKey: string): string {
  return boardKey.replace(":", "_").toUpperCase();
}

/** Parse a DAC-code input: "" → undefined (unchanged); otherwise clamp to 0..31, or null if invalid. */
function parseDac(raw: string): number | undefined | null {
  if (raw.trim() === "") return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 31) return null;
  return n;
}

export function ChargerCard({ boardKey, charger, chgCfg, stale = false }: ChargerCardProps) {
  const clientId   = useNovaStore(sel.clientId);
  const canCommand = useNovaStore(sel.canCommand);
  const isLocked   = useNovaStore(sel.isLocked);

  // DAC-code inputs, seeded once from the firmware read-back so the operator
  // edits the *actual* configured limits rather than a blank field.
  const [iSetting, setISetting] = useState("");
  const [vSetting, setVSetting] = useState("");
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current || !chgCfg) return;
    if (chgCfg.iSetting != null) setISetting(String(chgCfg.iSetting));
    if (chgCfg.vSetting != null) setVSetting(String(chgCfg.vSetting));
    seededRef.current = true;
  }, [chgCfg]);

  const [busy, setBusy]     = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const node = boardNode(boardKey);
  const canSend = canCommand && !!clientId;
  const gateReason = !canCommand
    ? "Operator role required"
    : !clientId
      ? "Not connected"
      :null;

  async function call(body: Parameters<typeof sendFasCharger>[0], ok: string) {
    if (!clientId) return;
    setBusy(true);
    setResult(null);
    try {
      await sendFasCharger(body, clientId);
      setResult(ok);
    } catch (e) {
      setResult(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  function setEnabled(enable: boolean) {
    // Plain enable/suspend — omit the DAC codes so the persisted limit is kept.
    call({ node, enable }, enable ? "Charging enabled" : "Charging suspended");
  }

  function applyLimits() {
    const i = parseDac(iSetting);
    const v = parseDac(vSetting);
    if (i === null || v === null) {
      setResult("DAC codes must be integers 0–31");
      return;
    }
    // Keep the current enable state; only push the codes the operator set.
    const body: Parameters<typeof sendFasCharger>[0] = { node, enable: charger.enabled ?? false };
    if (i !== undefined) body.i_setting = i;
    if (v !== undefined) body.v_setting = v;
    if (body.i_setting === undefined && body.v_setting === undefined) {
      setResult("No limits to apply");
      return;
    }
    call(body, "Limits applied");
  }

  const enabled = charger.enabled === true;

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
              <Flex gap={2} flexWrap="wrap">
                {chgCfg.vlimit === true && <Chip status="warn">voltage cutoff active</Chip>}
                {/* The LTC gate state cannot be proven, so no reading here is trustworthy. */}
                {chgCfg.controlUnknown === true && <Chip status="error">control state unknown</Chip>}
                {/* Flash write failed: the running state may not survive a reset. */}
                {chgCfg.persistError === true && <Chip status="warn">persist error</Chip>}
              </Flex>
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
                <Readout
                  label="auto-charge intent"
                  value={chgCfg.enabledIntent == null ? "—" : chgCfg.enabledIntent ? "on" : "off"}
                />
                <Readout
                  label="targets verified"
                  value={chgCfg.targetsOk == null ? "—" : chgCfg.targetsOk ? "yes" : "no"}
                />
              </Flex>
            </Flex>
          </Box>
        )}
      </Box>

      {/* Control */}
      <Box borderTop="1px solid" borderColor="border.default" pt={3}>
        <Flex align="center" justify="space-between" mb={2}>
          <Text fontSize="2xs" color="text.muted" textTransform="uppercase" letterSpacing="0.06em">
            Charger control
          </Text>
          <Chip status={enabled ? "nominal" : "neutral"}>
            <Mono>{enabled ? "enabled" : "off"}</Mono>
          </Chip>
        </Flex>

        {/* Enable / Suspend — charging is default-off; only started from here. */}
        <Flex align="center" gap={2} mb={3}>
          <Button
            size="sm"
            colorPalette="green"
            variant={enabled ? "solid" : "outline"}
            disabled={!canSend || busy || enabled}
            onClick={() => setEnabled(true)}
          >
            Enable
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!canSend || busy || !enabled}
            onClick={() => setEnabled(false)}
          >
            Suspend
          </Button>
          <Text fontSize="2xs" color="text.muted">default off</Text>
        </Flex>

        {/* DAC-code limits (LTC4162 codes 0..31, not amps/volts). */}
        <Flex gap={3} mb={3} flexWrap="wrap">
          <Box flex="1" minW="130px">
            <Text fontSize="2xs" color="text.muted" mb={1}>I setting (code 0–31)</Text>
            <Input
              {...INPUT_PROPS}
              type="number"
              min={0}
              max={31}
              value={iSetting}
              placeholder="unchanged"
              onChange={(e) => setISetting(e.target.value)}
            />
          </Box>
          <Box flex="1" minW="130px">
            <Text fontSize="2xs" color="text.muted" mb={1}>V setting (code 0–31)</Text>
            <Input
              {...INPUT_PROPS}
              type="number"
              min={0}
              max={31}
              value={vSetting}
              placeholder="unchanged"
              onChange={(e) => setVSetting(e.target.value)}
            />
          </Box>
        </Flex>

        <Flex align="center" gap={3}>
          <Button
            size="sm"
            colorPalette="blue"
            disabled={!canSend || busy}
            loading={busy}
            onClick={applyLimits}
          >
            Apply limits
          </Button>
          {gateReason && <Chip status="warn">{gateReason}</Chip>}
        </Flex>

        {result && (
          <Text fontSize="2xs" fontFamily="mono" color="text.muted" mt={2}>{result}</Text>
        )}
        <Text fontSize="2xs" color="text.muted" mt={2}>
          I/V are raw LTC4162 DAC codes (0–31), not amps/volts. Blank leaves the
          persisted limit unchanged.
        </Text>
      </Box>
    </Card>
  );
}

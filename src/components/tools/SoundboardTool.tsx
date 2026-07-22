"use client";

import { useState } from "react";
import { Box, Button, Flex, Text, chakra } from "@chakra-ui/react";
import { Card, Chip, Mono } from "@/components/primitives";
import { useNovaStore } from "@/lib/store/store";
import { sel } from "@/lib/store/selectors";
import { sendFasSound, type FasSoundBody } from "@/lib/api/direct";
import type { SoundClip, SoundStatus, SoundboardStatus } from "@/lib/flight/types";

const NativeInput = chakra("input");

// TODO(upload): clip upload (file → transcode → bulk stream to the FMC) is not
// implemented — `fas_bridge.py` has no bulk-TX upload path yet. Revisit once it does.

const CLIP_FORMATS: Record<number, string> = {
  1: "IMA-ADPCM",
  2: "PCM_S16",
};

function formatName(format: number | undefined): string {
  if (format === undefined) return "—";
  return CLIP_FORMATS[format] ?? String(format);
}

function kb(v: number | undefined): string {
  return v !== undefined ? `${v} kB` : "—";
}

// ---------------------------------------------------------------------------
// Status panel
// ---------------------------------------------------------------------------

function StatusPanel({ status }: { status: SoundStatus | undefined }) {
  const used = status?.usedKb;
  const cap = status?.capKb;
  const pctUsed = used !== undefined && cap !== undefined && cap > 0
    ? Math.min(100, (used / cap) * 100)
    : undefined;

  return (
    <Card title="Soundboard Status" style={{ flex: "1", minWidth: "220px" }}>
      <Flex direction="column" gap={2}>
        <Flex gap={2} flexWrap="wrap">
          {status?.tone && <Chip status="info"><Mono>tone</Mono></Chip>}
          {status?.busy && <Chip status="warn"><Mono>busy</Mono></Chip>}
          {status?.ulActive && <Chip status="warn"><Mono>upload active</Mono></Chip>}
          {status?.ulReady && <Chip status="nominal"><Mono>upload ready</Mono></Chip>}
        </Flex>

        <Flex align="baseline" justify="space-between" gap={2}>
          <Text fontSize="xs" color="text.muted">clips</Text>
          <Mono fontSize="xs">{status?.clipCount !== undefined ? String(status.clipCount) : "—"}</Mono>
        </Flex>
        <Flex align="baseline" justify="space-between" gap={2}>
          <Text fontSize="xs" color="text.muted">playing</Text>
          <Mono fontSize="xs">
            {status?.playingIdx === undefined
              ? "—"
              : status.playingIdx === null
                ? "idle"
                : `#${status.playingIdx}`}
          </Mono>
        </Flex>

        {/* Usage bar — only when both used and capacity are known. */}
        <Box>
          <Flex justify="space-between" mb={1}>
            <Text fontSize="2xs" color="text.muted">Used</Text>
            <Mono fontSize="2xs" color="text.muted">
              {kb(used)}{cap !== undefined ? ` / ${kb(cap)}` : ""}
            </Mono>
          </Flex>
          {pctUsed !== undefined && (
            <Box h="4px" bg="bg.surfaceRaised" borderRadius="full" overflow="hidden">
              <Box
                h="100%"
                w={`${pctUsed}%`}
                bg={pctUsed >= 95 ? "fault" : pctUsed >= 80 ? "warn" : "nominal"}
                borderRadius="full"
                style={{ transition: "width 400ms ease" }}
              />
            </Box>
          )}
        </Box>

        {/* Erase/clear progress — pct is 100 when idle. */}
        {status?.pct !== undefined && status.pct < 100 && (
          <Flex align="baseline" justify="space-between" gap={2}>
            <Text fontSize="xs" color="text.muted">progress</Text>
            <Mono fontSize="xs" color="warn">{status.pct}%</Mono>
          </Flex>
        )}
      </Flex>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// SoundboardTool
// ---------------------------------------------------------------------------

export function SoundboardTool() {
  const clientId   = useNovaStore(sel.clientId);
  const canCommand = useNovaStore(sel.canCommand);
  const telemetry  = useNovaStore(sel.flightData);

  const sound: SoundboardStatus | undefined = telemetry?.sound;
  const clips: SoundClip[] = sound?.clips ?? [];

  const [node, setNode]             = useState("FMC_0");
  const [volume, setVolume]         = useState(128);
  const [freqHz, setFreqHz]         = useState("");
  const [toneMs, setToneMs]         = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearAck, setClearAck]     = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const ready = !!clientId && canCommand;

  async function call(body: Omit<FasSoundBody, "node">) {
    if (!clientId) {
      setLastResult("No client ID — connect first");
      return;
    }
    try {
      await sendFasSound({ node, ...body }, clientId);
      setLastResult(`OK — ${body.action}`);
    } catch (e) {
      setLastResult(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function handleTone() {
    const body: Omit<FasSoundBody, "node"> = { action: "tone" };
    const f = Number(freqHz);
    const d = Number(toneMs);
    // Omit rather than send 0 — the firmware treats absent as "use default".
    if (freqHz.trim() !== "" && Number.isFinite(f) && f > 0) body.freq_hz = f;
    if (toneMs.trim() !== "" && Number.isFinite(d) && d > 0) body.ms = d;
    call(body);
  }

  function handleClear() {
    call({ action: "clear" });
    setConfirmClear(false);
    setClearAck(false);
  }

  return (
    <Flex gap={4} p={4} align="flex-start" flexWrap="wrap">
      <StatusPanel status={sound?.status} />

      {/* Clip list */}
      <Card title="Clips" style={{ flex: "2", minWidth: "300px" }}>
        <Flex direction="column" gap={2}>
          <Flex justify="space-between" align="center">
            <Text fontSize="2xs" color="text.muted">
              {clips.length > 0 ? `${clips.length} stored` : "No clip directory received"}
            </Text>
            <Button size="xs" variant="outline" disabled={!ready} onClick={() => call({ action: "list" })}>
              Refresh list
            </Button>
          </Flex>

          {clips.length === 0 ? (
            <Text fontSize="xs" color="text.muted">
              —
            </Text>
          ) : (
            <Flex direction="column" gap={1}>
              {clips.map((clip) => (
                <Flex
                  key={clip.idx}
                  align="center"
                  gap={2}
                  py={1}
                  borderBottom="1px solid"
                  borderColor="border.default"
                >
                  <Mono fontSize="xs" color="text.muted" w="28px">#{clip.idx}</Mono>
                  <Mono fontSize="xs" color="text.primary" flex="1">
                    {clip.name || "—"}
                  </Mono>
                  <Mono fontSize="2xs" color="text.muted">{formatName(clip.format)}</Mono>
                  <Mono fontSize="2xs" color="text.muted">
                    {clip.sampleRate !== undefined ? `${clip.sampleRate} Hz` : "—"}
                  </Mono>
                  <Mono fontSize="2xs" color="text.muted">
                    {clip.length !== undefined ? `${clip.length} B` : "—"}
                  </Mono>
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={!ready}
                    onClick={() => call({ action: "play", idx: clip.idx })}
                  >
                    Play
                  </Button>
                </Flex>
              ))}
            </Flex>
          )}

          <Flex gap={2} pt={1}>
            <Button size="xs" variant="outline" disabled={!ready} onClick={() => call({ action: "stop" })}>
              Stop
            </Button>
          </Flex>

          <Text fontSize="2xs" color="text.muted" pt={1}>
            Clip upload is not yet supported — the bridge has no bulk-TX upload path.
          </Text>
        </Flex>
      </Card>

      {/* Tone + volume + node */}
      <Card title="Tone / Output" style={{ flex: "1", minWidth: "240px" }}>
        <Flex direction="column" gap={3}>
          <Box>
            <Flex justify="space-between" mb={1}>
              <Text fontSize="2xs" color="text.muted">Volume</Text>
              <Mono fontSize="2xs" color="text.muted">{volume}</Mono>
            </Flex>
            <NativeInput
              type="range"
              min={0}
              max={255}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              w="100%"
              accentColor="var(--chakra-colors-accent-solid)"
            />
            <Button
              size="xs"
              variant="outline"
              mt={1}
              disabled={!ready}
              onClick={() => call({ action: "volume", volume })}
            >
              Set volume
            </Button>
          </Box>

          <Box borderTop="1px solid" borderColor="border.default" pt={3}>
            <Text fontSize="2xs" color="text.muted" mb={1}>
              Test tone — replaces the removed buzzer. Blank = firmware default.
            </Text>
            <Flex gap={2} mb={2}>
              <Box flex="1">
                <Text fontSize="2xs" color="text.muted" mb={1}>freq (Hz)</Text>
                <NativeInput
                  type="number"
                  value={freqHz}
                  placeholder="default"
                  onChange={(e) => setFreqHz(e.target.value)}
                  fontSize="xs"
                  fontFamily="mono"
                  bg="bg.canvas"
                  border="1px solid"
                  borderColor="border.default"
                  borderRadius="control"
                  px={2}
                  py={1}
                  w="100%"
                  color="text.primary"
                />
              </Box>
              <Box flex="1">
                <Text fontSize="2xs" color="text.muted" mb={1}>duration (ms)</Text>
                <NativeInput
                  type="number"
                  value={toneMs}
                  placeholder="default"
                  onChange={(e) => setToneMs(e.target.value)}
                  fontSize="xs"
                  fontFamily="mono"
                  bg="bg.canvas"
                  border="1px solid"
                  borderColor="border.default"
                  borderRadius="control"
                  px={2}
                  py={1}
                  w="100%"
                  color="text.primary"
                />
              </Box>
            </Flex>
            <Button size="sm" disabled={!ready} onClick={handleTone}>
              Test tone
            </Button>
          </Box>

          <Box borderTop="1px solid" borderColor="border.default" pt={3}>
            <Text fontSize="2xs" color="text.muted" mb={1}>Node</Text>
            <NativeInput
              type="text"
              value={node}
              onChange={(e) => setNode(e.target.value)}
              fontSize="xs"
              fontFamily="mono"
              bg="bg.canvas"
              border="1px solid"
              borderColor="border.default"
              borderRadius="control"
              px={2}
              py={1}
              w="100%"
              color="text.primary"
            />
          </Box>

          {/* Destructive — double confirm. */}
          <Box borderTop="1px solid" borderColor="border.default" pt={3}>
            {!confirmClear ? (
              <Button
                size="xs"
                variant="outline"
                colorPalette="red"
                disabled={!ready}
                onClick={() => setConfirmClear(true)}
              >
                Clear all clips
              </Button>
            ) : (
              <Flex direction="column" gap={2}>
                <Text fontSize="xs" color="fault">
                  This erases every stored clip on the FMC. Uploads are not yet
                  supported, so clips cannot be restored from here.
                </Text>
                <Flex
                  as="button"
                  align="center"
                  gap={2}
                  onClick={() => setClearAck((v) => !v)}
                  cursor="pointer"
                  fontSize="xs"
                  color={clearAck ? "fault" : "text.muted"}
                >
                  <Box
                    w="14px"
                    h="14px"
                    border="2px solid"
                    borderColor={clearAck ? "fault" : "border.default"}
                    borderRadius="sm"
                    bg={clearAck ? "fault" : "transparent"}
                    flexShrink={0}
                  />
                  I understand this is irreversible
                </Flex>
                <Flex gap={2}>
                  <Button
                    size="xs"
                    colorPalette="red"
                    disabled={!ready || !clearAck}
                    onClick={handleClear}
                  >
                    Yes, erase all
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => { setConfirmClear(false); setClearAck(false); }}
                  >
                    Cancel
                  </Button>
                </Flex>
              </Flex>
            )}
          </Box>

          {!canCommand && (
            <Text fontSize="xs" color="warn">Operator role required to send commands</Text>
          )}
          {!clientId && (
            <Text fontSize="xs" color="text.muted">Not connected</Text>
          )}
        </Flex>
      </Card>

      {lastResult && (
        <Box w="100%" px={1}>
          <Mono fontSize="xs" color="text.muted">{lastResult}</Mono>
        </Box>
      )}
    </Flex>
  );
}

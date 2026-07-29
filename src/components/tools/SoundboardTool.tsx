"use client";

import { useRef, useState } from "react";
import { Box, Button, Flex, Text, chakra } from "@chakra-ui/react";
import { Card, Chip, Mono } from "@/components/primitives";
import { useNovaStore } from "@/lib/store/store";
import { sel } from "@/lib/store/selectors";
import { sendFasSound, uploadFasSoundClip, type FasSoundBody } from "@/lib/api/direct";
import type { SoundClip, SoundStatus, SoundboardStatus } from "@/lib/flight/types";

const NativeInput = chakra("input");
const NativeSelect = chakra("select");

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

// ---------------------------------------------------------------------------
// Clip upload
//
// Multipart POST — the backend transcodes (ffmpeg) then the bridge streams the
// clip to the FMC. The HTTP call resolves when the backend hands off; the true
// "committed" signal is the clip count rising in `fas_sound.clips` (~1 s later),
// which the parent shows via the status panel's ulActive/ulReady chips.
// ---------------------------------------------------------------------------

const NAME_MAX = 24;

function UploadPanel({ node, ready }: { node: string; ready: boolean }) {
  const clientId = useNovaStore(sel.clientId);

  const [file, setFile]       = useState<File | null>(null);
  const [name, setName]       = useState("");
  const [format, setFormat]   = useState<"adpcm" | "pcm">("adpcm");
  const [highpass, setHighpass] = useState("");
  const [pitch, setPitch]     = useState("");
  const [busy, setBusy]       = useState(false);
  const [result, setResult]   = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const trimmedName = name.trim();
  const canUpload = ready && !busy && !!file && trimmedName.length > 0 && trimmedName.length <= NAME_MAX;

  async function handleUpload() {
    if (!clientId || !file || !trimmedName) return;
    setBusy(true);
    setResult(null);
    try {
      // Blank = omit, so the backend applies its own default (700 Hz / 0 st).
      const hp = Number(highpass);
      const st = Number(pitch);
      const res = await uploadFasSoundClip(
        {
          file,
          name: trimmedName,
          format,
          node,
          ...(highpass.trim() !== "" && Number.isFinite(hp) && hp >= 0
            ? { highpassHz: Math.round(hp) }
            : {}),
          ...(pitch.trim() !== "" && Number.isFinite(st) && st >= 0
            ? { pitchSemitones: st }
            : {}),
        },
        clientId,
      );
      const u = res.uploaded;
      setResult(`Uploaded "${u.name}" — ${u.seconds.toFixed(1)} s, ${u.bytes} B. Appears in the list shortly.`);
      setFile(null);
      setName("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e) {
      // novaFetch surfaces the FastAPI `detail` (503 ffmpeg missing / 413 too
      // large / 422 transcode failed) as the Error message.
      setResult(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box borderTop="1px solid" borderColor="border.default" pt={2} mt={1}>
      <Text fontSize="2xs" color="text.muted" textTransform="uppercase" letterSpacing="0.06em" mb={2}>
        Upload clip
      </Text>
      <Flex direction="column" gap={2}>
        <NativeInput
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setFile(f);
            // Seed the name from the filename (sans extension) on first pick.
            if (f && trimmedName === "") setName(f.name.replace(/\.[^.]+$/, "").slice(0, NAME_MAX));
          }}
          fontSize="xs"
          color="text.primary"
        />
        <Flex gap={2} flexWrap="wrap">
          <Box flex="2" minW="140px">
            <Text fontSize="2xs" color="text.muted" mb={1}>
              name (≤{NAME_MAX})
            </Text>
            <NativeInput
              type="text"
              value={name}
              maxLength={NAME_MAX}
              onChange={(e) => setName(e.target.value)}
              fontSize="xs"
              fontFamily="mono"
              bg="bg.canvas"
              border="1px solid"
              borderColor={trimmedName.length > NAME_MAX ? "fault" : "border.default"}
              borderRadius="control"
              px={2}
              py={1}
              w="100%"
              color="text.primary"
            />
          </Box>
          <Box flex="1" minW="90px">
            <Text fontSize="2xs" color="text.muted" mb={1}>format</Text>
            <NativeSelect
              value={format}
              onChange={(e) => setFormat(e.target.value as "adpcm" | "pcm")}
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
            >
              <option value="adpcm">adpcm (compact)</option>
              <option value="pcm">pcm (clean, 4×)</option>
            </NativeSelect>
          </Box>
        </Flex>
        <Flex gap={2} flexWrap="wrap">
          <Box flex="1" minW="110px">
            <Text fontSize="2xs" color="text.muted" mb={1}>high-pass (Hz)</Text>
            <NativeInput
              type="number"
              min={0}
              step={50}
              value={highpass}
              placeholder="700"
              onChange={(e) => setHighpass(e.target.value)}
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
          <Box flex="1" minW="110px">
            <Text fontSize="2xs" color="text.muted" mb={1}>pitch up (semitones)</Text>
            <NativeInput
              type="number"
              min={0}
              step={0.5}
              value={pitch}
              placeholder="0"
              onChange={(e) => setPitch(e.target.value)}
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
        <Button size="sm" disabled={!canUpload} loading={busy} onClick={handleUpload}>
          Upload
        </Button>
        <Text fontSize="2xs" color="text.muted">
          Transcoded on the backend. Keep clips to a few seconds (~400 kB cap;
          adpcm buys ~4× length). High-pass and pitch shape the audio for the
          small speaker — blank uses the backend defaults (700 Hz, 0 st); pitch
          shifts up without changing tempo.
        </Text>
        {result && <Mono fontSize="2xs" color="text.muted">{result}</Mono>}
      </Flex>
    </Box>
  );
}

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

          <UploadPanel node={node} ready={ready} />
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
                  placeholder="2000"
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
                  placeholder="500"
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

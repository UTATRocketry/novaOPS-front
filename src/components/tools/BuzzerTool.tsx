"use client";

import { useState } from "react";
import { Box, Button, Flex, Text, Textarea, chakra } from "@chakra-ui/react";
import { Card, Mono } from "@/components/primitives";

const NativeSelect = chakra("select");
const NativeInput = chakra("input");
import { useNovaStore } from "@/lib/store/store";
import { sel } from "@/lib/store/selectors";
import { sendFasBuzzer } from "@/lib/api/direct";
import { useConfig } from "@/hooks/useConfig";

type NoteArray = Array<[number, number] | [number, number, number]>;

function parseNotes(raw: string): { ok: true; notes: NoteArray } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { ok: false, error: "Expected a JSON array" };
    for (const item of parsed) {
      if (!Array.isArray(item) || item.length < 2 || item.length > 3)
        return { ok: false, error: "Each note must be [freq, ms] or [freq, ms, vol]" };
      if (typeof item[0] !== "number" || typeof item[1] !== "number")
        return { ok: false, error: "freq and dur must be numbers" };
    }
    return { ok: true, notes: parsed as NoteArray };
  } catch {
    return { ok: false, error: "Invalid JSON" };
  }
}

export function BuzzerTool() {
  const clientId = useNovaStore(sel.clientId);
  const role = useNovaStore(sel.sessionRole);
  const canCommand = role === "operator" || role === "admin" || role === "pad";

  const { data: config } = useConfig();
  const melodiesMap = config?.BuzzerMelodies ?? {};
  const melodyNames = Object.keys(melodiesMap);

  const [selectedMelody, setSelectedMelody] = useState<string>("");
  const [customNotesRaw, setCustomNotesRaw] = useState("[[440, 200], [523, 200], [659, 300]]");
  const [customError, setCustomError] = useState<string | null>(null);
  const [node, setNode] = useState("FMC_0");
  const [simulated, setSimulated] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  async function callBuzzer(body: Parameters<typeof sendFasBuzzer>[0]) {
    if (simulated) {
      setLastResult(`[simulated] ${JSON.stringify(body)}`);
      return;
    }
    if (!clientId) {
      setLastResult("No client ID — connect first");
      return;
    }
    try {
      const res = await sendFasBuzzer(body, clientId);
      setLastResult(`OK — ${JSON.stringify(res)}`);
    } catch (e) {
      setLastResult(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function handlePlay() {
    if (!selectedMelody) return;
    callBuzzer({ node, action: "play", melody: selectedMelody });
  }

  function handleStop() {
    callBuzzer({ node, action: "stop" });
  }

  function handleTestChime() {
    callBuzzer({ node, action: "play", melody: "test_chime" });
  }

  function handlePlayCustom() {
    const result = parseNotes(customNotesRaw);
    if (!result.ok) {
      setCustomError(result.error);
      return;
    }
    setCustomError(null);
    callBuzzer({ node, action: "play", notes: result.notes });
  }

  function handleCustomChange(raw: string) {
    setCustomNotesRaw(raw);
    const result = parseNotes(raw);
    setCustomError(result.ok ? null : result.error);
  }

  return (
    <Flex gap={4} p={4} align="flex-start" flexWrap="wrap">
      {/* Left panel — Melody Selector */}
      <Card title="Melody Selector" style={{ flex: "1", minWidth: "200px" }}>
        <Flex direction="column" gap={3}>
          {melodyNames.length === 0 ? (
            <Text fontSize="xs" color="text.muted">No melodies in config</Text>
          ) : (
            <Box>
              <Text fontSize="2xs" color="text.muted" mb={1}>Select melody</Text>
              <NativeSelect
                value={selectedMelody}
                onChange={(e) => setSelectedMelody(e.target.value)}
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
                <option value="">— choose —</option>
                {melodyNames.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </NativeSelect>
            </Box>
          )}

          <Flex gap={2} flexWrap="wrap">
            <Button
              size="sm"
              disabled={!canCommand || !selectedMelody || (!clientId && !simulated)}
              onClick={handlePlay}
            >
              Play
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!canCommand || (!clientId && !simulated)}
              onClick={handleStop}
            >
              Stop
            </Button>
          </Flex>

          <Button
            size="sm"
            variant="outline"
            disabled={!canCommand || (!clientId && !simulated)}
            onClick={handleTestChime}
          >
            Test Chime
          </Button>
        </Flex>
      </Card>

      {/* Middle panel — Custom Notes */}
      <Card title="Custom Notes" style={{ flex: "1", minWidth: "220px" }}>
        <Flex direction="column" gap={3}>
          <Box>
            <Text fontSize="2xs" color="text.muted" mb={1}>
              JSON array of [freq_hz, dur_ms] or [freq_hz, dur_ms, vol] tuples
            </Text>
            <Textarea
              value={customNotesRaw}
              onChange={(e) => handleCustomChange(e.target.value)}
              fontFamily="mono"
              fontSize="xs"
              rows={5}
              bg="bg.canvas"
              borderColor={customError ? "fault" : "border.default"}
              borderRadius="control"
              resize="vertical"
            />
            {customError && (
              <Text fontSize="2xs" color="fault" mt={1}>{customError}</Text>
            )}
          </Box>
          <Button
            size="sm"
            disabled={!canCommand || !!customError || (!clientId && !simulated)}
            onClick={handlePlayCustom}
          >
            Play Custom
          </Button>
        </Flex>
      </Card>

      {/* Right panel — Connection */}
      <Card title="Connection" style={{ flex: "1", minWidth: "180px" }}>
        <Flex direction="column" gap={3}>
          <Box>
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

          <Flex
            as="button"
            align="center"
            gap={2}
            onClick={() => setSimulated((s) => !s)}
            cursor="pointer"
            fontSize="xs"
            color={simulated ? "accent.solid" : "text.muted"}
          >
            <Box
              w="14px"
              h="14px"
              border="2px solid"
              borderColor={simulated ? "accent.solid" : "border.default"}
              borderRadius="sm"
              bg={simulated ? "accent.solid" : "transparent"}
              flexShrink={0}
            />
            Simulated (no send)
          </Flex>

          {!canCommand && (
            <Text fontSize="xs" color="warn">Operator role required to send commands</Text>
          )}

          {!clientId && !simulated && (
            <Text fontSize="xs" color="text.muted">Not connected — enable Simulated or connect</Text>
          )}
        </Flex>
      </Card>

      {/* Result row */}
      {lastResult && (
        <Box w="100%" px={1}>
          <Mono fontSize="xs" color="text.muted">{lastResult}</Mono>
        </Box>
      )}
    </Flex>
  );
}

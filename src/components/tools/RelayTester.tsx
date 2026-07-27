"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { CSSProperties } from "react";
import { Box, Flex, Text, Button } from "@chakra-ui/react";
import { Card, Mono } from "@/components/primitives";
import { useNovaStore } from "@/lib/store";
import { useActuators } from "@/hooks/useConfig";
import { sendDirectRelay } from "@/lib/api/direct";
import type { ActuatorEntry, SourceTarget } from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

const inputStyle: CSSProperties = {
  width: "100%",
  background: "transparent",
  border: "1px solid var(--chakra-colors-border-default)",
  borderRadius: "6px",
  padding: "4px 8px",
  color: "inherit",
  fontFamily: "monospace",
  fontSize: "13px",
};

// ---------------------------------------------------------------------------
// Lamp indicator
// ---------------------------------------------------------------------------

function RelayLamp({ on }: { on: boolean }) {
  return (
    <Flex direction="column" align="center" py={2}>
      <Box
        w="120px"
        h="120px"
        borderRadius="full"
        bg={on ? "nominal" : "bg.surfaceRaised"}
        border="2px solid"
        borderColor={on ? "nominal" : "border.default"}
        boxShadow={on ? "0 0 28px 6px var(--chakra-colors-nominal)" : "none"}
        display="flex"
        alignItems="center"
        justifyContent="center"
        style={{ transition: "background 200ms ease, box-shadow 200ms ease, border-color 200ms ease" }}
      >
        <Mono fontSize="2xl" fontWeight="700" color={on ? "white" : "text.muted"}>
          {on ? "ON" : "OFF"}
        </Mono>
      </Box>
    </Flex>
  );
}

// ---------------------------------------------------------------------------
// RelayTester
// ---------------------------------------------------------------------------

export function RelayTester() {
  // Relay state
  const [state, setState] = useState<0 | 1>(0);
  const [pulseMs, setPulseMs] = useState(500);
  const [blinkMs, setBlinkMs] = useState(500);
  const [blinking, setBlinking] = useState(false);

  // Connection panel
  const [simulated, setSimulated] = useState(true);
  const [target, setTarget] = useState<SourceTarget>("GCS");
  const [node, setNode] = useState("");
  const [channel, setChannel] = useState(0);

  // Feedback
  const [lastResult, setLastResult] = useState<string | null>(null);

  const clientId = useNovaStore((s) => s.session.clientId);

  // Actuator(s) bound to the current relay channel (within the selected target,
  // and node when one is given) — shown under the Channel input.
  const { data: actuators } = useActuators();
  const matchedActuators = ((actuators ?? []) as ActuatorEntry[])
    .filter(
      (a) =>
        a.binding.relay_channel === channel &&
        a.binding.target === target &&
        (node.trim() === "" || (a.binding.node ?? "") === node.trim()),
    )
    .map((a) => a.name);

  const blinkTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blinkOnRef = useRef(false);

  // Low-level send — updates state and pushes the command. Does NOT stop blink,
  // so the blink loop can drive it.
  const commitRelay = useCallback(
    async (s: 0 | 1) => {
      setState(s);
      if (simulated) {
        setLastResult(`[sim] state=${s}`);
        return;
      }
      if (!clientId) {
        setLastResult("Not connected — no client ID.");
        return;
      }
      try {
        await sendDirectRelay({ target, node: node || undefined, channel, state: s }, clientId);
        setLastResult(`OK state=${s}`);
      } catch (err) {
        setLastResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [simulated, clientId, target, node, channel],
  );

  const stopBlink = useCallback(() => {
    if (blinkTimer.current) {
      clearInterval(blinkTimer.current);
      blinkTimer.current = null;
    }
    setBlinking(false);
  }, []);

  const clearPulse = useCallback(() => {
    if (pulseTimer.current) {
      clearTimeout(pulseTimer.current);
      pulseTimer.current = null;
    }
  }, []);

  // High-level user action — cancels any running blink/pulse first.
  const setRelay = useCallback(
    (s: 0 | 1) => {
      stopBlink();
      clearPulse();
      commitRelay(s);
    },
    [stopBlink, clearPulse, commitRelay],
  );

  const pulse = useCallback(() => {
    stopBlink();
    clearPulse();
    commitRelay(1);
    pulseTimer.current = setTimeout(() => {
      commitRelay(0);
      pulseTimer.current = null;
    }, Math.max(10, pulseMs));
  }, [stopBlink, clearPulse, commitRelay, pulseMs]);

  const startBlink = useCallback(() => {
    if (blinkTimer.current) clearInterval(blinkTimer.current);
    clearPulse();
    setBlinking(true);
    blinkOnRef.current = state === 1;
    blinkTimer.current = setInterval(() => {
      blinkOnRef.current = !blinkOnRef.current;
      commitRelay(blinkOnRef.current ? 1 : 0);
    }, Math.max(50, blinkMs));
  }, [clearPulse, commitRelay, blinkMs, state]);

  const toggleBlink = () => {
    if (blinking) {
      stopBlink();
      commitRelay(0);
    } else {
      startBlink();
    }
  };

  // Restart the blink loop when the interval changes while running.
  useEffect(() => {
    if (blinking) startBlink();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blinkMs]);

  // Cleanup on unmount.
  useEffect(
    () => () => {
      if (blinkTimer.current) clearInterval(blinkTimer.current);
      if (pulseTimer.current) clearTimeout(pulseTimer.current);
    },
    [],
  );

  const on = state === 1;

  return (
    <Flex gap={5} wrap="wrap" align="flex-start">
      {/* Left: Lamp + primary controls */}
      <Box flex="1" minW="280px">
        <Card title="Relay State">
          <RelayLamp on={on} />

          <Flex gap={2} mt={4} justify="center" wrap="wrap">
            <Button
              size="sm"
              colorPalette="green"
              variant={on ? "solid" : "outline"}
              onClick={() => setRelay(1)}
            >
              ON
            </Button>
            <Button
              size="sm"
              colorPalette="red"
              variant={!on ? "solid" : "outline"}
              onClick={() => setRelay(0)}
            >
              OFF
            </Button>
            <Button size="sm" variant="outline" onClick={() => setRelay(on ? 0 : 1)}>
              Toggle
            </Button>
          </Flex>
        </Card>

        {/* Feedback */}
        {lastResult && (
          <Box
            mt={3}
            px={3}
            py={2}
            bg="bg.surface"
            border="1px solid"
            borderColor="border.default"
            borderRadius="control"
            fontFamily="mono"
            fontSize="xs"
            color={lastResult.startsWith("Error") ? "red.400" : "green.400"}
          >
            {lastResult}
          </Box>
        )}
      </Box>

      {/* Middle: Pulse / Blink */}
      <Box minW="220px">
        <Card title="Pulse / Blink">
          <Flex direction="column" gap={4}>
            {/* Pulse (momentary) */}
            <Box>
              <Text fontSize="xs" color="text.muted" mb={1}>Pulse duration</Text>
              <Flex gap={2} align="center">
                <input
                  type="number"
                  min={10}
                  max={60000}
                  value={pulseMs}
                  onChange={(e) => setPulseMs(clamp(Number(e.target.value), 10, 60000))}
                  style={inputStyle}
                />
                <Text fontSize="xs" color="text.muted" flexShrink={0}>ms</Text>
              </Flex>
              <Button mt={2} size="sm" colorPalette="blue" width="100%" onClick={pulse}>
                Pulse (on → off)
              </Button>
            </Box>

            {/* Blink */}
            <Box pt={3} borderTop="1px solid" borderColor="border.default">
              <Text fontSize="xs" color="text.muted" mb={1}>Blink interval</Text>
              <Flex gap={2} align="center">
                <input
                  type="number"
                  min={50}
                  max={10000}
                  value={blinkMs}
                  onChange={(e) => setBlinkMs(clamp(Number(e.target.value), 50, 10000))}
                  style={inputStyle}
                />
                <Text fontSize="xs" color="text.muted" flexShrink={0}>ms</Text>
              </Flex>
              <Button
                mt={2}
                size="sm"
                colorPalette={blinking ? "red" : "blue"}
                width="100%"
                onClick={toggleBlink}
              >
                {blinking ? "Stop" : "Blink"}
              </Button>
            </Box>
          </Flex>
        </Card>
      </Box>

      {/* Right: Connection panel */}
      <Box minW="220px">
        <Card
          title={
            <Flex align="center" gap={2}>
              <Text>Connection</Text>
              <Box
                as="span"
                px={2}
                py={0.5}
                borderRadius="sm"
                fontSize="xs"
                fontWeight="600"
                bg={simulated ? "warn" : "nominal"}
                color="white"
                letterSpacing="0.04em"
              >
                {simulated ? "SIMULATED" : "LIVE"}
              </Box>
            </Flex>
          }
        >
          <Flex direction="column" gap={4}>
            {/* Simulated toggle */}
            <Flex align="center" justify="space-between">
              <Text fontSize="sm">Simulated</Text>
              <input
                type="checkbox"
                checked={simulated}
                onChange={(e) => setSimulated(e.target.checked)}
                style={{
                  width: "18px",
                  height: "18px",
                  cursor: "pointer",
                  accentColor: "var(--chakra-colors-warn)",
                } as CSSProperties}
              />
            </Flex>

            <Box opacity={simulated ? 0.45 : 1} pointerEvents={simulated ? "none" : "auto"}>
              {/* Target */}
              <Box mb={3}>
                <Text fontSize="xs" color="text.muted" mb={1}>Target</Text>
                <select
                  value={target}
                  onChange={(e) => setTarget(e.target.value as SourceTarget)}
                  style={{
                    width: "100%",
                    background: "transparent",
                    border: "1px solid var(--chakra-colors-border-default)",
                    borderRadius: "6px",
                    padding: "4px 8px",
                    color: "inherit",
                    fontSize: "13px",
                  }}
                >
                  <option value="GCS">GCS</option>
                  <option value="FAS">FAS</option>
                  <option value="TCS">TCS</option>
                </select>
              </Box>

              {/* Node */}
              <Box mb={3}>
                <Text fontSize="xs" color="text.muted" mb={1}>Node (optional)</Text>
                <input
                  type="text"
                  value={node}
                  placeholder="e.g. EPB:0"
                  onChange={(e) => setNode(e.target.value)}
                  style={inputStyle}
                />
              </Box>

              {/* Channel */}
              <Box mb={3}>
                <Text fontSize="xs" color="text.muted" mb={1}>Channel</Text>
                <input
                  type="number"
                  min={0}
                  max={63}
                  value={channel}
                  onChange={(e) => setChannel(Number(e.target.value))}
                  style={inputStyle}
                />
                {/* Actuator bound to this relay channel, if any */}
                <Box mt={1}>
                  {matchedActuators.length > 0 ? (
                    <Text fontSize="xs" color="text.muted">
                      Actuator:{" "}
                      <Mono color="text.primary">{matchedActuators.join(", ")}</Mono>
                    </Text>
                  ) : (
                    <Text fontSize="xs" color="text.muted">
                      No actuator bound to this channel.
                    </Text>
                  )}
                </Box>
              </Box>
            </Box>

            {!simulated && !clientId && (
              <Text fontSize="xs" color="red.400">
                Not connected — no client session.
              </Text>
            )}
          </Flex>
        </Card>
      </Box>
    </Flex>
  );
}

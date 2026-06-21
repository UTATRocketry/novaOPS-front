"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Box,
  Flex,
  Text,
  Button,
} from "@chakra-ui/react";
import { Card, Mono } from "@/components/primitives";
import { useNovaStore } from "@/lib/store";
import { sendDirectServo } from "@/lib/api/direct";
import type { SourceTarget } from "@/lib/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_US = 500;
const MAX_US = 2500;
const US_RANGE = MAX_US - MIN_US; // 2000

const PRESETS = [
  { label: "0°",   us: 500  },
  { label: "45°",  us: 1000 },
  { label: "90°",  us: 1500 },
  { label: "135°", us: 2000 },
  { label: "180°", us: 2500 },
];

// SVG dial geometry
const CX = 150;
const CY = 150;
const R_TRACK = 110;
const R_NEEDLE = 98;
const R_HUB = 8;
const VIEWBOX = "0 0 300 160";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function usToAngle(us: number): number {
  return ((us - MIN_US) / US_RANGE) * 180; // 0–180 servo degrees
}

function angleToNeedle(servoDeg: number): { x: number; y: number } {
  const rad = ((180 - servoDeg) * Math.PI) / 180;
  return {
    x: CX + R_NEEDLE * Math.cos(rad),
    y: CY - R_NEEDLE * Math.sin(rad),
  };
}

function arcPath(fromUs: number, toUs: number): string {
  const fromDeg = usToAngle(fromUs);
  const toDeg   = usToAngle(toUs);
  const fromRad = ((180 - fromDeg) * Math.PI) / 180;
  const toRad   = ((180 - toDeg)   * Math.PI) / 180;
  const x1 = CX + R_TRACK * Math.cos(fromRad);
  const y1 = CY - R_TRACK * Math.sin(fromRad);
  const x2 = CX + R_TRACK * Math.cos(toRad);
  const y2 = CY - R_TRACK * Math.sin(toRad);
  const largeArc = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
  // sweep=0 is counter-clockwise in SVG y-up sense → goes through top
  const sweep = toDeg > fromDeg ? 1 : 0;
  return `M ${x1} ${y1} A ${R_TRACK} ${R_TRACK} 0 ${largeArc} ${sweep} ${x2} ${y2}`;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

// ---------------------------------------------------------------------------
// Dial SVG
// ---------------------------------------------------------------------------

function ServoDial({ pulseUs }: { pulseUs: number }) {
  const servoDeg = usToAngle(pulseUs);
  const needle = angleToNeedle(servoDeg);

  // Full track arc (MIN → MAX)
  const trackD = arcPath(MIN_US, MAX_US);
  // Active fill arc (MIN → current)
  const activeD = pulseUs > MIN_US ? arcPath(MIN_US, pulseUs) : null;

  // Tick marks at presets
  const ticks = PRESETS.map(({ us, label }) => {
    const deg = usToAngle(us);
    const rad = ((180 - deg) * Math.PI) / 180;
    const ix = CX + (R_TRACK - 10) * Math.cos(rad);
    const iy = CY - (R_TRACK - 10) * Math.sin(rad);
    const ox = CX + (R_TRACK + 4) * Math.cos(rad);
    const oy = CY - (R_TRACK + 4) * Math.sin(rad);
    const lx = CX + (R_TRACK - 22) * Math.cos(rad);
    const ly = CY - (R_TRACK - 22) * Math.sin(rad);
    return { ix, iy, ox, oy, lx, ly, label };
  });

  return (
    <svg
      viewBox={VIEWBOX}
      width="100%"
      style={{ maxWidth: "300px", display: "block", margin: "0 auto" }}
      aria-label={`Servo position: ${Math.round(servoDeg)}° / ${pulseUs}µs`}
    >
      {/* Track */}
      <path
        d={trackD}
        fill="none"
        stroke="var(--chakra-colors-border-default, #2d3748)"
        strokeWidth={10}
        strokeLinecap="round"
      />

      {/* Active fill */}
      {activeD && (
        <path
          d={activeD}
          fill="none"
          stroke="var(--chakra-colors-accent-solid, #3b82f6)"
          strokeWidth={10}
          strokeLinecap="round"
        />
      )}

      {/* Tick marks */}
      {ticks.map((t) => (
        <g key={t.label}>
          <line
            x1={t.ix} y1={t.iy}
            x2={t.ox} y2={t.oy}
            stroke="var(--chakra-colors-text-muted, #718096)"
            strokeWidth={1.5}
          />
          <text
            x={t.lx} y={t.ly}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={8}
            fill="var(--chakra-colors-text-muted, #718096)"
            fontFamily="monospace"
          >
            {t.label}
          </text>
        </g>
      ))}

      {/* Needle */}
      <line
        x1={CX} y1={CY}
        x2={needle.x} y2={needle.y}
        stroke="white"
        strokeWidth={2}
        strokeLinecap="round"
      />

      {/* Hub */}
      <circle cx={CX} cy={CY} r={R_HUB} fill="var(--chakra-colors-bg-surface, #1a202c)" stroke="white" strokeWidth={1.5} />

      {/* µs readout */}
      <text
        x={CX} y={CY + 28}
        textAnchor="middle"
        fontSize={20}
        fontWeight="700"
        fill="white"
        fontFamily="monospace"
      >
        {pulseUs}
      </text>
      <text
        x={CX} y={CY + 42}
        textAnchor="middle"
        fontSize={9}
        fill="var(--chakra-colors-text-muted, #718096)"
        fontFamily="monospace"
      >
        µs · {Math.round(servoDeg)}°
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// ServoTester
// ---------------------------------------------------------------------------

export function ServoTester() {
  // Pulse & positions
  const [pulseUs, setPulseUs]     = useState(1500);
  const [posA, setPosA]           = useState(500);
  const [posB, setPosB]           = useState(2500);
  const [sweeping, setSweeping]   = useState(false);
  const [sweepSpeed, setSweepSpeed] = useState(10); // µs per tick (50 ms interval)

  // Range limits (user can restrict slider range)
  const [rangeMin, setRangeMin]   = useState(MIN_US);
  const [rangeMax, setRangeMax]   = useState(MAX_US);

  // Connection panel
  const [simulated, setSimulated] = useState(true);
  const [target, setTarget]       = useState<SourceTarget>("GCS");
  const [node, setNode]           = useState("");
  const [channel, setChannel]     = useState(0);

  // Feedback
  const [lastResult, setLastResult] = useState<string | null>(null);

  const clientId = useNovaStore((s) => s.session.clientId);

  // Sweep logic
  const sweepDir = useRef<1 | -1>(1);
  const sweepTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopSweep = useCallback(() => {
    if (sweepTimer.current) {
      clearInterval(sweepTimer.current);
      sweepTimer.current = null;
    }
    setSweeping(false);
  }, []);

  const startSweep = useCallback(() => {
    stopSweep();
    sweepDir.current = 1;
    setSweeping(true);
    sweepTimer.current = setInterval(() => {
      setPulseUs((prev) => {
        const next = prev + sweepDir.current * sweepSpeed;
        if (next >= posB) { sweepDir.current = -1; return posB; }
        if (next <= posA) { sweepDir.current = 1;  return posA; }
        return next;
      });
    }, 50);
  }, [posA, posB, sweepSpeed, stopSweep]);

  useEffect(() => {
    if (sweeping) startSweep();
    else stopSweep();
    return stopSweep;
  }, [sweeping, posA, posB, sweepSpeed]); // eslint-disable-line react-hooks/exhaustive-deps

  // Send to servo (no-op when simulated)
  const sendPulse = useCallback(
    async (us: number) => {
      if (simulated) {
        setLastResult(`[sim] pulse_us=${us}`);
        return;
      }
      if (!clientId) { setLastResult("Not connected — no client ID."); return; }
      try {
        await sendDirectServo(
          { target, node: node || undefined, channel, pulse_us: us },
          clientId,
        );
        setLastResult(`OK pulse_us=${us}`);
      } catch (err) {
        setLastResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [simulated, clientId, target, node, channel],
  );

  const handleSlider = (us: number) => {
    stopSweep();
    setPulseUs(us);
    sendPulse(us);
  };

  const handlePreset = (us: number) => {
    stopSweep();
    setPulseUs(us);
    sendPulse(us);
  };

  return (
    <Flex gap={5} wrap="wrap" align="flex-start">
      {/* Left: Dial + controls */}
      <Box flex="1" minW="280px">
        <Card title="Servo Position">
          <ServoDial pulseUs={pulseUs} />

          {/* Slider */}
          <Box mt={4} px={2}>
            <Flex justify="space-between" mb={1}>
              <Text fontSize="xs" color="text.muted">
                <Mono>{rangeMin}µs</Mono>
              </Text>
              <Text fontSize="xs" color="text.muted">
                <Mono>{rangeMax}µs</Mono>
              </Text>
            </Flex>
            <input
              type="range"
              min={rangeMin}
              max={rangeMax}
              step={1}
              value={pulseUs}
              onChange={(e) => handleSlider(Number(e.target.value))}
              style={{ width: "100%", accentColor: "var(--chakra-colors-accent-solid, #3b82f6)" }}
            />
          </Box>

          {/* Presets */}
          <Flex gap={2} mt={4} justify="center" wrap="wrap">
            {PRESETS.map((p) => (
              <Button
                key={p.us}
                size="xs"
                variant={pulseUs === p.us ? "solid" : "outline"}
                colorPalette={pulseUs === p.us ? "blue" : undefined}
                onClick={() => handlePreset(p.us)}
              >
                {p.label}
              </Button>
            ))}
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

      {/* Middle: A/B + Sweep */}
      <Box minW="220px">
        <Card title="A / B Positions">
          <Flex direction="column" gap={3}>
            {/* Position A */}
            <Box>
              <Text fontSize="xs" color="text.muted" mb={1}>Position A</Text>
              <Flex gap={2} align="center">
                <Mono fontSize="sm">{posA}µs</Mono>
                <Button size="xs" variant="outline" onClick={() => setPosA(pulseUs)}>
                  Set A
                </Button>
                <Button size="xs" variant="solid" colorPalette="blue"
                  onClick={() => handlePreset(posA)}>
                  Go A
                </Button>
              </Flex>
            </Box>

            {/* Position B */}
            <Box>
              <Text fontSize="xs" color="text.muted" mb={1}>Position B</Text>
              <Flex gap={2} align="center">
                <Mono fontSize="sm">{posB}µs</Mono>
                <Button size="xs" variant="outline" onClick={() => setPosB(pulseUs)}>
                  Set B
                </Button>
                <Button size="xs" variant="solid" colorPalette="blue"
                  onClick={() => handlePreset(posB)}>
                  Go B
                </Button>
              </Flex>
            </Box>

            {/* Sweep */}
            <Box pt={1} borderTop="1px solid" borderColor="border.default">
              <Text fontSize="xs" color="text.muted" mb={2}>Sweep A ↔ B</Text>
              <Flex gap={2}>
                <Button
                  size="sm"
                  colorPalette={sweeping ? "red" : "blue"}
                  onClick={() => setSweeping((s) => !s)}
                >
                  {sweeping ? "Stop" : "Sweep"}
                </Button>
              </Flex>
              <Box mt={3}>
                <Text fontSize="xs" color="text.muted" mb={1}>
                  Speed: <Mono>{sweepSpeed}µs / 50ms</Mono>
                </Text>
                <input
                  type="range"
                  min={1}
                  max={50}
                  step={1}
                  value={sweepSpeed}
                  onChange={(e) => setSweepSpeed(Number(e.target.value))}
                  style={{ width: "100%" }}
                />
              </Box>
            </Box>
          </Flex>
        </Card>

        {/* Range limits */}
        <Card title="Range" mt={4}>
          <Flex direction="column" gap={3}>
            <Box>
              <Text fontSize="xs" color="text.muted" mb={1}>Min (µs)</Text>
              <input
                type="number"
                min={MIN_US}
                max={rangeMax - 1}
                value={rangeMin}
                onChange={(e) => setRangeMin(clamp(Number(e.target.value), MIN_US, rangeMax - 1))}
                style={{
                  width: "100%",
                  background: "transparent",
                  border: "1px solid var(--chakra-colors-border-default)",
                  borderRadius: "6px",
                  padding: "4px 8px",
                  color: "inherit",
                  fontFamily: "monospace",
                  fontSize: "13px",
                }}
              />
            </Box>
            <Box>
              <Text fontSize="xs" color="text.muted" mb={1}>Max (µs)</Text>
              <input
                type="number"
                min={rangeMin + 1}
                max={MAX_US}
                value={rangeMax}
                onChange={(e) => setRangeMax(clamp(Number(e.target.value), rangeMin + 1, MAX_US))}
                style={{
                  width: "100%",
                  background: "transparent",
                  border: "1px solid var(--chakra-colors-border-default)",
                  borderRadius: "6px",
                  padding: "4px 8px",
                  color: "inherit",
                  fontFamily: "monospace",
                  fontSize: "13px",
                }}
              />
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
                } as React.CSSProperties}
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
                  style={{
                    width: "100%",
                    background: "transparent",
                    border: "1px solid var(--chakra-colors-border-default)",
                    borderRadius: "6px",
                    padding: "4px 8px",
                    color: "inherit",
                    fontFamily: "monospace",
                    fontSize: "13px",
                  }}
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
                  style={{
                    width: "100%",
                    background: "transparent",
                    border: "1px solid var(--chakra-colors-border-default)",
                    borderRadius: "6px",
                    padding: "4px 8px",
                    color: "inherit",
                    fontFamily: "monospace",
                    fontSize: "13px",
                  }}
                />
              </Box>

              {/* Disable */}
              <Button
                size="sm"
                variant="outline"
                colorPalette="red"
                width="100%"
                onClick={() => sendPulse(0)}
              >
                Disable (pulse_us = 0)
              </Button>
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

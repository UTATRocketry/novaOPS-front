"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Box, Flex, Input, Table, Text } from "@chakra-ui/react";
import { Card, Chip, Icon, Mono } from "@/components/primitives";
import { useNovaStore, sel } from "@/lib/store";
import type { SensorEntry } from "@/lib/types";
import { TABLE_CSS, IconButton } from "./fields";

const CAPTURE_MS = 10_000;
const SAMPLE_MS = 200;

type Pair = [number, number]; // [measured raw, real physical]

/**
 * Ordinary least-squares fit of `real = m·measured + b`. Returns null when there
 * is no trend to fit — fewer than two points, or every measured value identical
 * (a vertical line has no defined slope).
 */
function linearFit(pairs: Pair[]): { m: number; b: number } | null {
  const n = pairs.length;
  if (n < 2) return null;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (const [x, y] of pairs) {
    sx += x;
    sy += y;
    sxy += x * y;
    sxx += x * x;
  }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  const m = (n * sxy - sx * sy) / denom;
  const b = (sy - m * sx) / n;
  return { m, b };
}

export interface CalibrationModalProps {
  sensor: SensorEntry;
  onSave: (calibration: Pair[]) => void;
  onClose: () => void;
}

/**
 * Capture-and-solve sensor calibration (NOVA_OPS_IMPLEMENTATION_PLAN § 13.1).
 *
 * "Capture 10s avg" averages the next 10 s of live readings for this sensor into
 * a measured point; the operator assigns the real physical value, building a list
 * of [measured, real] pairs that become `convert.calibration`. Backend applies
 * the conversion — this only authors it. Capture should run with the backend
 * calibration flag OFF so the raw value is what gets averaged.
 */
export function CalibrationModal({ sensor, onSave, onClose }: CalibrationModalProps) {
  const live = useNovaStore(sel.engineValue(sensor.name));

  const [pairs, setPairs] = useState<Pair[]>(
    (sensor.convert?.calibration ?? []).map((p) => [p[0], p[1]] as Pair),
  );
  const [capturing, setCapturing] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1
  // Editable so a point can be entered by hand, not only via capture.
  const [measuredInput, setMeasuredInput] = useState("");
  const [real, setReal] = useState("");

  const samplesRef = useRef<number[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const liveRef = useRef<number | null>(null);
  liveRef.current = live?.value ?? null;

  const stopCapture = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  useEffect(() => () => stopCapture(), [stopCapture]);

  function startCapture() {
    samplesRef.current = [];
    setMeasuredInput("");
    setProgress(0);
    setCapturing(true);
    const start = Date.now();
    timerRef.current = setInterval(() => {
      const v = liveRef.current;
      if (typeof v === "number") samplesRef.current.push(v);
      const elapsed = Date.now() - start;
      setProgress(Math.min(1, elapsed / CAPTURE_MS));
      if (elapsed >= CAPTURE_MS) {
        stopCapture();
        setCapturing(false);
        const s = samplesRef.current;
        const avg = s.length ? s.reduce((a, b) => a + b, 0) / s.length : null;
        setMeasuredInput(avg != null ? avg.toFixed(4) : "");
      }
    }, SAMPLE_MS);
  }

  const measuredNum = Number(measuredInput);
  const realNum = Number(real);
  const canAddPoint =
    measuredInput.trim() !== "" &&
    real.trim() !== "" &&
    !Number.isNaN(measuredNum) &&
    !Number.isNaN(realNum);

  function addPoint() {
    if (!canAddPoint) return;
    setPairs((prev) => [...prev, [Number(measuredNum.toFixed(4)), realNum]]);
    setMeasuredInput("");
    setReal("");
  }

  function removePair(i: number) {
    setPairs((prev) => prev.filter((_, idx) => idx !== i));
  }

  // Re-zero (tare): keep the fitted slope and the assigned real values, but
  // shift every point's measured value horizontally so the current live reading
  // maps to 0. Shifting all x by a constant preserves the slope; the shift is
  // Δ = valueNow / m. Requires a trend (≥2 points), a non-flat slope, and a
  // live value.
  const liveValue = live?.value ?? null;
  const fit = linearFit(pairs);
  const canZero = liveValue != null && fit != null && fit.m !== 0;

  function zeroAtCurrent() {
    if (liveValue == null || fit == null || fit.m === 0) return;
    const valueNow = fit.m * liveValue + fit.b; // current calibrated reading
    const shift = valueNow / fit.m; // horizontal shift that drives it to 0
    setPairs((prev) =>
      prev.map(([meas, realv]) => [Number((meas + shift).toFixed(6)), realv] as Pair),
    );
  }

  return (
    <Box
      position="fixed"
      inset={0}
      zIndex={1000}
      display="flex"
      alignItems="center"
      justifyContent="center"
      bg="blackAlpha.600"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <Card title={`Calibrate · ${sensor.name}`} w="560px" maxW="92vw">
        <Flex direction="column" gap={4}>
          <Text fontSize="xs" color="text.muted">
            Capture a 10&nbsp;s average of the live raw reading, or type a measured value by
            hand, then assign its real value. Run with the backend calibration flag OFF so
            raw values are captured.
          </Text>

          {/* Capture */}
          <Flex align="center" gap={3} flexWrap="wrap">
            <Box
              as="button"
              onClick={capturing ? undefined : startCapture}
              aria-disabled={capturing}
              px={3}
              py={2}
              borderRadius="control"
              fontSize="sm"
              fontWeight="600"
              bg={capturing ? "bg.surfaceRaised" : "accent.solid"}
              color={capturing ? "text.muted" : "white"}
              border="1px solid"
              borderColor={capturing ? "border.default" : "accent.solid"}
              cursor={capturing ? "not-allowed" : "pointer"}
            >
              {capturing ? `Capturing… ${Math.round(progress * 100)}%` : "Capture 10s avg"}
            </Box>
            <Flex direction="column">
              <Text fontSize="2xs" color="text.muted">Live raw</Text>
              <Mono fontSize="sm" color={live?.value != null ? "text.primary" : "text.muted"}>
                {live?.value != null ? String(live.value) : "—"}
              </Mono>
            </Flex>
          </Flex>

          {/* Assign a point — capture fills Measured, or enter both by hand */}
          <Flex align="flex-end" gap={2} flexWrap="wrap">
            <Box flex="1" minW="140px">
              <Text fontSize="xs" color="text.muted" mb={1}>Measured (raw)</Text>
              <Input
                size="sm"
                type="number"
                fontFamily="mono"
                value={measuredInput}
                placeholder="capture or type"
                bg="bg.canvas"
                borderColor="border.default"
                onChange={(e) => setMeasuredInput(e.target.value)}
                _focusVisible={{ borderColor: "accent.solid" }}
              />
            </Box>
            <Box flex="1" minW="140px">
              <Text fontSize="xs" color="text.muted" mb={1}>Real value ({sensor.unit ?? "unit"})</Text>
              <Input
                size="sm"
                type="number"
                fontFamily="mono"
                value={real}
                placeholder="e.g. 0"
                bg="bg.canvas"
                borderColor="border.default"
                onChange={(e) => setReal(e.target.value)}
                _focusVisible={{ borderColor: "accent.solid" }}
              />
            </Box>
            <Box
              as="button"
              onClick={canAddPoint ? addPoint : undefined}
              aria-disabled={!canAddPoint}
              px={3}
              py={2}
              borderRadius="control"
              fontSize="sm"
              fontWeight="600"
              bg={canAddPoint ? "accent.solid" : "bg.surfaceRaised"}
              color={canAddPoint ? "white" : "text.muted"}
              border="1px solid"
              borderColor="border.default"
              cursor={canAddPoint ? "pointer" : "not-allowed"}
            >
              Add point
            </Box>
          </Flex>

          {/* Pairs */}
          <Box border="1px solid" borderColor="border.default" borderRadius="control" overflow="hidden">
            <Table.Root size="sm" css={TABLE_CSS}>
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeader>#</Table.ColumnHeader>
                  <Table.ColumnHeader>Measured</Table.ColumnHeader>
                  <Table.ColumnHeader>Real</Table.ColumnHeader>
                  <Table.ColumnHeader />
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {pairs.length === 0 ? (
                  <Table.Row>
                    <Table.Cell colSpan={4}>
                      <Box color="text.muted" fontSize="xs" py={2}>No calibration points yet.</Box>
                    </Table.Cell>
                  </Table.Row>
                ) : (
                  pairs.map((p, i) => (
                    <Table.Row key={i}>
                      <Table.Cell><Mono fontSize="xs" color="text.muted">{i + 1}</Mono></Table.Cell>
                      <Table.Cell><Mono fontSize="xs">{p[0]}</Mono></Table.Cell>
                      <Table.Cell><Mono fontSize="xs">{p[1]}</Mono></Table.Cell>
                      <Table.Cell><IconButton icon="delete" label="Remove point" tone="fault" onClick={() => removePair(i)} /></Table.Cell>
                    </Table.Row>
                  ))
                )}
              </Table.Body>
            </Table.Root>
          </Box>

          {pairs.length === 1 && (
            <Chip status="warn">A linear fit needs at least 2 points.</Chip>
          )}

          {/* Re-zero (tare) */}
          <Flex
            align="center"
            justify="space-between"
            gap={3}
            flexWrap="wrap"
            p={3}
            border="1px solid"
            borderColor="border.default"
            borderRadius="control"
          >
            <Box flex="1" minW="200px">
              <Text fontSize="xs" color="text.primary" fontWeight="600">
                Zero at current reading
              </Text>
              <Text fontSize="2xs" color="text.muted">
                Keeps the calibration slope but offsets every point so the current live reading
                reads 0. Needs at least two points and a live value.
              </Text>
            </Box>
            <Flex
              as="button"
              align="center"
              gap={1}
              onClick={canZero ? zeroAtCurrent : undefined}
              aria-disabled={!canZero}
              px={3}
              py={2}
              borderRadius="control"
              fontSize="sm"
              fontWeight="600"
              bg="bg.surfaceRaised"
              color={canZero ? "text.primary" : "text.muted"}
              border="1px solid"
              borderColor="border.default"
              cursor={canZero ? "pointer" : "not-allowed"}
              _hover={canZero ? { borderColor: "accent.solid" } : undefined}
              flexShrink={0}
            >
              <Icon name="exposure_zero" size={16} /> Zero here
            </Flex>
          </Flex>

          {/* Actions */}
          <Flex justify="flex-end" gap={2}>
            <Box
              as="button"
              onClick={onClose}
              px={3}
              py={1.5}
              fontSize="xs"
              fontWeight="600"
              borderRadius="control"
              border="1px solid"
              borderColor="border.default"
              color="text.muted"
              cursor="pointer"
              _hover={{ color: "text.primary" }}
            >
              Cancel
            </Box>
            <Flex
              as="button"
              align="center"
              gap={1}
              onClick={() => { onSave(pairs); onClose(); }}
              px={3}
              py={1.5}
              fontSize="xs"
              fontWeight="600"
              borderRadius="control"
              bg="accent.solid"
              color="white"
              cursor="pointer"
              _hover={{ filter: "brightness(1.1)" }}
            >
              <Icon name="check" size={14} /> Apply to draft
            </Flex>
          </Flex>
          <Text fontSize="2xs" color="text.muted">
            Applies to the editable draft only — press Update in the action bar to persist to the backend.
          </Text>
        </Flex>
      </Card>
    </Box>
  );
}

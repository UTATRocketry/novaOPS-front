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
  const [measured, setMeasured] = useState<number | null>(null);
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
    setMeasured(null);
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
        setMeasured(s.length ? s.reduce((a, b) => a + b, 0) / s.length : null);
      }
    }, SAMPLE_MS);
  }

  function addPoint() {
    if (measured == null || real.trim() === "") return;
    const r = Number(real);
    if (Number.isNaN(r)) return;
    setPairs((prev) => [...prev, [Number(measured.toFixed(4)), r]]);
    setMeasured(null);
    setReal("");
  }

  function removePair(i: number) {
    setPairs((prev) => prev.filter((_, idx) => idx !== i));
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
            Average the live raw reading into a measured point, then assign its real value.
            Run with the backend calibration flag OFF so raw values are captured.
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
            <Flex direction="column">
              <Text fontSize="2xs" color="text.muted">Measured avg</Text>
              <Mono fontSize="sm" color={measured != null ? "accent.solid" : "text.muted"}>
                {measured != null ? measured.toFixed(4) : "—"}
              </Mono>
            </Flex>
          </Flex>

          {/* Assign real value */}
          <Flex align="flex-end" gap={2}>
            <Box flex="1">
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
              onClick={measured != null && real.trim() !== "" ? addPoint : undefined}
              aria-disabled={measured == null || real.trim() === ""}
              px={3}
              py={2}
              borderRadius="control"
              fontSize="sm"
              fontWeight="600"
              bg={measured != null && real.trim() !== "" ? "accent.solid" : "bg.surfaceRaised"}
              color={measured != null && real.trim() !== "" ? "white" : "text.muted"}
              border="1px solid"
              borderColor="border.default"
              cursor={measured != null && real.trim() !== "" ? "pointer" : "not-allowed"}
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

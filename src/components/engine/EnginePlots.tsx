"use client";

import { useState, useEffect, useRef, useCallback, memo } from "react";
import { Box, Flex, Grid, chakra } from "@chakra-ui/react";
import { useNovaStore } from "@/lib/store/store";
import { sel } from "@/lib/store/selectors";
import { Card, Icon, Mono } from "@/components/primitives";
import type { SensorEntry } from "@/lib/types";

const StyledSelect = chakra("select");

// ---------------------------------------------------------------------------
// Constants & persistence
// ---------------------------------------------------------------------------

const STORAGE_KEY = "nova.engine.plots";
const WINDOW_MS = 60_000; // 60-second rolling window
const TICK_MS = 500;      // chart refresh rate

interface PlotSlot {
  key: string;
  sensorName: string;
}

function loadSlots(): PlotSlot[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return null;
    return arr.filter(
      (x): x is PlotSlot =>
        typeof x?.key === "string" && typeof x?.sensorName === "string",
    );
  } catch {
    return null;
  }
}

function saveSlots(slots: PlotSlot[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(slots));
  } catch {
    // storage unavailable
  }
}

// ---------------------------------------------------------------------------
// Sensor type helpers
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<string, string> = { PT: "Pressure", TC: "Temp", LC: "Load" };

function chartColor(type: string): string {
  if (type === "TC") return "var(--chakra-colors-warn)";
  if (type === "LC") return "var(--chakra-colors-nominal)";
  return "var(--chakra-colors-info)";
}

// ---------------------------------------------------------------------------
// SVG chart — memoized, only re-renders on chartHistory / unit / color change
// ---------------------------------------------------------------------------

interface HistoryPoint {
  t: number;
  v: number;
}

interface SensorChartProps {
  chartHistory: HistoryPoint[];
  unit: string;
  color: string;
  slotKey: string;
}

const SensorChart = memo(function SensorChart({
  chartHistory,
  unit,
  color,
  slotKey,
}: SensorChartProps) {
  const W = 600, H = 300;
  const ML = 44, MB = 22, MT = 8, MR = 8;
  const pw = W - ML - MR;
  const ph = H - MT - MB;

  if (chartHistory.length < 2) {
    return (
      <svg
        width="100%"
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        style={{ display: "block" }}
      >
        <text
          x={W / 2}
          y={H / 2}
          textAnchor="middle"
          fill="var(--chakra-colors-text-muted)"
          fontSize={10}
          fontFamily="Inter,sans-serif"
        >
          Waiting for data…
        </text>
      </svg>
    );
  }

  const now = Date.now();
  const tStart = now - WINDOW_MS;

  const values = chartHistory.map((p) => p.v);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const yRng = (rawMax - rawMin) || 1;
  const pad = yRng * 0.12;
  const yMin = rawMin - pad;
  const yMax = rawMax + pad;
  const ySpan = yMax - yMin;

  const cx = (t: number): string =>
    (ML + (Math.max(0, t - tStart) / WINDOW_MS) * pw).toFixed(1);
  const cy = (v: number): string =>
    (MT + ph - ((v - yMin) / ySpan) * ph).toFixed(1);

  const pathD = chartHistory
    .map((p, i) => `${i === 0 ? "M" : "L"}${cx(p.t)} ${cy(p.v)}`)
    .join(" ");

  const first = chartHistory[0];
  const last = chartHistory[chartHistory.length - 1];

  const gradId = `pg-${slotKey}`;
  const clipId = `pc-${slotKey}`;

  const yTicks = [0, 0.33, 0.67, 1.0].map((f) => ({
    y: (MT + ph - f * ph).toFixed(1),
    lbl:
      ySpan > 200
        ? Math.round(yMin + f * ySpan)
        : +(yMin + f * ySpan).toFixed(1),
  }));

  const xLabels = ["60s", "45s", "30s", "15s", "now"];

  return (
    <svg
      width="100%"
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      style={{ display: "block" }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.24} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
        <clipPath id={clipId}>
          <rect x={ML} y={MT} width={pw} height={ph} />
        </clipPath>
      </defs>

      {/* Y grid lines + tick labels */}
      {yTicks.map(({ y, lbl }, i) => (
        <g key={i}>
          <line
            x1={ML}
            y1={y}
            x2={ML + pw}
            y2={y}
            stroke="var(--chakra-colors-text\.muted)"
            strokeWidth={1}
            strokeDasharray="3 4"
          />
          <text
            x={ML - 4}
            y={(+y + 3.5).toFixed(1)}
            textAnchor="end"
            fill="var(--chakra-colors-text\.muted)"
            fontSize={9}
            fontFamily="JetBrains Mono,monospace"
          >
            {lbl}
          </text>
        </g>
      ))}

      {/* Axes */}
      <line
        x1={ML} y1={MT} x2={ML} y2={MT + ph}
        stroke="var(--chakra-colors-text\.muted)" strokeWidth={1}
      />
      <line
        x1={ML} y1={MT + ph} x2={ML + pw} y2={MT + ph}
        stroke="var(--chakra-colors-text\.muted)" strokeWidth={1}
      />

      {/* Gradient area fill */}
      <path
        d={`${pathD} L${cx(last.t)} ${MT + ph} L${cx(first.t)} ${MT + ph} Z`}
        fill={`url(#${gradId})`}
        clipPath={`url(#${clipId})`}
      />

      {/* Trend line */}
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        clipPath={`url(#${clipId})`}
      />

      {/* X axis time labels */}
      {xLabels.map((lbl, i) => (
        <text
          key={lbl}
          x={(ML + (i / 4) * pw).toFixed(1)}
          y={H - 5}
          textAnchor="middle"
          fill="var(--chakra-colors-text\.muted)"
          fontSize={9}
          fontFamily="Inter,sans-serif"
        >
          {lbl}
        </text>
      ))}

      {/* Y axis unit label (rotated) */}
      <text
        x={9}
        y={(MT + ph / 2).toFixed(1)}
        textAnchor="middle"
        fill="var(--chakra-colors-text\.muted)"
        fontSize={8.5}
        fontFamily="Inter,sans-serif"
        transform={`rotate(-90, 9, ${MT + ph / 2})`}
      >
        {unit}
      </text>
    </svg>
  );
});

// ---------------------------------------------------------------------------
// Plot card
// ---------------------------------------------------------------------------

interface PlotCardProps {
  slot: PlotSlot;
  sensors: SensorEntry[];
  onChangeSensor: (name: string) => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onDragEnd: () => void;
  isDragOver: boolean;
}

function PlotCard({
  slot,
  sensors,
  onChangeSensor,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isDragOver,
}: PlotCardProps) {
  const entry = useNovaStore(
    useCallback(sel.engineValue(slot.sensorName), [slot.sensorName]),
  );
  const isStale = useNovaStore(sel.engineDataStatus) === "stale";

  const sensorMeta = sensors.find((s) => s.name === slot.sensorName);
  const sensorType = sensorMeta?.type ?? "PT";
  const color = chartColor(sensorType);

  // Ring buffer — mutated in place, never triggers renders on its own
  const historyRef = useRef<HistoryPoint[]>([]);
  // Snapshot passed to SensorChart — updated at TICK_MS so chart re-renders at 2 Hz
  const [chartHistory, setChartHistory] = useState<HistoryPoint[]>([]);

  // Append new readings as they arrive from the store (10 Hz)
  useEffect(() => {
    if (entry !== null) {
      historyRef.current.push({ t: Date.now(), v: entry.value });
    }
  }, [entry]);

  // Trim old data and push snapshot to chart at 2 Hz
  useEffect(() => {
    const id = setInterval(() => {
      const cutoff = Date.now() - WINDOW_MS;
      historyRef.current = historyRef.current.filter((p) => p.t > cutoff);
      setChartHistory([...historyRef.current]);
    }, TICK_MS);
    return () => clearInterval(id);
  }, []);

  // Flush history when the selected sensor changes
  useEffect(() => {
    historyRef.current = [];
    setChartHistory([]);
  }, [slot.sensorName]);

  const unit = entry?.unit ?? sensorMeta?.unit ?? "";
  const liveValue = entry !== null ? entry.value.toFixed(2) : "—";

  return (
    <Box
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      opacity={isDragOver ? 0.55 : 1}
      outline={isDragOver ? "2px solid" : "none"}
      outlineColor="accent.solid"
      borderRadius="card"
      transition="opacity 0.12s"
      cursor="default"
    >
      <Card nested>
        {/* Header row */}
        <Flex
          align="center"
          gap={2}
          px={3}
          pt={2.5}
          pb={2}
          borderBottom="1px solid"
          borderColor="border.default"
        >
          {/* Drag handle */}
          <Box
            color="text.muted"
            cursor="grab"
            lineHeight={1}
            flexShrink={0}
            title="Drag to reorder"
          >
            <Icon name="drag_indicator" size={16} />
          </Box>

          {/* Sensor selector */}
          <StyledSelect
            value={slot.sensorName}
            aria-label="Select sensor"
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
              onChangeSensor(e.target.value)
            }
            flex={1}
            minW={0}
            fontSize="xs"
            fontFamily="mono"
            bg="bg.surfaceRaised"
            border="1px solid"
            borderColor="border.default"
            borderRadius="control"
            px={2}
            py="4px"
            color="text.default"
            cursor="pointer"
            _focus={{ outline: "none", borderColor: "accent.solid" }}
          >
            {sensors.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name} · {TYPE_LABELS[s.type] ?? s.type}
              </option>
            ))}
          </StyledSelect>

          {/* Unit */}
          <Mono fontSize="2xs" color="text.muted" flexShrink={0}>
            {unit}
          </Mono>

          {/* Live value */}
          <Mono
            fontSize="xs"
            fontWeight="700"
            color="text.default"
            flexShrink={0}
            opacity={isStale && entry !== null ? 0.55 : 1}
            minW="52px"
            textAlign="right"
          >
            {liveValue}
          </Mono>

          {/* Remove */}
          <Box
            as="button"
            aria-label="Remove plot"
            title="Remove plot"
            onClick={onRemove}
            color="text.muted"
            cursor="pointer"
            lineHeight={1}
            flexShrink={0}
            _hover={{ color: "fault" }}
          >
            <Icon name="close" size={14} />
          </Box>
        </Flex>

        {/* Chart area */}
        <Box
          px={2}
          pt={2}
          pb={1.5}
          opacity={isStale && entry !== null ? 0.7 : 1}
        >
          <SensorChart
            chartHistory={chartHistory}
            unit={unit}
            color={color}
            slotKey={slot.key}
          />
        </Box>
      </Card>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// EnginePlots
// ---------------------------------------------------------------------------

export interface EnginePlotsProps {
  sensors: SensorEntry[];
}

export function EnginePlots({ sensors }: EnginePlotsProps) {
  const [slots, setSlots] = useState<PlotSlot[]>(() => loadSlots() ?? []);
  const [dragSrc, setDragSrc] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const update = useCallback((next: PlotSlot[]) => {
    setSlots(next);
    saveSlots(next);
  }, []);

  function addPlot() {
    const existing = new Set(slots.map((s) => s.sensorName));
    const next =
      sensors.find((s) => !existing.has(s.name)) ?? sensors[0];
    if (!next) return;
    update([...slots, { key: `p${Date.now()}`, sensorName: next.name }]);
  }

  function removePlot(idx: number) {
    update(slots.filter((_, i) => i !== idx));
  }

  function changeSensor(idx: number, name: string) {
    update(slots.map((s, i) => (i === idx ? { ...s, sensorName: name } : s)));
  }

  function handleDrop(targetIdx: number) {
    if (dragSrc === null || dragSrc === targetIdx) return;
    const next = [...slots];
    const [moved] = next.splice(dragSrc, 1);
    next.splice(targetIdx, 0, moved);
    update(next);
    setDragSrc(null);
    setDragOver(null);
  }

  if (sensors.length === 0) {
    return (
      <Flex direction="column" align="center" justify="center" py={16} gap={2} color="text.muted" fontSize="sm">
        <Icon name="show_chart" size={28} />
        <Box>No sensors configured.</Box>
      </Flex>
    );
  }

  return (
    <Box>
      {slots.length === 0 ? (
        /* Empty state */
        <Flex
          direction="column"
          align="center"
          justify="center"
          py={14}
          gap={3}
          color="text.muted"
        >
          <Icon name="show_chart" size={32} />
          <Box fontSize="sm">No plots. Click "Add plot" to start.</Box>
          <Box
            as="button"
            onClick={addPlot}
            px={5}
            py={2}
            fontSize="sm"
            fontFamily="mono"
            border="1px dashed"
            borderColor="border.default"
            borderRadius="control"
            color="text.muted"
            cursor="pointer"
            transition="all 0.15s"
            _hover={{ borderColor: "accent.solid", color: "accent.solid" }}
          >
            Add plot
          </Box>
        </Flex>
      ) : (
        <>
          {/* Plot grid */}
          <Grid templateColumns="repeat(auto-fill, minmax(600px, 1fr))" gap={3} mb={3}>
            {slots.map((slot, idx) => (
              <PlotCard
                key={slot.key}
                slot={slot}
                sensors={sensors}
                onChangeSensor={(name) => changeSensor(idx, name)}
                onRemove={() => removePlot(idx)}
                onDragStart={() => setDragSrc(idx)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(idx);
                }}
                onDrop={() => handleDrop(idx)}
                onDragEnd={() => {
                  setDragSrc(null);
                  setDragOver(null);
                }}
                isDragOver={dragOver === idx && dragSrc !== idx}
              />
            ))}
          </Grid>

          {/* Add plot button */}
          <Flex
            as="button"
            onClick={addPlot}
            align="center"
            justify="center"
            gap={1.5}
            px={5}
            py={2.5}
            border="1px dashed"
            borderColor="border.default"
            borderRadius="card"
            color="text.muted"
            cursor="pointer"
            fontSize="sm"
            transition="all 0.15s"
            _hover={{ borderColor: "accent.solid", color: "accent.solid" }}
          >
            <Icon name="add" size={16} />
            <Box>Add plot</Box>
          </Flex>
        </>
      )}
    </Box>
  );
}

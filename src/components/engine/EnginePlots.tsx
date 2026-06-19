"use client";

import { useState, useCallback, useEffect } from "react";
import { Box, Flex, Grid, chakra } from "@chakra-ui/react";
import { useNovaStore } from "@/lib/store/store";
import { sel } from "@/lib/store/selectors";
import { Card, Icon, Mono, Plot } from "@/components/primitives";
import type { SensorEntry } from "@/lib/types";

const StyledSelect = chakra("select");

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const STORAGE_KEY = "nova.engine.plots";

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
      (x): x is PlotSlot => typeof x?.key === "string" && typeof x?.sensorName === "string",
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

const TYPE_LABELS: Record<string, string> = { PT: "Pressure", TC: "Temp", LC: "Load" };

/** Chakra colour token by sensor type (resolved to a real colour inside Plot). */
function colorToken(type: string): string {
  if (type === "TC") return "warn";
  if (type === "LC") return "nominal";
  return "info";
}

// ---------------------------------------------------------------------------
// Plot card — one rolling chart bound to a single sensor.
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
  slot, sensors, onChangeSensor, onRemove,
  onDragStart, onDragOver, onDrop, onDragEnd, isDragOver,
}: PlotCardProps) {
  const entry = useNovaStore(useCallback(sel.engineValue(slot.sensorName), [slot.sensorName]));
  const isStale = useNovaStore(sel.engineDataStatus) === "stale";

  const sensorMeta = sensors.find((s) => s.name === slot.sensorName);
  const sensorType = sensorMeta?.type ?? "PT";
  const unit = entry?.unit ?? sensorMeta?.unit ?? "";
  const range = sensorMeta?.range; // [min, max] → fixed Y scale (item 5)
  const liveValue = entry != null ? entry.value.toFixed(2) : "—";

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
    >
      <Card nested>
        <Flex align="center" gap={2} px={3} pt={2.5} pb={2} borderBottom="1px solid" borderColor="border.default">
          <Box color="text.muted" cursor="grab" lineHeight={1} flexShrink={0} title="Drag to reorder">
            <Icon name="drag_indicator" size={16} />
          </Box>
          <StyledSelect
            value={slot.sensorName}
            aria-label="Select sensor"
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onChangeSensor(e.target.value)}
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
            color="text.primary"
            cursor="pointer"
            _focus={{ outline: "none", borderColor: "accent.solid" }}
          >
            {sensors.map((s) => (
              <option key={s.name} value={s.name}>{s.name} · {TYPE_LABELS[s.type] ?? s.type}</option>
            ))}
          </StyledSelect>
          <Mono fontSize="2xs" color="text.muted" flexShrink={0}>{unit}</Mono>
          <Mono
            fontSize="xs"
            fontWeight="700"
            color="text.primary"
            flexShrink={0}
            opacity={isStale && entry !== null ? 0.55 : 1}
            minW="52px"
            textAlign="right"
          >
            {liveValue}
          </Mono>
          <Box as="button" aria-label="Remove plot" title="Remove plot" onClick={onRemove} color="text.muted" cursor="pointer" lineHeight={1} flexShrink={0} _hover={{ color: "fault" }}>
            <Icon name="close" size={14} />
          </Box>
        </Flex>

        <Box px={2} pt={2} pb={1.5} opacity={isStale && entry !== null ? 0.7 : 1}>
          <Plot
            series={[{ label: slot.sensorName, colorToken: colorToken(sensorType) }]}
            values={[entry?.value]}
            unit={unit}
            yMin={range?.[0]}
            yMax={range?.[1]}
            height={260}
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

  // Drop slots referencing sensors that no longer exist after a config change.
  useEffect(() => {
    if (!sensors.length || !slots.length) return;
    const names = new Set(sensors.map((s) => s.name));
    if (slots.some((s) => !names.has(s.sensorName))) {
      update(slots.filter((s) => names.has(s.sensorName)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sensors]);

  function addPlot() {
    const existing = new Set(slots.map((s) => s.sensorName));
    const next = sensors.find((s) => !existing.has(s.name)) ?? sensors[0];
    if (!next) return;
    update([...slots, { key: `p${Date.now()}`, sensorName: next.name }]);
  }
  function removePlot(idx: number) { update(slots.filter((_, i) => i !== idx)); }
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
        <Flex direction="column" align="center" justify="center" py={14} gap={3} color="text.muted">
          <Icon name="show_chart" size={32} />
          <Box fontSize="sm">No plots. Click &quot;Add plot&quot; to start.</Box>
          <Box as="button" onClick={addPlot} px={5} py={2} fontSize="sm" fontFamily="mono" border="1px dashed" borderColor="border.default" borderRadius="control" color="text.muted" cursor="pointer" transition="all 0.15s" _hover={{ borderColor: "accent.solid", color: "accent.solid" }}>
            Add plot
          </Box>
        </Flex>
      ) : (
        <>
          <Grid templateColumns="repeat(auto-fill, minmax(600px, 1fr))" gap={3} mb={3}>
            {slots.map((slot, idx) => (
              <PlotCard
                key={slot.key}
                slot={slot}
                sensors={sensors}
                onChangeSensor={(name) => changeSensor(idx, name)}
                onRemove={() => removePlot(idx)}
                onDragStart={() => setDragSrc(idx)}
                onDragOver={(e) => { e.preventDefault(); setDragOver(idx); }}
                onDrop={() => handleDrop(idx)}
                onDragEnd={() => { setDragSrc(null); setDragOver(null); }}
                isDragOver={dragOver === idx && dragSrc !== idx}
              />
            ))}
          </Grid>
          <Flex as="button" onClick={addPlot} align="center" justify="center" gap={1.5} px={5} py={2.5} border="1px dashed" borderColor="border.default" borderRadius="card" color="text.muted" cursor="pointer" fontSize="sm" transition="all 0.15s" _hover={{ borderColor: "accent.solid", color: "accent.solid" }}>
            <Icon name="add" size={16} />
            <Box>Add plot</Box>
          </Flex>
        </>
      )}
    </Box>
  );
}

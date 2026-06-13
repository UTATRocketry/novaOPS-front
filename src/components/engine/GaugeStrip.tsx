"use client";

import { useState, useEffect, useCallback } from "react";
import { Box, Flex, chakra } from "@chakra-ui/react";
import { useNovaStore } from "@/lib/store/store";
import { sel } from "@/lib/store/selectors";
import { Card, Icon, Mono, Gauge, type GaugeZone } from "@/components/primitives";
import type { SensorEntry } from "@/lib/types";

const StyledSelect = chakra("select");

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const STORAGE_KEY = "nova.engine.gauges";

function loadSelection(): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw == null) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((n) => typeof n === "string") : null;
  } catch {
    return null;
  }
}

function saveSelection(names: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(names));
  } catch {
    // storage unavailable
  }
}

// ---------------------------------------------------------------------------
// Zone configs — match prototype colour thresholds
// ---------------------------------------------------------------------------

const PT_ZONES: GaugeZone[] = [
  { upTo: 0.35, color: "info" },
  { upTo: 0.65, color: "nominal" },
  { upTo: 0.85, color: "warn" },
  { upTo: 1,    color: "fault" },
];

const TC_ZONES: GaugeZone[] = [
  { upTo: 0.25, color: "info" },
  { upTo: 0.55, color: "nominal" },
  { upTo: 0.78, color: "warn" },
  { upTo: 1,    color: "fault" },
];

const LC_ZONES: GaugeZone[] = [
  { upTo: 0.35, color: "info" },
  { upTo: 0.65, color: "nominal" },
  { upTo: 0.85, color: "warn" },
  { upTo: 1,    color: "fault" },
];

function zonesForType(type: string): GaugeZone[] {
  if (type === "TC") return TC_ZONES;
  if (type === "LC") return LC_ZONES;
  return PT_ZONES;
}

// Header text colour token per sensor type
function headerColor(type: string): string {
  if (type === "TC") return "warn";
  if (type === "LC") return "nominal";
  return "accent.solid";
}

const TYPE_LABELS: Record<string, string> = {
  PT: "Pressure",
  TC: "Thermocouple",
  LC: "Load",
};

// ---------------------------------------------------------------------------
// Single gauge card
// ---------------------------------------------------------------------------

interface GaugeCardProps {
  sensorName: string;
  sensors: SensorEntry[];
  onChangeSensor: (name: string) => void;
  onRemove: () => void;
}

function GaugeCard({ sensorName, sensors, onChangeSensor, onRemove }: GaugeCardProps) {
  const entry = useNovaStore(useCallback(sel.engineValue(sensorName), [sensorName]));
  const isStale = useNovaStore(sel.engineDataStatus) === "stale";
  const sensorMeta = sensors.find((s) => s.name === sensorName);
  const sensorType = sensorMeta?.type ?? "PT";

  return (
    <Card nested flex="0 0 auto" w="192px" minW="192px">
      {/* Header: coloured sensor name + type label + remove button */}
      <Flex align="center" gap={1.5} px={2.5} pt={2.5} pb={1}>
        <Mono
          fontSize="xs"
          fontWeight="700"
          color={headerColor(sensorType)}
          flex={1}
          minW={0}
          overflow="hidden"
          textOverflow="ellipsis"
          whiteSpace="nowrap"
        >
          {sensorName}
        </Mono>
        <Box fontSize="2xs" color="text.muted" flexShrink={0}>
          {TYPE_LABELS[sensorType] ?? sensorType}
        </Box>
        <Box
          as="button"
          aria-label="Remove gauge"
          title="Remove gauge"
          onClick={onRemove}
          color="text.muted"
          cursor="pointer"
          lineHeight="1"
          flexShrink={0}
          _hover={{ color: "fault" }}
        >
          <Icon name="close" size={14} />
        </Box>
      </Flex>

      {/* Half-circle needle gauge */}
      <Flex justify="center" px={1} pb={0}>
        <Gauge
          value={entry?.value ?? null}
          unit={entry?.unit ?? sensorMeta?.unit}
          min={sensorMeta?.range?.[0] ?? 0}
          max={sensorMeta?.range?.[1] ?? 100}
          zones={zonesForType(sensorType)}
          stale={isStale && entry !== null}
          size={170}
        />
      </Flex>

      {/* Sensor selector */}
      <Box px={2} pb={2.5}>
        <StyledSelect
          value={sensorName}
          aria-label="Select sensor"
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
            onChangeSensor(e.target.value)
          }
          width="100%"
          fontSize="2xs"
          fontFamily="mono"
          bg="bg.surfaceRaised"
          border="1px solid"
          borderColor="border.default"
          borderRadius="control"
          px={2}
          py="5px"
          color="text.muted"
          cursor="pointer"
          _focus={{ outline: "none", borderColor: "accent.solid" }}
        >
          {sensors.map((s) => (
            <option key={s.name} value={s.name}>
              {s.name} — {TYPE_LABELS[s.type] ?? s.type}
            </option>
          ))}
        </StyledSelect>
      </Box>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Strip
// ---------------------------------------------------------------------------

export interface GaugeStripProps {
  sensors: SensorEntry[];
}

export function GaugeStrip({ sensors }: GaugeStripProps) {
  const [gaugeNames, setGaugeNames] = useState<string[] | null>(() => loadSelection());

  // First-mount seed: only when there is no prior selection at all.
  useEffect(() => {
    if (gaugeNames === null && sensors.length > 0) {
      setGaugeNames(sensors.slice(0, Math.min(3, sensors.length)).map((s) => s.name));
    }
  }, [sensors, gaugeNames]);

  const update = useCallback((next: string[]) => {
    setGaugeNames(next);
    saveSelection(next);
  }, []);

  if (sensors.length === 0) return null;

  const current = gaugeNames ?? [];
  const validNames = current.filter((n) => sensors.some((s) => s.name === n));

  function changeSensor(idx: number, name: string) {
    update(validNames.map((n, i) => (i === idx ? name : n)));
  }

  function addGauge() {
    const next = sensors.find((s) => !validNames.includes(s.name)) ?? sensors[0];
    update([...validNames, next.name]);
  }

  function removeGauge(idx: number) {
    update(validNames.filter((_, i) => i !== idx));
  }

  return (
    <Flex gap={3} mt={4} flexWrap="wrap" align="stretch">
      {validNames.map((name, idx) => (
        <GaugeCard
          key={`${idx}-${name}`}
          sensorName={name}
          sensors={sensors}
          onChangeSensor={(n) => changeSensor(idx, n)}
          onRemove={() => removeGauge(idx)}
        />
      ))}
      <Flex
        as="button"
        onClick={addGauge}
        direction="column"
        align="center"
        justify="center"
        minW="80px"
        minH={validNames.length === 0 ? "120px" : undefined}
        border="1px dashed"
        borderColor="border.default"
        borderRadius="card"
        color="text.muted"
        cursor="pointer"
        gap={1}
        px={4}
        py={validNames.length === 0 ? 6 : 0}
        transition="all 0.15s"
        _hover={{ borderColor: "accent.solid", color: "accent.solid" }}
      >
        <Icon name="add" size={20} />
        <Box fontSize="xs">Add gauge</Box>
      </Flex>
    </Flex>
  );
}

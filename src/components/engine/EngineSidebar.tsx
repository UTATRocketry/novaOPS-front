"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Flex, chakra } from "@chakra-ui/react";
import { Card, Chip, Icon, Mono } from "@/components/primitives";
import { cssVar } from "@/lib/helpers";
import { useNovaStore } from "@/lib/store/store";
import { sel } from "@/lib/store/selectors";
import { useConfig } from "@/hooks/useConfig";
import type { ProcedureEntry } from "@/lib/types";
import { ActionsCard } from "./ActionsCard";
import {
  startRecording,
  stopRecording,
  getRecordingStatus,
  toggleCalibration,
  getCalibrationStatus,
  downloadData,
  reloadConfig,
} from "@/lib/api";

// ---------------------------------------------------------------------------
// Procedure card
// ---------------------------------------------------------------------------

interface Step {
  label: string;
}

const NativeSelect = chakra("select");

const DEFAULT_STEPS: Step[] = [
  { label: "Verify all valves closed" },
  { label: "Pressurize pressurant line" },
  { label: "Open fuel fill valve" },
  { label: "Confirm fuel level reading" },
  { label: "Close fuel fill valve" },
  { label: "Arm igniter" },
  { label: "Confirm GO for ignition" },
];

interface ProcedureCardProps {
  steps?: Step[];
}

/**
 * Procedure checklist. Sourced from the backend config `Procedures` section
 * (authored on the Config page) when present, else the built-in default.
 */
function ProcedureCard({ steps: stepsOverride }: ProcedureCardProps) {
  const { data: config } = useConfig();
  const procedures: ProcedureEntry[] = config?.Procedures ?? [];
  const [procIdx, setProcIdx] = useState(0);
  const [active, setActive] = useState(0);

  // Reset progress when switching procedures or when config first arrives.
  useEffect(() => { setActive(0); }, [procIdx, procedures.length]);

  const steps = useMemo<Step[]>(() => {
    if (stepsOverride) return stepsOverride;
    const proc = procedures[procIdx];
    if (proc) return proc.steps.map((label) => ({ label }));
    return DEFAULT_STEPS;
  }, [stepsOverride, procedures, procIdx]);

  const done = active >= steps.length;

  return (
    <Card
      title="Procedure"
      headerAction={
        <Chip status={done ? "nominal" : "info"}>
          {done ? "Complete" : `${active + 1} / ${steps.length}`}
        </Chip>
      }
    >
      {procedures.length > 1 && !stepsOverride && (
        <NativeSelect
          value={String(procIdx)}
          onChange={(e) => setProcIdx(Number(e.target.value))}
          mb={3}
          w="100%"
          bg="bg.canvas"
          borderWidth="1px"
          borderColor="border.default"
          borderRadius="control"
          fontSize="xs"
          fontFamily="mono"
          px={2}
          py={1}
          color="text.primary"
          cursor="pointer"
        >
          {procedures.map((p, i) => <option key={i} value={i}>{p.name || `Procedure ${i + 1}`}</option>)}
        </NativeSelect>
      )}
      <Flex direction="column" gap={1.5}>
        {steps.map((step, idx) => {
          const isCompleted = idx < active;
          const isCurrent = idx === active;
          return (
            <Flex
              key={idx}
              align="flex-start"
              gap={2.5}
              px={2}
              py={1.5}
              borderRadius="control"
              border="1px solid"
              borderColor={isCurrent ? "accent.solid" : "transparent"}
              bg={
                isCurrent
                  ? `color-mix(in srgb, ${cssVar("accent.solid")} 10%, transparent)`
                  : "transparent"
              }
              opacity={isCompleted ? 0.45 : 1}
              transition="all 0.15s"
            >
              <Flex flexShrink={0} mt="1px" w="16px" justify="center">
                {isCompleted ? (
                  <Icon name="check_circle" size={15} fill={1} color="nominal" />
                ) : (
                  <Mono fontSize="xs" color="text.muted" lineHeight="1.4">
                    {idx + 1}
                  </Mono>
                )}
              </Flex>
              <Box
                fontSize="xs"
                lineHeight="1.4"
                color={isCompleted ? "text.muted" : "text.primary"}
              >
                {step.label}
              </Box>
            </Flex>
          );
        })}
      </Flex>

      <Flex justify="space-between" mt={3}>
        <Box
          as="button"
          onClick={active === 0 ? undefined : () => setActive((a) => Math.max(a - 1, 0))}
          aria-disabled={active === 0}
          px={3}
          py={1.5}
          fontSize="xs"
          fontFamily="mono"
          fontWeight="600"
          borderRadius="control"
          border="1px solid"
          borderColor={active === 0 ? "transparent" : "border.default"}
          bg="transparent"
          color={active === 0 ? "transparent" : "text.muted"}
          cursor={active === 0 ? "default" : "pointer"}
          transition="all 0.15s"
          _hover={active === 0 ? {} : { borderColor: "accent.solid", color: "text.primary" }}
        >
          Back
        </Box>
        <Box
          as="button"
          onClick={done ? undefined : () => setActive((a) => Math.min(a + 1, steps.length))}
          aria-disabled={done}
          px={3}
          py={1.5}
          fontSize="xs"
          fontFamily="mono"
          fontWeight="600"
          borderRadius="control"
          bg={done ? "bg.surfaceRaised" : "accent.solid"}
          color={done ? "text.muted" : "white"}
          cursor={done ? "not-allowed" : "pointer"}
          opacity={done ? 0.5 : 1}
          transition="all 0.15s"
          _hover={done ? {} : { opacity: 0.85 }}
        >
          {done ? "Done" : "Next"}
        </Box>
      </Flex>
    </Card>
  );
}


// ---------------------------------------------------------------------------
// Legend card
// ---------------------------------------------------------------------------

const SYSTEM_COLORS: { color: string; label: string }[] = [
  { color: "blue.500", label: "Pressurant" },
  { color: "red.500", label: "Fuel" },
  { color: "green.500", label: "Oxidizer" },
];

const SYMBOL_LEGEND: { symbol: string; label: string }[] = [
  { symbol: "⊗", label: "Ball valve (2-way)" },
  { symbol: "⨂", label: "Ball valve (3-way)" },
  { symbol: "⋈", label: "Solenoid valve" },
  { symbol: "○", label: "Pressure transducer (PT)" },
  { symbol: "□", label: "Thermocouple (TC)" },
  { symbol: "◉", label: "Load cell (LC)" },
];

function LegendCard() {
  return (
    <Card title="Legend">
      <Box
        fontSize="2xs"
        textTransform="uppercase"
        letterSpacing="0.07em"
        color="text.muted"
        mb={2}
      >
        Systems
      </Box>
      <Flex direction="column" gap={1.5} mb={4}>
        {SYSTEM_COLORS.map(({ color, label }) => (
          <Flex key={label} align="center" gap={2}>
            <Box
              flexShrink={0}
              w="20px"
              h="3px"
              bg={color}
              borderRadius="full"
            />
            <Box fontSize="xs" color="text.primary">
              {label}
            </Box>
          </Flex>
        ))}
      </Flex>

      <Box
        fontSize="2xs"
        textTransform="uppercase"
        letterSpacing="0.07em"
        color="text.muted"
        mb={2}
      >
        Symbols
      </Box>
      <Flex direction="column" gap={1.5}>
        {SYMBOL_LEGEND.map(({ symbol, label }) => (
          <Flex key={label} align="center" gap={2}>
            <Mono
              fontSize="sm"
              color="text.primary"
              w="20px"
              textAlign="center"
              flexShrink={0}
            >
              {symbol}
            </Mono>
            <Box fontSize="xs" color="text.muted">
              {label}
            </Box>
          </Flex>
        ))}
      </Flex>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

export interface EngineSidebarProps {
  steps?: Step[];
}

export function EngineSidebar({ steps }: EngineSidebarProps) {
  return (
    <Flex direction="column" gap={4} w="280px" flexShrink={0}>
      <ProcedureCard steps={steps} />
      <ActionsCard />
      <LegendCard />
    </Flex>
  );
}

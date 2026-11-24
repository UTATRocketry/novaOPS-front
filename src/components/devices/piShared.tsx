"use client";

import type { ReactNode } from "react";
import { Box, Flex, Text } from "@chakra-ui/react";
import { Chip, Mono } from "@/components/primitives";
import type { Status } from "@/components/primitives";
import { nodeLink, type NodeLink, type NodeRecord } from "@/lib/pi/nodes";

/** The Pis, in display order, with their command target. Always listed. */
export const PI_NODES: ReadonlyArray<{ node: string; target: string | null }> = [
  { node: "novaGround", target: "GCS" },
  { node: "novaThermo", target: "TCS" },
];

/** The fixed Pis first, then any other node that has reported (e.g. novaSim), sorted. */
export function nodeOrder(...reported: Array<Record<string, unknown>>): Array<{ node: string; target: string | null }> {
  const fixed = new Set(PI_NODES.map((p) => p.node));
  const extra = Array.from(new Set(reported.flatMap((r) => Object.keys(r))))
    .filter((n) => !fixed.has(n))
    .sort()
    .map((node) => ({ node, target: null }));
  return [...PI_NODES, ...extra];
}

/** Local time of a wall-clock ms timestamp; "—" when missing. */
export function fmtTime(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleTimeString();
}

/** Local date and time, for things that can be days old (a start time). */
export function fmtDateTime(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

const LINK_CHIP: Record<NodeLink, { status: Status; label: string }> = {
  online: { status: "nominal", label: "online" },
  offline: { status: "fault", label: "offline" },
  unknown: { status: "neutral", label: "no stats" },
};

/** online / offline / no stats, from the node's stats stream. */
export function NodeLinkChip({ record }: { record: NodeRecord | undefined }) {
  const chip = LINK_CHIP[nodeLink(record)];
  return <Chip status={chip.status}>{chip.label}</Chip>;
}

/** One node's bordered panel inside a card, with its name, target and chips. */
export function NodePanel({
  node,
  target,
  testId,
  chips,
  children,
}: {
  node: string;
  target: string | null;
  testId: string;
  chips?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Box
      flex="1 1 280px"
      minW={0}
      p={3}
      borderRadius="control"
      border="1px solid"
      borderColor="border.default"
      data-testid={testId}
    >
      <Flex align="center" gap={2} mb={2} wrap="wrap">
        <Mono fontSize="sm">{node}</Mono>
        {target && <Mono fontSize="xs" color="text.muted">{target}</Mono>}
        <Box flex={1} />
        {chips}
      </Flex>
      {children}
    </Box>
  );
}

/** Small uppercase heading for a section within a node panel. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Text fontSize="2xs" color="text.muted" textTransform="uppercase" mb={0.5}>
      {children}
    </Text>
  );
}

/** "label value" inline pair, value in mono. */
export function Field({ label, value, color = "text.primary" }: { label: string; value: string; color?: string }) {
  return (
    <Text fontSize="xs" color="text.muted">
      {label} <Mono fontSize="xs" color={color}>{value}</Mono>
    </Text>
  );
}

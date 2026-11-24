"use client";

import { Box, Flex, Text } from "@chakra-ui/react";
import { Card, Chip, Mono } from "@/components/primitives";
import type { Status } from "@/components/primitives";
import { useNovaStore } from "@/lib/store/store";
import { sel } from "@/lib/store/selectors";
import type { PiConfigStatus } from "@/lib/types";
import { mismatchText, outputLabel, piHealth, tripReasonLabel, type PiHealth } from "@/lib/pi";

/** The Pis, in display order. The backend always reports both. */
const PI_NODES: ReadonlyArray<{ node: string; target: string }> = [
  { node: "novaGround", target: "GCS" },
  { node: "novaThermo", target: "TCS" },
];

const HEALTH_CHIP: Record<PiHealth, { status: Status; label: string }> = {
  unknown: { status: "neutral", label: "—" },
  ok: { status: "nominal", label: "config applied" },
  mismatch: { status: "warn", label: "config mismatch" },
  tripped: { status: "fault", label: "output tripped" },
};

function fmtTime(ms: number | null): string {
  if (ms == null) return "—";
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleTimeString();
}

function PiNodeStatus({ node, target, status }: { node: string; target: string; status: PiConfigStatus | undefined }) {
  const health = piHealth(status);
  const chip = HEALTH_CHIP[health];
  return (
    <Box
      flex="1 1 280px"
      minW={0}
      p={3}
      borderRadius="control"
      border="1px solid"
      borderColor="border.default"
      data-testid={`pi-status-${node}`}
    >
      <Flex align="center" gap={2} mb={2} wrap="wrap">
        <Mono fontSize="sm">{node}</Mono>
        <Mono fontSize="xs" color="text.muted">{target}</Mono>
        <Box flex={1} />
        <Chip status={chip.status}>{chip.label}</Chip>
      </Flex>

      {!status ? (
        <Text fontSize="xs" color="text.muted">No status from the backend.</Text>
      ) : !status.received ? (
        <Text fontSize="xs" color="text.muted">The Pi hasn&apos;t reported a config status yet.</Text>
      ) : (
        <Flex direction="column" gap={2}>
          <Flex gap={3} fontSize="xs" wrap="wrap">
            <Text color="text.muted">
              config <Mono fontSize="xs" color="text.primary">{status.config_hash ?? "—"}</Mono>
            </Text>
            <Text color="text.muted">
              applied <Mono fontSize="xs" color="text.primary">{fmtTime(status.applied_ms)}</Mono>
            </Text>
          </Flex>

          {status.mismatch &&
            mismatchText(status).map((t) => (
              <Text key={t} fontSize="xs" color="warn">{t}</Text>
            ))}

          {status.rejected.length > 0 && (
            <Box>
              <Text fontSize="2xs" color="text.muted" textTransform="uppercase" mb={0.5}>Rejected</Text>
              {status.rejected.map((r, i) => (
                <Text key={`${r.item}-${i}`} fontSize="xs">
                  <Mono fontSize="xs" color="warn">{r.item}</Mono>
                  {r.reason ? <Text as="span" color="text.muted">: {r.reason}</Text> : null}
                </Text>
              ))}
            </Box>
          )}

          {status.tripped.length > 0 && (
            <Box>
              <Text fontSize="2xs" color="text.muted" textTransform="uppercase" mb={0.5}>Tripped outputs</Text>
              {status.tripped.map((t, i) => (
                <Flex key={`${t.output}-${i}`} gap={2} fontSize="xs" wrap="wrap" align="baseline">
                  <Mono fontSize="xs" color="fault">{outputLabel(t.output)}</Mono>
                  <Text>{tripReasonLabel(t.reason)}</Text>
                  {t.actuators && t.actuators.length > 0 && (
                    <Mono fontSize="xs" color="text.muted">{t.actuators.join(", ")}</Mono>
                  )}
                  <Mono fontSize="xs" color="text.muted">{fmtTime(t.time_ms)}</Mono>
                </Flex>
              ))}
              <Text fontSize="2xs" color="text.muted" mt={1}>
                A tripped output stays at its safe level until it&apos;s commanded again.
              </Text>
            </Box>
          )}
        </Flex>
      )}
    </Box>
  );
}

/** Presentational: one panel per Pi. */
export function PiConfigStatusView({ statuses }: { statuses: Record<string, PiConfigStatus> }) {
  // Any node the backend reports that isn't in the fixed list still shows.
  const extra = Object.keys(statuses)
    .filter((n) => !PI_NODES.some((p) => p.node === n))
    .map((n) => ({ node: n, target: statuses[n].target }));
  return (
    <Card title="Pi config">
      <Flex gap={3} wrap="wrap">
        {[...PI_NODES, ...extra].map(({ node, target }) => (
          <PiNodeStatus key={node} node={node} target={target} status={statuses[node]} />
        ))}
      </Flex>
    </Card>
  );
}

/** Live per-Pi config status: mismatch, rejected items and tripped outputs. */
export function PiConfigStatusCard() {
  const statuses = useNovaStore(sel.piConfigStatus);
  return <PiConfigStatusView statuses={statuses} />;
}

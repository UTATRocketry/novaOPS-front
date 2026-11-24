"use client";

import { Box, Flex, Text } from "@chakra-ui/react";
import { Card, Chip, Mono } from "@/components/primitives";
import type { Status } from "@/components/primitives";
import { useNovaStore } from "@/lib/store/store";
import { sel } from "@/lib/store/selectors";
import type { PiApplyState, PiConfigStatus } from "@/lib/types";
import type { NodeRecord } from "@/lib/pi/nodes";
import { mismatchText, outputLabel, piApplyState, piHealth, tripReasonLabel, type PiHealth } from "@/lib/pi";
import { Field, NodeLinkChip, NodePanel, PI_NODES, SectionLabel, fmtTime } from "./piShared";

const HEALTH_CHIP: Record<PiHealth, { status: Status; label: string }> = {
  unknown: { status: "neutral", label: "—" },
  ok: { status: "nominal", label: "config applied" },
  mismatch: { status: "warn", label: "config mismatch" },
  tripped: { status: "fault", label: "output tripped" },
};

/** "applied 12:00:01", "pending since 11:59:58", ... with its colour. */
function applyLine(state: PiApplyState, status: PiConfigStatus): { text: string; color: string } {
  switch (state) {
    case "applied":
      return { text: `applied ${fmtTime(status.applied_ms)}`, color: "nominal" };
    case "pending":
      return {
        text: status.published_ms != null
          ? `pending since ${fmtTime(status.published_ms)} (sent, not yet applied)`
          : "pending (Pi holds another config)",
        color: "warn",
      };
    case "rejected":
      return { text: `applied ${fmtTime(status.applied_ms)} with items rejected`, color: "warn" };
    default:
      return { text: "waiting for the Pi", color: "text.muted" };
  }
}

function thermocoupleText(tcs: Record<string, Record<string, string>>): string[] {
  return Object.keys(tcs)
    .sort((a, b) => Number(a) - Number(b))
    .map((hat) => {
      const chans = tcs[hat];
      const list = Object.keys(chans)
        .sort((a, b) => Number(a) - Number(b))
        .map((ch) => `ch${ch} ${chans[ch]}`)
        .join(", ");
      return `HAT ${hat}: ${list || "—"}`;
    });
}

function PiNodeStatus({
  node,
  target,
  status,
  record,
}: {
  node: string;
  target: string | null;
  status: PiConfigStatus | undefined;
  record: NodeRecord | undefined;
}) {
  const chip = HEALTH_CHIP[piHealth(status)];
  const info = record?.info ?? null;
  const buildId = info?.build_id ?? info?.hardware?.build_id ?? null;
  return (
    <NodePanel
      node={node}
      target={target}
      testId={`pi-status-${node}`}
      chips={
        <>
          <NodeLinkChip record={record} />
          <Chip status={chip.status}>{chip.label}</Chip>
        </>
      }
    >
      <Flex direction="column" gap={2}>
        <Flex gap={3} wrap="wrap">
          <Field label="build" value={buildId ?? "—"} />
          {info?.actuation && (
            <Field label="actuation" value={info.actuation} color={info.actuation === "enabled" ? "text.primary" : "warn"} />
          )}
        </Flex>

        {!status ? (
          <Text fontSize="xs" color="text.muted">No status from the backend.</Text>
        ) : !status.received ? (
          <Flex direction="column" gap={1}>
            <Text fontSize="xs" color="text.muted">The Pi hasn&apos;t reported a config status yet.</Text>
            <Flex gap={3} wrap="wrap">
              <Field label="sent" value={status.expected_hash ?? "—"} />
              {status.published_ms != null && <Field label="at" value={fmtTime(status.published_ms)} />}
            </Flex>
          </Flex>
        ) : (
          <>
            {(() => {
              const line = applyLine(piApplyState(status), status);
              return (
                <Text fontSize="xs" color={line.color} data-testid={`pi-apply-${node}`}>
                  {line.text}
                </Text>
              );
            })()}
            <Flex gap={3} wrap="wrap">
              <Field label="config" value={status.config_hash ?? "—"} />
              {status.expected_hash !== status.config_hash && (
                <Field label="sent" value={status.expected_hash ?? "—"} />
              )}
              <Field label="last status" value={fmtTime(status.received_ms)} />
            </Flex>

            {status.mismatch &&
              mismatchText(status).map((t) => (
                <Text key={t} fontSize="xs" color="warn">{t}</Text>
              ))}

            {status.rejected.length > 0 && (
              <Box>
                <SectionLabel>Rejected</SectionLabel>
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
                <SectionLabel>Tripped outputs</SectionLabel>
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

            {Object.keys(status.thermocouples).length > 0 && (
              <Box>
                <SectionLabel>Thermocouple types</SectionLabel>
                {thermocoupleText(status.thermocouples).map((t) => (
                  <Mono key={t} fontSize="xs" display="block">{t}</Mono>
                ))}
              </Box>
            )}

            {status.reserved_pins.length > 0 && (
              <Box>
                <SectionLabel>Reserved GPIO</SectionLabel>
                <Mono fontSize="xs" color="text.muted">{status.reserved_pins.join(", ")}</Mono>
              </Box>
            )}
          </>
        )}
      </Flex>
    </NodePanel>
  );
}

/** Presentational: one panel per Pi. */
export function PiConfigStatusView({
  statuses,
  nodes = {},
}: {
  statuses: Record<string, PiConfigStatus>;
  nodes?: Record<string, NodeRecord>;
}) {
  // Any node the backend reports a config status for that isn't in the fixed list still shows.
  const extra = Object.keys(statuses)
    .filter((n) => !PI_NODES.some((p) => p.node === n))
    .map((n) => ({ node: n, target: statuses[n].target }));
  return (
    <Card title="Pi config">
      <Flex gap={3} wrap="wrap">
        {[...PI_NODES, ...extra].map(({ node, target }) => (
          <PiNodeStatus key={node} node={node} target={target} status={statuses[node]} record={nodes[node]} />
        ))}
      </Flex>
    </Card>
  );
}

/** Live per-Pi config status: applied/pending, mismatch, rejected items, trips, build. */
export function PiConfigStatusCard() {
  const statuses = useNovaStore(sel.piConfigStatus);
  const nodes = useNovaStore(sel.nodes);
  return <PiConfigStatusView statuses={statuses} nodes={nodes} />;
}

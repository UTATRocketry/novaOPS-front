"use client";

import { Box, Flex, Text } from "@chakra-ui/react";
import { Card, Chip, Mono } from "@/components/primitives";
import { useNovaStore } from "@/lib/store/store";
import { sel } from "@/lib/store/selectors";
import {
  ERROR_COUNTERS,
  counterLabel,
  hardwarePartLabel,
  type NodeHardware,
  type NodeRecord,
  type StatReport,
} from "@/lib/pi/nodes";
import { num, uptime } from "./shared";
import { Field, NodeLinkChip, NodePanel, SectionLabel, fmtDateTime, fmtTime, nodeOrder } from "./piShared";

/** "p50 1.02 · p99 1.40 · max 2.10 ms" of the last window, or the total when the window is empty. */
function timing(report: StatReport): string {
  const s = report.last && report.last.count > 0 ? report.last : report.total;
  if (!s || s.count === 0) return "—";
  return `p50 ${num(s.p50)} · p99 ${num(s.p99)} · max ${num(s.max)} ms`;
}

function Hardware({ hardware }: { hardware: NodeHardware }) {
  const missing = new Set(hardware.missing);
  return (
    <Box>
      <SectionLabel>Hardware</SectionLabel>
      {missing.size > 0 && (
        <Text fontSize="xs" color="fault" mb={1} data-testid="hardware-missing">
          Missing expected hardware: {hardware.missing.map(hardwarePartLabel).join(", ")}. Its commands are refused
          and its readings are absent.
        </Text>
      )}
      {Object.entries(hardware.parts).map(([name, p]) => {
        const isMissing = missing.has(name);
        const state = isMissing ? "MISSING" : p.found ? (p.expected ? "found" : "found, not expected") : "not fitted";
        return (
          <Flex key={name} gap={2} fontSize="xs" align="baseline" wrap="wrap" data-testid={`hw-${name}`}>
            <Text color={isMissing ? "fault" : "text.muted"} minW="150px">{hardwarePartLabel(name)}</Text>
            <Mono fontSize="xs" color={isMissing ? "fault" : p.found ? "text.primary" : "text.muted"}>{state}</Mono>
            {p.detail && <Mono fontSize="xs" color="text.muted">{p.detail}</Mono>}
          </Flex>
        );
      })}
    </Box>
  );
}

function NodeStatsPanel({ node, target, record }: { node: string; target: string | null; record: NodeRecord | undefined }) {
  const info = record?.info ?? null;
  const stats = record?.stats ?? null;
  const hardware = info?.hardware ?? null;
  const missing = hardware?.missing.length ?? 0;
  const loopNames = Array.from(new Set([...Object.keys(info?.loops ?? {}), ...Object.keys(stats?.loops ?? {})])).sort();
  const commandTypes = Object.keys(stats?.commands ?? {}).sort();
  const counters = Object.entries(stats?.counters ?? {}).sort(([a], [b]) => a.localeCompare(b));

  return (
    <NodePanel
      node={node}
      target={target}
      testId={`node-stats-${node}`}
      chips={
        <>
          {hardware && (
            <Chip status={missing > 0 ? "fault" : "nominal"}>
              {missing > 0 ? `${missing} missing` : "hardware ok"}
            </Chip>
          )}
          <NodeLinkChip record={record} />
        </>
      }
    >
      {!info && !stats ? (
        <Text fontSize="xs" color="text.muted">No stats from this node (offline, or stats off).</Text>
      ) : (
        <Flex direction="column" gap={2}>
          <Flex gap={3} wrap="wrap">
            <Field label="build" value={info?.build_id ?? hardware?.build_id ?? "—"} />
            <Field label="started" value={fmtDateTime(info?.started_ms)} />
            <Field label="uptime" value={stats?.uptime_s != null ? uptime(stats.uptime_s * 1000) : "—"} />
          </Flex>
          <Flex gap={3} wrap="wrap">
            <Field label="interval" value={info?.stats_interval_ms != null ? `${info.stats_interval_ms} ms` : "—"} />
            <Field label="last stats" value={fmtTime(stats?.time_ms)} />
            <Field label="seq" value={stats?.seq != null ? String(stats.seq) : "—"} />
          </Flex>

          {hardware && <Hardware hardware={hardware} />}

          {loopNames.length > 0 && (
            <Box>
              <SectionLabel>Loops (period)</SectionLabel>
              {loopNames.map((name) => {
                const l = stats?.loops[name];
                const configured = info?.loops[name]?.configured_ms;
                const overruns = l?.overruns ?? null;
                return (
                  <Flex key={name} gap={2} fontSize="xs" align="baseline" wrap="wrap" data-testid={`loop-${name}`}>
                    <Mono fontSize="xs" minW="80px">{name}</Mono>
                    <Mono fontSize="xs" color="text.muted">{configured != null ? `every ${configured} ms` : "—"}</Mono>
                    <Mono fontSize="xs">{l ? timing(l.period_ms) : "—"}</Mono>
                    <Mono fontSize="xs" color={overruns ? "warn" : "text.muted"}>
                      {overruns != null ? `${overruns} overrun${overruns === 1 ? "" : "s"} / ${l?.ticks ?? "—"} ticks` : ""}
                    </Mono>
                  </Flex>
                );
              })}
            </Box>
          )}

          {commandTypes.length > 0 && (
            <Box>
              <SectionLabel>Commands (receive → done)</SectionLabel>
              {commandTypes.map((type) => {
                const c = stats!.commands[type];
                return (
                  <Flex key={type} gap={2} fontSize="xs" align="baseline" wrap="wrap">
                    <Mono fontSize="xs" minW="80px">{type}</Mono>
                    <Mono fontSize="xs" color="text.muted">{c.count ?? "—"}×</Mono>
                    <Mono fontSize="xs">{timing(c.received_to_done_ms)}</Mono>
                  </Flex>
                );
              })}
            </Box>
          )}

          {counters.length > 0 && (
            <Box>
              <SectionLabel>Counters (since start)</SectionLabel>
              <Box display="grid" gridTemplateColumns="repeat(auto-fill, minmax(180px, 1fr))" columnGap={4}>
                {counters.map(([key, value]) => {
                  const bad = ERROR_COUNTERS.has(key) && value > 0;
                  return (
                    <Flex key={key} justify="space-between" gap={2} data-testid={`counter-${key}`}>
                      <Text fontSize="xs" color={bad ? "warn" : "text.muted"}>{counterLabel(key)}</Text>
                      <Mono fontSize="xs" color={bad ? "warn" : "text.primary"}>{value}</Mono>
                    </Flex>
                  );
                })}
              </Box>
            </Box>
          )}
        </Flex>
      )}
    </NodePanel>
  );
}

/** Presentational: identity, hardware report, loop timing, command latency and counters per node. */
export function NodeStatsView({ nodes }: { nodes: Record<string, NodeRecord> }) {
  return (
    <Card title="Node stats" flex="1" minW="320px">
      <Flex gap={3} wrap="wrap">
        {nodeOrder(nodes).map(({ node, target }) => (
          <NodeStatsPanel key={node} node={node} target={target} record={nodes[node]} />
        ))}
      </Flex>
    </Card>
  );
}

/** Live per-node runtime stats (`nova/stats/<node>` and its retained `/info`). */
export function NodeStatsCard() {
  const nodes = useNovaStore(sel.nodes);
  return <NodeStatsView nodes={nodes} />;
}

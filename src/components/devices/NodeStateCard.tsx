"use client";

import { Box, Flex, Grid, Text } from "@chakra-ui/react";
import { Card, Chip, Mono } from "@/components/primitives";
import { useNovaStore } from "@/lib/store/store";
import { sel } from "@/lib/store/selectors";
import type { PiConfigStatus } from "@/lib/types";
import { relayLevel, type NodeRecord, type NodeState } from "@/lib/pi/nodes";
import { outputLabel, tripReasonLabel } from "@/lib/pi";
import { Field, NodeLinkChip, NodePanel, SectionLabel, fmtTime, nodeOrder } from "./piShared";

/** The TCA9535 relay board has 16 channels. */
const RELAY_CHANNELS = 16;

function ReadFailed({ what }: { what: string }) {
  return <Text fontSize="xs" color="fault">{what} read-back failed</Text>;
}

function Relays({ relays }: { relays: NonNullable<NodeState["relays"]> }) {
  if (!relays.ok || relays.mask == null) return <ReadFailed what="Relay" />;
  return (
    <>
      <Grid templateColumns="repeat(8, minmax(0, 1fr))" gap={1}>
        {Array.from({ length: RELAY_CHANNELS }, (_, ch) => {
          // Active-low board: level 0 energizes the relay, 1 (startup, safe) releases it.
          const energized = relayLevel(relays.mask, ch) === 0;
          return (
            <Box
              key={ch}
              px={1}
              py={0.5}
              textAlign="center"
              borderRadius="control"
              border="1px solid"
              borderColor={energized ? "nominal" : "border.default"}
              data-testid={`relay-${ch}`}
              data-energized={energized}
            >
              <Mono fontSize="2xs" color={energized ? "nominal" : "text.muted"}>
                R{ch} {energized ? "on" : "off"}
              </Mono>
            </Box>
          );
        })}
      </Grid>
      <Text fontSize="2xs" color="text.muted" mt={1}>
        Read back from the board. &quot;on&quot; = energized (level 0, the board is active-low).
      </Text>
    </>
  );
}

function Servos({ servos }: { servos: NonNullable<NodeState["servos"]> }) {
  const active = servos.channels.filter((c) => c.output !== "off");
  const off = servos.channels.length - active.length;
  return (
    <>
      {!servos.ok && <ReadFailed what="Servo" />}
      {active.map((c) => (
        <Flex key={c.id} gap={2} fontSize="xs" align="baseline">
          <Mono fontSize="xs">ch{c.id}</Mono>
          <Mono fontSize="xs" color={c.output === "unreadable" ? "fault" : "text.primary"}>
            {c.output === "pulse" && c.pulse_us != null ? `pulse ${c.pulse_us} µs` : c.output}
          </Mono>
        </Flex>
      ))}
      <Text fontSize="2xs" color="text.muted">
        {active.length === 0 ? `All ${off} channels off` : `${off} other channel${off === 1 ? "" : "s"} off`}
      </Text>
    </>
  );
}

function Gpios({ gpios }: { gpios: NonNullable<NodeState["gpios"]> }) {
  if (!gpios.ok) return <ReadFailed what="GPIO" />;
  if (gpios.outputs.length === 0) return <Text fontSize="xs" color="text.muted">No GPIO outputs claimed.</Text>;
  return (
    <Flex gap={2} wrap="wrap">
      {gpios.outputs.map((g) => (
        <Chip key={g.pin} status={g.level === 1 ? "nominal" : "neutral"} data-testid={`gpio-${g.pin}`}>
          <Mono fontSize="2xs">GPIO {g.pin} {g.level === 1 ? "high" : g.level === 0 ? "low" : "?"}</Mono>
        </Chip>
      ))}
    </Flex>
  );
}

function NodeStatePanel({
  node,
  target,
  record,
  status,
}: {
  node: string;
  target: string | null;
  record: NodeRecord | undefined;
  status: PiConfigStatus | undefined;
}) {
  const state = record?.state ?? null;
  const actuation = record?.info?.actuation ?? null;
  const trips = status?.tripped ?? [];
  return (
    <NodePanel
      node={node}
      target={target}
      testId={`node-state-${node}`}
      chips={
        <>
          {actuation && actuation !== "enabled" && <Chip status="warn">actuation {actuation}</Chip>}
          <NodeLinkChip record={record} />
        </>
      }
    >
      {!state ? (
        <Text fontSize="xs" color="text.muted">No actuator read-back from this node.</Text>
      ) : (
        <Flex direction="column" gap={2}>
          <Flex gap={3} wrap="wrap">
            <Field label="read back" value={fmtTime(state.time_ms)} />
            <Field label="actuation" value={actuation ?? "—"} color={actuation && actuation !== "enabled" ? "warn" : "text.primary"} />
          </Flex>
          {actuation === "stopped" && (
            <Text fontSize="xs" color="warn">--stop-actuate: every output write is dropped.</Text>
          )}

          {trips.length > 0 && (
            <Box>
              <SectionLabel>Tripped (held at safe level)</SectionLabel>
              {trips.map((t, i) => (
                <Flex key={`${t.output}-${i}`} gap={2} fontSize="xs" wrap="wrap" align="baseline">
                  <Mono fontSize="xs" color="fault">{outputLabel(t.output)}</Mono>
                  <Text>{tripReasonLabel(t.reason)}</Text>
                </Flex>
              ))}
            </Box>
          )}

          <Box>
            <SectionLabel>Relays</SectionLabel>
            {state.relays ? <Relays relays={state.relays} /> : <Text fontSize="xs" color="text.muted">No relay board.</Text>}
          </Box>
          <Box>
            <SectionLabel>Servos</SectionLabel>
            {state.servos ? <Servos servos={state.servos} /> : <Text fontSize="xs" color="text.muted">No servo driver.</Text>}
          </Box>
          <Box>
            <SectionLabel>GPIO outputs</SectionLabel>
            {state.gpios ? <Gpios gpios={state.gpios} /> : <Text fontSize="xs" color="text.muted">No GPIO.</Text>}
          </Box>
        </Flex>
      )}
    </NodePanel>
  );
}

/** Presentational: what each node's outputs hold, as read back from its drivers. */
export function NodeStateView({
  nodes,
  statuses = {},
}: {
  nodes: Record<string, NodeRecord>;
  statuses?: Record<string, PiConfigStatus>;
}) {
  return (
    <Card title="Node state" flex="1" minW="320px">
      <Flex gap={3} wrap="wrap">
        {nodeOrder(nodes).map(({ node, target }) => (
          <NodeStatePanel key={node} node={node} target={target} record={nodes[node]} status={statuses[node]} />
        ))}
      </Flex>
    </Card>
  );
}

/** Live per-node actuator read-back (`nova/state/<node>`), actuation mode and trips. */
export function NodeStateCard() {
  const nodes = useNovaStore(sel.nodes);
  const statuses = useNovaStore(sel.piConfigStatus);
  return <NodeStateView nodes={nodes} statuses={statuses} />;
}

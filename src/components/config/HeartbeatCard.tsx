"use client";

import { Box, Flex, Text } from "@chakra-ui/react";
import { Card } from "@/components/primitives";
import type { HeartbeatConfig } from "@/lib/types";
import {
  DEFAULT_HEARTBEAT_TIMEOUT_MS,
  HEARTBEAT_TIMEOUT_MAX_MS,
  HEARTBEAT_TIMEOUT_MIN_MS,
} from "@/lib/config/piIo";
import { NumberCell } from "./fields";

export interface HeartbeatCardProps {
  /** The config's `Heartbeat` section; undefined when the config has none. */
  heartbeat: HeartbeatConfig | undefined;
  onChange: (next: HeartbeatConfig | undefined) => void;
}

/**
 * Top-level `Heartbeat` section. The backend sends a heartbeat to the Pis;
 * when none arrives within `timeout_ms`, each Pi returns outputs set to
 * `on_comms_loss: safe` to their safe level. Clearing the field removes the
 * section, so the backend's default applies.
 */
export function HeartbeatCard({ heartbeat, onChange }: HeartbeatCardProps) {
  return (
    <Card title="Heartbeat">
      <Flex gap={3} align="flex-end" flexWrap="wrap">
        <Box minW="120px">
          <Text fontSize="2xs" color="text.muted" mb={0.5}>timeout_ms</Text>
          <NumberCell
            value={heartbeat?.timeout_ms}
            placeholder={String(DEFAULT_HEARTBEAT_TIMEOUT_MS)}
            onChange={(v) => {
              const rest = { ...(heartbeat ?? {}) };
              delete rest.timeout_ms;
              const next = v === undefined ? rest : { ...rest, timeout_ms: v };
              onChange(Object.keys(next).length ? next : undefined);
            }}
          />
        </Box>
        <Text fontSize="xs" color="text.muted" maxW="60ch">
          Pi outputs with on_comms_loss: safe turn off when no backend heartbeat arrives within this time.
          {HEARTBEAT_TIMEOUT_MIN_MS}-{HEARTBEAT_TIMEOUT_MAX_MS} ms; empty uses the default ({DEFAULT_HEARTBEAT_TIMEOUT_MS} ms).
        </Text>
      </Flex>
    </Card>
  );
}

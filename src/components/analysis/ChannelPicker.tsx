"use client";

import { useMemo } from "react";
import { Box, Flex, Text } from "@chakra-ui/react";
import { Card, Chip, Icon, Mono } from "@/components/primitives";
import { MiniButton } from "./controls";
import { describeColumnKey } from "@/lib/analysis";
import type { Channel, ChannelSkipReason, Dataset } from "@/lib/analysis";

const ORIGIN_LABEL: Record<Channel["origin"], string> = {
  calibrated: "cal",
  raw: "raw",
};

/**
 * A sensor can fail to resolve for three different reasons, and the distinction
 * is operationally important: "no log for that subsystem" is a missing file,
 * while "column absent" points at a genuine binding or firmware mismatch.
 */
const SKIP_LABEL: Record<ChannelSkipReason, string> = {
  "missing-column": "no column",
  "source-not-loaded": "no log",
  "invalid-calibration": "bad cal",
};

const SKIP_STATUS: Record<ChannelSkipReason, "neutral" | "warn" | "fault"> = {
  "missing-column": "warn",
  "source-not-loaded": "neutral",
  "invalid-calibration": "fault",
};

const SKIP_HINT: Record<ChannelSkipReason, string> = {
  "missing-column":
    "That subsystem's log is loaded, but it has no such column — check the binding in Config.",
  "source-not-loaded": "No log from that subsystem is loaded.",
  "invalid-calibration": "The sensor's calibration table in the config is malformed.",
};

export interface ChannelPickerProps {
  dataset: Dataset;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onSetAll: (ids: string[]) => void;
  colors: Map<string, string>;
}

function ChannelRow({
  channel,
  checked,
  color,
  onToggle,
}: {
  channel: Channel;
  checked: boolean;
  color: string;
  onToggle: () => void;
}) {
  return (
    <Flex
      as="button"
      role="switch"
      aria-checked={checked}
      onClick={onToggle}
      align="center"
      gap={2}
      width="100%"
      textAlign="left"
      px={2}
      py={1.5}
      borderRadius="control"
      cursor="pointer"
      bg="transparent"
      _hover={{ bg: "bg.surfaceRaised" }}
      title={channel.applied.length ? channel.applied.join(" → ") : "No processing applied"}
    >
      <Box
        flexShrink={0}
        width="10px"
        height="10px"
        borderRadius="2px"
        bg={checked ? color : "transparent"}
        border="1px solid"
        borderColor={color}
        opacity={checked ? 1 : 0.5}
      />
      <Mono
        fontSize="xs"
        color={checked ? "text.primary" : "text.muted"}
        fontWeight={checked ? "600" : "400"}
        flex={1}
        minW={0}
        truncate
      >
        {channel.name}
      </Mono>
      {/* Which subsystem's file this channel was read from. Shown because
          `hat0_ch0` exists in both a novaGround and a novaThermo log. */}
      <Text
        fontSize="2xs"
        color="text.muted"
        flexShrink={0}
        title={`${channel.binding.source} · ${channel.binding.colKey}`}
      >
        {channel.binding.source}
      </Text>
      <Text fontSize="2xs" color="text.muted" flexShrink={0}>
        {ORIGIN_LABEL[channel.origin]}
      </Text>
      <Mono fontSize="2xs" color="text.muted" flexShrink={0} minW="34px" textAlign="right">
        {channel.unit || "—"}
      </Mono>
    </Flex>
  );
}

/**
 * Channel roster: what is plotted, what was resolved from the config, and —
 * just as important for a control surface — what was *not*. A configured
 * sensor whose column is missing from the CSV is listed explicitly rather than
 * silently omitted, so a mis-bound channel is visible instead of looking like
 * a sensor that simply read nothing.
 */
export function ChannelPicker({
  dataset,
  selected,
  onToggle,
  onSetAll,
  colors,
}: ChannelPickerProps) {
  const byUnit = useMemo(() => {
    const map = new Map<string, Channel[]>();
    for (const ch of dataset.channels) {
      const key = ch.unit || "unitless";
      const list = map.get(key);
      if (list) list.push(ch);
      else map.set(key, [ch]);
    }
    return [...map.entries()];
  }, [dataset.channels]);

  const allIds = dataset.channels.map((c) => c.id);

  return (
    <Card
      title="Channels"
      headerAction={
        <Flex gap={1.5}>
          <MiniButton onClick={() => onSetAll(allIds)} disabled={selected.size === allIds.length}>
            All
          </MiniButton>
          <MiniButton onClick={() => onSetAll([])} disabled={selected.size === 0}>
            None
          </MiniButton>
        </Flex>
      }
    >
      <Flex direction="column" gap={3}>
        {byUnit.length === 0 && (
          <Text fontSize="xs" color="text.muted">
            No configured sensor matched a column in this file.
          </Text>
        )}

        {byUnit.map(([unit, channels]) => (
          <Box key={unit}>
            <Flex align="center" justify="space-between" mb={1}>
              <Text fontSize="2xs" color="text.muted" letterSpacing="0.08em" fontWeight="600">
                {unit.toUpperCase()}
              </Text>
              <MiniButton
                onClick={() => {
                  const ids = channels.map((c) => c.id);
                  const allOn = ids.every((id) => selected.has(id));
                  const next = new Set(selected);
                  ids.forEach((id) => (allOn ? next.delete(id) : next.add(id)));
                  onSetAll([...next]);
                }}
              >
                toggle
              </MiniButton>
            </Flex>
            {channels.map((ch) => (
              <ChannelRow
                key={ch.id}
                channel={ch}
                checked={selected.has(ch.id)}
                color={colors.get(ch.id) ?? "plot.1"}
                onToggle={() => onToggle(ch.id)}
              />
            ))}
          </Box>
        ))}

        {/* Unresolved sensors — surfaced, never silently dropped. */}
        {dataset.skipped.length > 0 && (
          <Box borderTop="1px solid" borderColor="border.default" pt={3}>
            <Text fontSize="2xs" color="text.muted" letterSpacing="0.08em" fontWeight="600" mb={2}>
              UNRESOLVED SENSORS ({dataset.skipped.length})
            </Text>
            <Flex direction="column" gap={1}>
              {dataset.skipped.map((s) => (
                <Flex
                  key={`${s.name}:${s.colKey}`}
                  align="center"
                  gap={2}
                  fontSize="2xs"
                  color="text.muted"
                >
                  <Icon
                    name={s.reason === "invalid-calibration" ? "error" : "help"}
                    size={13}
                    color="currentColor"
                  />
                  <Mono fontSize="2xs" color="text.muted" flex={1} minW={0} truncate>
                    {s.name}
                  </Mono>
                  <Mono fontSize="2xs" color="text.muted" flexShrink={0}>
                    {s.source} {s.colKey}
                  </Mono>
                  <Box title={SKIP_HINT[s.reason]}>
                    <Chip status={SKIP_STATUS[s.reason]}>{SKIP_LABEL[s.reason]}</Chip>
                  </Box>
                </Flex>
              ))}
            </Flex>
          </Box>
        )}

        {dataset.unboundColumns.length > 0 && (
          <Box borderTop="1px solid" borderColor="border.default" pt={3}>
            <Text fontSize="2xs" color="text.muted" letterSpacing="0.08em" fontWeight="600" mb={1.5}>
              UNBOUND COLUMNS ({dataset.unboundColumns.length})
            </Text>
            <Text fontSize="2xs" color="text.muted" lineHeight="1.5" mb={1.5}>
              Present in the CSV but not referenced by any sensor in the loaded config.
            </Text>
            <Flex gap={1} flexWrap="wrap">
              {dataset.unboundColumns.map((c) => (
                <Chip key={c} status="neutral">
                  {describeColumnKey(c)}
                </Chip>
              ))}
            </Flex>
          </Box>
        )}
      </Flex>
    </Card>
  );
}

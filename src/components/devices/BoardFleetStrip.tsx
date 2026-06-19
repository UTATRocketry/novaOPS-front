"use client";

import { Box, Flex, Text } from "@chakra-ui/react";
import { Card, Chip, Mono, StatusDot } from "@/components/primitives";
import type { FasBoard } from "@/lib/flight/types";
import { uptime } from "./shared";

export interface BoardFleetStripProps {
  boards: FasBoard[];
  /** True when the flight stream is stale — board liveness can't be trusted. */
  stale?: boolean;
}

function BoardTile({ board, stale }: { board: FasBoard; stale: boolean }) {
  // online only counts when the stream is live; a stale stream means unknown.
  const online = board.online && !stale;
  const status = online ? "nominal" : board.online ? "warn" : "neutral";
  const label = online ? "online" : board.online ? "stale" : "offline";

  return (
    <Box
      minW="170px"
      flex="1"
      border="1px solid"
      borderColor="border.default"
      borderRadius="card"
      bg="bg.surfaceRaised"
      p={3}
    >
      <Flex align="center" justify="space-between" gap={2} mb={2}>
        <Flex align="center" gap={2}>
          <Mono fontSize="sm" fontWeight="700" color="text.primary">{board.key}</Mono>
          <Chip status="neutral">{board.kind}</Chip>
        </Flex>
        <Flex align="center" gap={1.5}>
          <StatusDot status={status} size={8} glow={status !== "neutral"} />
          <Text fontSize="2xs" color="text.muted">{label}</Text>
        </Flex>
      </Flex>
      <Flex direction="column" gap={1}>
        <Flex align="baseline" justify="space-between">
          <Text fontSize="2xs" color="text.muted">uptime</Text>
          <Mono fontSize="2xs" color="text.primary">{uptime(board.uptimeMs)}</Mono>
        </Flex>
        <Flex align="baseline" justify="space-between">
          <Text fontSize="2xs" color="text.muted">firmware</Text>
          <Mono fontSize="2xs" color="text.primary">{board.fwVersion != null ? `v${board.fwVersion}` : "—"}</Mono>
        </Flex>
        <Flex align="baseline" justify="space-between">
          <Text fontSize="2xs" color="text.muted">channels</Text>
          <Mono fontSize="2xs" color="text.primary">{board.numChannels ?? "—"}</Mono>
        </Flex>
        <Flex align="baseline" justify="space-between">
          <Text fontSize="2xs" color="text.muted">sensors</Text>
          <Mono fontSize="2xs" color="text.primary">{board.numSensors ?? "—"}</Mono>
        </Flex>
      </Flex>
    </Box>
  );
}

export function BoardFleetStrip({ boards, stale = false }: BoardFleetStripProps) {
  return (
    <Card
      title="Board Fleet"
      headerAction={<Chip status={boards.length ? "info" : "neutral"}>{boards.length} boards</Chip>}
    >
      {boards.length === 0 ? (
        <Text fontSize="sm" color="text.muted">No boards reported on the bus.</Text>
      ) : (
        <Flex gap={3} flexWrap="wrap">
          {boards.map((b) => (
            <BoardTile key={b.key} board={b} stale={stale} />
          ))}
        </Flex>
      )}
    </Card>
  );
}

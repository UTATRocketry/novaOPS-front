"use client";

import { Box, Flex, Text } from "@chakra-ui/react";
import { Card, Chip, Icon } from "@/components/primitives";

/**
 * Per-board sample rate + clock skew (firmware time − host time).
 *
 * The current flight_data packet carries no rate/latency fields — in the
 * reference FAS controller these came from a separate server-side rates/latency
 * broadcast. Rather than fabricate numbers, this is an explicit backend
 * dependency placeholder. Wire it once that broadcast exists in the WS contract.
 */
export function DiagnosticsCard() {
  return (
    <Card
      title="Diagnostics"
      flex="1"
      minW="320px"
      headerAction={<Chip status="warn">awaiting backend</Chip>}
    >
      <Flex direction="column" align="center" justify="center" gap={2} py={8} color="text.muted">
        <Icon name="monitor_heart" size={28} />
        <Text fontSize="sm">Per-board sample rate &amp; clock skew</Text>
        <Box fontSize="xs" textAlign="center" maxW="320px">
          Not in the current <Box as="span" fontFamily="mono">flight_data</Box> packet. Needs a
          rates/latency broadcast in the WebSocket contract before it can be shown — no values are
          fabricated here.
        </Box>
      </Flex>
    </Card>
  );
}

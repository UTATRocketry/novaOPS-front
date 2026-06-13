"use client";

import { Flex, Text } from "@chakra-ui/react";
import { Card, Mono } from "@/components/primitives";

export interface AltitudeTrendPlaceholderProps {
  altitude?: number;
}

export function AltitudeTrendPlaceholder({ altitude }: AltitudeTrendPlaceholderProps) {
  return (
    <Card title="Altitude" minH="180px">
      <Flex direction="column" align="center" justify="center" gap={1} py={6}>
        <Flex align="baseline" gap={1}>
          <Mono fontSize="4xl" fontWeight="700" color={altitude !== undefined ? "text.primary" : "text.muted"}>
            {altitude !== undefined ? altitude.toFixed(1) : "—"}
          </Mono>
          {altitude !== undefined && (
            <Mono fontSize="xl" color="text.muted">m</Mono>
          )}
        </Flex>
        <Text fontSize="xs" color="text.muted" mt={1}>
          Live chart coming soon
        </Text>
      </Flex>
    </Card>
  );
}

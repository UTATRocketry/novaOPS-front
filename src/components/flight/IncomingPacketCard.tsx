"use client";

import { Box, Flex, Text } from "@chakra-ui/react";
import { Card, StatusDot, Mono } from "@/components/primitives";

export interface IncomingPacketCardProps {
  rawPacket?: string;
  live: boolean;
}

export function IncomingPacketCard({ rawPacket, live }: IncomingPacketCardProps) {
  const headerAction = (
    <Flex align="center" gap={1.5}>
      <StatusDot status={live ? "nominal" : "neutral"} />
      <Text fontSize="xs" fontFamily="mono" color={live ? "nominal" : "text.muted"}>
        {live ? "LIVE" : "OFFLINE"}
      </Text>
    </Flex>
  );

  return (
    <Card title="Incoming Data Packet" headerAction={headerAction}>
      <Box
        bg="#0a0e16"
        border="1px solid"
        borderColor="border.default"
        borderRadius="control"
        p={3}
        maxH="120px"
        overflowY="auto"
        fontFamily="mono"
        fontSize="xs"
        lineHeight="1.6"
        color="nominal"
        whiteSpace="pre-wrap"
        wordBreak="break-all"
      >
        {rawPacket ? (
          rawPacket
        ) : (
          <Mono color="text.muted" display="block" textAlign="center">
            —
          </Mono>
        )}
      </Box>
    </Card>
  );
}

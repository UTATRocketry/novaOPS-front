"use client";

import { Box, Flex, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <Flex justify="space-between" align="flex-start" mb={6}>
      <Box>
        <Text fontSize="xl" fontWeight="700" color="text.primary">
          {title}
        </Text>
        {subtitle && (
          <Text fontSize="sm" color="text.muted" mt={0.5}>
            {subtitle}
          </Text>
        )}
      </Box>
      {action && (
        <Flex align="center" gap={2}>
          {action}
        </Flex>
      )}
    </Flex>
  );
}

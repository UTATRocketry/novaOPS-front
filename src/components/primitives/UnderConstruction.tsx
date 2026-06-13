"use client";

import { Flex, Text } from "@chakra-ui/react";
import { Icon } from "./Icon";
import { Chip } from "./Chip";

/**
 * Full-area placeholder for pages that aren't built yet.
 * Drop it as the sole child of a page Box and it centers itself.
 */
export function UnderConstruction() {
  return (
    <Flex
      direction="column"
      align="center"
      justify="center"
      gap={4}
      minH="60vh"
      color="text.muted"
    >
      <Icon name="construction" size={48} fill={1} color="warn" />
      <Text fontWeight="600" fontSize="lg" color="text.default">
        Under Construction
      </Text>
      <Text fontSize="sm" textAlign="center" maxW="320px">
        This section isn&apos;t ready yet. Check back in a future build.
      </Text>
      <Chip status="warn">coming soon</Chip>
    </Flex>
  );
}

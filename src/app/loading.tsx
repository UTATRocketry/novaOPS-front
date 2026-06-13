"use client";

import { Flex, Spinner } from "@chakra-ui/react";

export default function LoadingPage() {
  return (
    <Flex height="100%" align="center" justify="center">
      <Spinner size="md" color="accent.solid" />
    </Flex>
  );
}

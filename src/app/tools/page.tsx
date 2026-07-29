"use client";

import { Box, Flex, Text, SimpleGrid, chakra } from "@chakra-ui/react";
import Link from "next/link";
import { PageHeader } from "@/components/shell";
import { Icon } from "@/components/primitives";
// Side-effect import: loading the manifest is what populates the registry.
// Every tool's card comes from its own `tool.ts` — see `@/lib/tools/registry`.
// Nothing tool-specific belongs in this file.
import "@/lib/tools/manifest";
import { getTools } from "@/lib/tools/registry";

const ChakraLink = chakra(Link);

export default function ToolsPage() {
  const tools = getTools();

  return (
    <Box>
      <PageHeader title="Tools" subtitle="Diagnostics & direct control utilities" />

      {tools.length === 0 ? (
        <Flex
          direction="column"
          align="center"
          justify="center"
          py={16}
          gap={2}
          color="text.muted"
          bg="bg.surface"
          border="1px solid"
          borderColor="border.default"
          borderRadius="card"
        >
          <Icon name="build" size={28} />
          <Text fontSize="sm">No tools registered.</Text>
          <Text fontSize="xs">
            Add an import to <chakra.span fontFamily="mono">lib/tools/manifest.ts</chakra.span>.
          </Text>
        </Flex>
      ) : (
        <SimpleGrid columns={{ base: 1, sm: 2, lg: 3 }} gap={4}>
          {tools.map((tool) => (
            <ChakraLink
              key={tool.slug}
              href={tool.href}
              display="block"
              textDecoration="none"
              bg="bg.surface"
              border="1px solid"
              borderColor="border.default"
              borderRadius="card"
              boxShadow="sm"
              p={5}
              _hover={{ borderColor: "accent.solid", boxShadow: "md" }}
              style={{ transition: "border-color 150ms, box-shadow 150ms" }}
            >
              <Flex align="flex-start" gap={4}>
                <Flex
                  align="center"
                  justify="center"
                  w="44px"
                  h="44px"
                  borderRadius="control"
                  bg="accent.subtle"
                  flexShrink={0}
                >
                  <Icon name={tool.icon} size={22} color="accent.solid" />
                </Flex>

                <Box>
                  <Flex align="center" gap={2} mb={1}>
                    <Text fontWeight="600" fontSize="sm" color="text.primary">
                      {tool.label}
                    </Text>
                    {tool.badge && (
                      <Box
                        px={1.5}
                        py={0.5}
                        bg="accent.subtle"
                        borderRadius="sm"
                        fontSize="10px"
                        fontWeight="600"
                        color="accent.solid"
                        letterSpacing="0.05em"
                      >
                        {tool.badge}
                      </Box>
                    )}
                  </Flex>
                  <Text fontSize="xs" color="text.muted" lineHeight="1.5">
                    {tool.description}
                  </Text>
                </Box>
              </Flex>
            </ChakraLink>
          ))}
        </SimpleGrid>
      )}
    </Box>
  );
}

"use client";

import { Box, Flex, Text, SimpleGrid, chakra } from "@chakra-ui/react";
import Link from "next/link";
import { PageHeader } from "@/components/shell";
import { Icon } from "@/components/primitives";

const ChakraLink = chakra(Link);

interface ToolCard {
  label: string;
  description: string;
  icon: string;
  href: string;
  badge?: string;
}

const TOOLS: ToolCard[] = [
  {
    label: "Servo Tester",
    description: "Direct PWM pulse control. Half-circle dial, presets, A/B sweep.",
    icon: "tune",
    href: "/tools/servo",
  },
  {
    label: "Buzzer / Melody",
    description: "Play predefined or custom note sequences on the FMC buzzer.",
    icon: "music_note",
    href: "/tools/buzzer",
  },
];

export default function ToolsPage() {
  return (
    <Box>
      <PageHeader
        title="Tools"
        subtitle="Diagnostics & direct control utilities"
      />

      <SimpleGrid columns={{ base: 1, sm: 2, lg: 3 }} gap={4}>
        {TOOLS.map((tool) => (
          <ChakraLink
            key={tool.href}
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
    </Box>
  );
}

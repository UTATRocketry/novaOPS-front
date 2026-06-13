"use client";

import { Button, Flex, Text } from "@chakra-ui/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, Mono } from "@/components/primitives";

export interface StatusPageProps {
  icon: string;
  iconColor?: string;
  code: string;
  title: string;
  description: string;
  children?: ReactNode;
}

export function StatusPage({
  icon,
  iconColor = "text.muted",
  code,
  title,
  description,
  children,
}: StatusPageProps) {
  return (
    <Flex
      height="100%"
      minHeight="0"
      align="center"
      justify="center"
      direction="column"
      gap={3}
      px={6}
      textAlign="center"
    >
      <Icon name={icon} size={40} color={iconColor} />
      <Mono fontSize="4xl" fontWeight="700" color="text.muted" lineHeight="1">
        {code}
      </Mono>
      <Text fontWeight="600" fontSize="lg" color="text.primary">
        {title}
      </Text>
      <Text fontSize="sm" color="text.muted" maxW="380px" lineHeight="1.6">
        {description}
      </Text>
      {children && (
        <Flex gap={2} mt={2}>
          {children}
        </Flex>
      )}
    </Flex>
  );
}

export function HomeButton() {
  return (
    <Button
      size="sm"
      bg="accent.solid"
      color="white"
      _hover={{ opacity: 0.85 }}
      _active={{ opacity: 0.7 }}
      asChild
    >
      <Link href="/">Go home</Link>
    </Button>
  );
}

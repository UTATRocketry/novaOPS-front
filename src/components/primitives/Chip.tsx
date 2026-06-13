"use client";

import { Box, Flex, type FlexProps } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { Status, STATUS_COLOR } from "./Mono";

export interface ChipProps extends Omit<FlexProps, "children"> {
  status?: Status;
  children: ReactNode;
}

/** Small monospaced pill with a tinted background; colour matches meaning. */
export function Chip({ status = "neutral", children, ...rest }: ChipProps) {
  const color = STATUS_COLOR[status];
  const isNeutral = status === "neutral";
  return (
    <Flex
      as="span"
      align="center"
      gap={1.5}
      display="inline-flex"
      fontFamily="mono"
      fontSize="xs"
      fontWeight="500"
      lineHeight="1"
      px={2}
      py={1}
      borderRadius="chip"
      color={isNeutral ? "text.muted" : color}
      bg={isNeutral ? "bg.surfaceRaised" : `color-mix(in srgb, ${cssVar(color)} 16%, transparent)`}
      border="1px solid"
      borderColor={
        isNeutral ? "border.default" : `color-mix(in srgb, ${cssVar(color)} 35%, transparent)`
      }
      whiteSpace="nowrap"
      {...rest}
    >
      {children}
    </Flex>
  );
}

export interface StatusDotProps {
  status: Status;
  size?: number;
  /** Soft halo glow in the status colour. */
  glow?: boolean;
}

/** Tiny glowing circle for binary health. */
export function StatusDot({ status, size = 8, glow = true }: StatusDotProps) {
  const color = STATUS_COLOR[status];
  return (
    <Box
      as="span"
      display="inline-block"
      flexShrink={0}
      width={`${size}px`}
      height={`${size}px`}
      borderRadius="full"
      bg={status === "neutral" ? "text.muted" : color}
      boxShadow={glow && status !== "neutral" ? `0 0 6px 1px ${cssVar(color)}` : undefined}
    />
  );
}

/**
 * Resolve a Chakra color token name to a CSS variable reference so it can be
 * used inside color-mix() / box-shadow strings. Chakra v3 emits tokens as
 * --chakra-colors-<name> with dots replaced by dashes.
 */
function cssVar(token: string): string {
  return `var(--chakra-colors-${token.replace(/\./g, "-")})`;
}

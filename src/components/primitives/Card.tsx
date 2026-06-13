"use client";

import { Box, Flex, Heading, type BoxProps } from "@chakra-ui/react";
import type { ReactNode } from "react";

export interface CardProps extends Omit<BoxProps, "title"> {
  title?: ReactNode;
  /** Optional content on the right of the header (status chip, action). */
  headerAction?: ReactNode;
  /** Use a slightly different surface tone for card-within-a-card. */
  nested?: boolean;
  /** Remove body padding (e.g. for tables, canvases). */
  flush?: boolean;
  children?: ReactNode;
}

/**
 * The universal container: a titled header bar over a padded body.
 * Subtle border + shadow lift it off the background.
 */
export function Card({
  title,
  headerAction,
  nested = false,
  flush = false,
  children,
  ...rest
}: CardProps) {
  return (
    <Box
      bg={nested ? "bg.surfaceRaised" : "bg.surface"}
      border="1px solid"
      borderColor="border.default"
      borderRadius="card"
      boxShadow={nested ? "none" : "sm"}
      overflow="hidden"
      {...rest}
    >
      {title != null && (
        <Flex
          align="center"
          justify="space-between"
          gap={3}
          px={4}
          py={3}
          borderBottom="1px solid"
          borderColor="border.default"
        >
          <Heading
            as="h3"
            fontSize="sm"
            fontWeight="600"
            letterSpacing="0.02em"
            color="text.primary"
          >
            {title}
          </Heading>
          {headerAction}
        </Flex>
      )}
      <Box p={flush ? 0 : 4}>{children}</Box>
    </Box>
  );
}

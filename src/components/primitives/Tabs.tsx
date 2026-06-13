"use client";

import { Box, Flex } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { Status, STATUS_COLOR } from "./Mono";

export interface TabItem {
  value: string;
  label: ReactNode;
}

export interface PillTabsProps {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
}

/** Rounded pill-container tabs; active tab filled blue. */
export function PillTabs({ items, value, onChange }: PillTabsProps) {
  return (
    <Flex
      display="inline-flex"
      bg="bg.surfaceRaised"
      border="1px solid"
      borderColor="border.default"
      borderRadius="chip"
      p={1}
      gap={1}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <Box
            key={item.value}
            as="button"
            onClick={() => onChange(item.value)}
            px={3}
            py={1.5}
            borderRadius="chip"
            fontSize="sm"
            fontWeight="500"
            cursor="pointer"
            transition="all 0.15s"
            bg={active ? "accent.solid" : "transparent"}
            color={active ? "white" : "text.muted"}
            boxShadow={active ? "0 0 12px -2px var(--chakra-colors-accent-solid)" : undefined}
            _hover={active ? {} : { color: "text.primary", bg: "bg.surface" }}
          >
            {item.label}
          </Box>
        );
      })}
    </Flex>
  );
}

export interface TerminalLine {
  text: string;
  status?: Status;
  timestamp?: string;
}

export interface TerminalProps {
  lines: TerminalLine[];
  height?: string | number;
  emptyMessage?: string;
}

/** Dark monospaced console window with colour-coded log lines. */
export function Terminal({ lines, height = "320px", emptyMessage = "No output." }: TerminalProps) {
  return (
    <Box
      bg="#0a0e16"
      border="1px solid"
      borderColor="border.default"
      borderRadius="control"
      fontFamily="mono"
      fontSize="xs"
      lineHeight="1.6"
      p={3}
      height={height}
      overflowY="auto"
      color="chrome.text"
    >
      {lines.length === 0 ? (
        <Box color="chrome.textMuted">{emptyMessage}</Box>
      ) : (
        lines.map((line, i) => (
          <Flex key={i} gap={2}>
            {line.timestamp && (
              <Box as="span" color="chrome.textMuted" flexShrink={0}>
                {line.timestamp}
              </Box>
            )}
            <Box
              as="span"
              color={line.status ? STATUS_COLOR[line.status] : "chrome.text"}
              whiteSpace="pre-wrap"
              wordBreak="break-word"
            >
              {line.text}
            </Box>
          </Flex>
        ))
      )}
    </Box>
  );
}

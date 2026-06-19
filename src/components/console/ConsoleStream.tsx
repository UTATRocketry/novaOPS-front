"use client";

import { Box, Flex } from "@chakra-ui/react";
import { useEffect, useRef } from "react";
import { STATUS_COLOR } from "@/components/primitives";
import type { ConsoleLogEntry } from "@/lib/console";

export interface ConsoleStreamProps {
  entries: ConsoleLogEntry[];
  height?: string | number;
  emptyMessage?: string;
  /** Auto-scroll to the newest line as entries arrive. Default true. */
  follow?: boolean;
}

/** Two-digit clock time for a console timestamp. */
function clock(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * Dark, monospaced, colour-coded console window that auto-scrolls to the latest
 * line. Mirrors the `Terminal` primitive's styling but owns its scroll container
 * so new output stays in view. Each line is coloured by its `status`.
 */
export function ConsoleStream({
  entries,
  height = "360px",
  emptyMessage = "No output.",
  follow = true,
}: ConsoleStreamProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!follow) return;
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries, follow]);

  return (
    <Box
      ref={ref}
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
      {entries.length === 0 ? (
        <Box color="chrome.textMuted">{emptyMessage}</Box>
      ) : (
        entries.map((line) => (
          <Flex key={line.id} gap={2}>
            <Box as="span" color="chrome.textMuted" flexShrink={0}>
              {clock(line.ts)}
            </Box>
            <Box
              as="span"
              color={line.status === "neutral" ? "chrome.text" : STATUS_COLOR[line.status]}
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

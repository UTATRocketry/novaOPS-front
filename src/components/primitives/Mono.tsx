"use client";

import { Text, type TextProps } from "@chakra-ui/react";

/** Monospaced text for every measurement, time, command, or identifier. */
export function Mono(props: TextProps) {
  return <Text as="span" fontFamily="mono" {...props} />;
}

/** Status semantics shared across dots, chips, badges, severity bars. */
export type Status = "nominal" | "warn" | "error" | "fault" | "info" | "neutral";

export const STATUS_COLOR: Record<Status, string> = {
  nominal: "nominal",
  warn: "warn",
  error: "error",
  fault: "fault",
  info: "info",
  neutral: "text.muted",
};

"use client";

import { Flex, Text } from "@chakra-ui/react";
import { Mono, StatusDot } from "@/components/primitives";

/** Format a numeric reading; missing/non-finite → "—" (never a fabricated 0). */
export function num(v: number | undefined | null, suffix = "", digits = 2): string {
  return v != null && Number.isFinite(v) ? `${v.toFixed(digits)}${suffix}` : "—";
}

/** Human-readable uptime from milliseconds. */
export function uptime(ms?: number): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const p = (n: number) => String(n).padStart(2, "0");
  const hms = `${p(Math.floor((s % 86400) / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
  return d > 0 ? `${d}d ${hms}` : hms;
}

/** Label + mono value row (right-aligned value). */
export function Readout({ label, value }: { label: string; value: string }) {
  return (
    <Flex align="baseline" justify="space-between" gap={2}>
      <Text fontSize="xs" color="text.muted">{label}</Text>
      <Mono fontSize="xs" color="text.primary">{value}</Mono>
    </Flex>
  );
}

/**
 * Boolean status flag. true → green dot; false → neutral dot (known-off);
 * undefined → "—" with no confident dot (unknown, never shown as false).
 *
 * Set `danger` for flags whose *asserted* state is the bad one (e.g. a firmware
 * protection cut-out): true then renders red and the label is highlighted, so an
 * operator scanning the row never reads a fault as nominal.
 */
export function FlagDot({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: boolean | undefined;
  danger?: boolean;
}) {
  const asserted = value === true;
  return (
    <Flex align="center" gap={1.5}>
      {value === undefined ? (
        <Mono fontSize="2xs" color="text.muted" w="8px" textAlign="center">—</Mono>
      ) : (
        <StatusDot
          status={asserted ? (danger ? "fault" : "nominal") : "neutral"}
          size={8}
          glow={asserted}
        />
      )}
      <Text fontSize="2xs" color={danger && asserted ? "fault" : "text.muted"}>
        {label}
      </Text>
    </Flex>
  );
}

"use client";

import { Box, Flex, Text, chakra } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { Icon, Mono } from "@/components/primitives";

const NativeInput = chakra("input");

/** Labelled numeric field. Empty input reports `null` rather than 0. */
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  hint,
  disabled = false,
  placeholder,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  hint?: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <Box opacity={disabled ? 0.45 : 1}>
      <Flex align="baseline" justify="space-between" gap={2} mb={1}>
        <Text fontSize="2xs" color="text.muted" letterSpacing="0.04em">
          {label}
        </Text>
        {suffix && (
          <Mono fontSize="2xs" color="text.muted">
            {suffix}
          </Mono>
        )}
      </Flex>
      <NativeInput
        type="number"
        value={value ?? ""}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          const raw = e.target.value;
          if (raw.trim() === "") return onChange(null);
          const n = Number(raw);
          onChange(Number.isFinite(n) ? n : null);
        }}
        width="100%"
        bg="bg.canvas"
        border="1px solid"
        borderColor="border.default"
        borderRadius="control"
        boxShadow="inset 0 1px 2px rgba(0,0,0,0.28)"
        color="text.primary"
        fontFamily="mono"
        fontSize="xs"
        px={2}
        py="6px"
        outline="none"
        _hover={disabled ? {} : { borderColor: "accent.solid" }}
        _focusVisible={{
          borderColor: "accent.solid",
          boxShadow: "0 0 0 1px var(--chakra-colors-accent-solid)",
        }}
      />
      {hint && (
        <Text fontSize="2xs" color="text.muted" mt={1} lineHeight="1.4">
          {hint}
        </Text>
      )}
    </Box>
  );
}

/** Checkbox-style toggle row. */
export function ToggleRow({
  label,
  checked,
  onChange,
  hint,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (next: boolean) => void;
  hint?: string;
}) {
  return (
    <Box>
      <Flex
        as="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        align="center"
        gap={2}
        width="100%"
        textAlign="left"
        cursor="pointer"
        color={checked ? "text.primary" : "text.muted"}
        _hover={{ color: checked ? "text.primary" : "text.primary" }}
      >
        <Flex
          align="center"
          justify="center"
          flexShrink={0}
          width="16px"
          height="16px"
          borderRadius="4px"
          border="1px solid"
          borderColor={checked ? "accent.solid" : "border.default"}
          bg={checked ? "accent.solid" : "transparent"}
          color="white"
        >
          {checked && <Icon name="check" size={12} color="currentColor" />}
        </Flex>
        <Text fontSize="xs" fontWeight={checked ? "600" : "400"} color="inherit">
          {label}
        </Text>
      </Flex>
      {hint && (
        <Text fontSize="2xs" color="text.muted" mt={1} ml="24px" lineHeight="1.4">
          {hint}
        </Text>
      )}
    </Box>
  );
}

/** Small outline button used across the analysis panels. */
export function MiniButton({
  children,
  onClick,
  active = false,
  disabled = false,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <Box
      as="button"
      title={title}
      onClick={disabled ? undefined : onClick}
      aria-disabled={disabled}
      px={2.5}
      py={1}
      fontSize="2xs"
      fontFamily="mono"
      fontWeight="600"
      borderRadius="control"
      border="1px solid"
      borderColor={active ? "accent.solid" : "border.default"}
      bg={active ? "accent.solid" : "transparent"}
      color={active ? "white" : disabled ? "text.muted" : "text.muted"}
      opacity={disabled ? 0.5 : 1}
      cursor={disabled ? "not-allowed" : "pointer"}
      whiteSpace="nowrap"
      transition="all 0.12s"
      _hover={disabled || active ? {} : { borderColor: "accent.solid", color: "accent.solid" }}
    >
      {children}
    </Box>
  );
}

/** Section heading inside a control card. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Text
      fontSize="2xs"
      color="text.muted"
      letterSpacing="0.08em"
      fontWeight="600"
      mb={2}
    >
      {children}
    </Text>
  );
}

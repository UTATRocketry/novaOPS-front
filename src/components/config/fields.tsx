"use client";

import { Box, Flex, Input, chakra } from "@chakra-ui/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/primitives";

const NativeSelect = chakra("select");

/** Shared visual treatment: recessed canvas fill so cells stand out in a table. */
const FIELD_PROPS = {
  bg: "bg.canvas",
  borderColor: "border.default",
  borderRadius: "control",
  fontSize: "xs",
  _focusVisible: { borderColor: "accent.solid", boxShadow: "0 0 0 1px var(--chakra-colors-accent-solid)" },
} as const;

export interface TextCellProps {
  value: string | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}

export function TextCell({ value, onChange, placeholder, mono = true }: TextCellProps) {
  return (
    <Input
      size="xs"
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      fontFamily={mono ? "mono" : undefined}
      minW="80px"
      {...FIELD_PROPS}
    />
  );
}

export interface NumberCellProps {
  value: number | null | undefined;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
}

export function NumberCell({ value, onChange, placeholder = "—" }: NumberCellProps) {
  return (
    <Input
      size="xs"
      type="number"
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(e) => {
        const t = e.target.value.trim();
        onChange(t === "" ? undefined : Number(t));
      }}
      fontFamily="mono"
      minW="64px"
      {...FIELD_PROPS}
    />
  );
}

export interface SelectCellProps {
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}

export function SelectCell({ value, options, onChange }: SelectCellProps) {
  return (
    <NativeSelect
      value={value}
      onChange={(e) => onChange(e.target.value)}
      bg="bg.canvas"
      borderWidth="1px"
      borderColor="border.default"
      borderRadius="control"
      fontSize="xs"
      fontFamily="mono"
      px={2}
      py={1}
      color="text.primary"
      cursor="pointer"
      _focusVisible={{ borderColor: "accent.solid", outline: "none" }}
    >
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </NativeSelect>
  );
}

// ---------------------------------------------------------------------------
// CsvListCell — comma-separated list input that buffers the raw text.
//
// A naive `value={arr.join(", ")}` + split-on-change cell can't be typed into:
// the moment you type a comma it parses to an array, re-joins, and the trailing
// comma vanishes. This keeps the raw text in local state and only re-syncs from
// the parent when the parent value changes to something WE didn't just emit.
// ---------------------------------------------------------------------------

function listsEqual(a: ReadonlyArray<string | number>, b: ReadonlyArray<string | number>): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => String(v) === String(b[i]));
}

export interface CsvListCellProps {
  value: ReadonlyArray<string | number> | undefined;
  numeric?: boolean;
  onChange: (parsed: string[] & number[]) => void;
  placeholder?: string;
}

export function CsvListCell({ value, numeric = false, onChange, placeholder }: CsvListCellProps) {
  const current = value ?? [];
  const [text, setText] = useState(() => current.join(", "));
  // Track what we last emitted so the parent's echo doesn't clobber the buffer.
  const lastEmitted = useRef<ReadonlyArray<string | number>>(current);

  useEffect(() => {
    const v = value ?? [];
    if (!listsEqual(v, lastEmitted.current)) {
      setText(v.join(", "));
      lastEmitted.current = v;
    }
  }, [value]);

  function handle(raw: string) {
    setText(raw);
    const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
    const parsed = numeric
      ? parts.map(Number).filter((n) => !Number.isNaN(n))
      : parts;
    lastEmitted.current = parsed;
    onChange(parsed as string[] & number[]);
  }

  return (
    <Input
      size="xs"
      value={text}
      placeholder={placeholder}
      onChange={(e) => handle(e.target.value)}
      fontFamily="mono"
      minW="120px"
      {...FIELD_PROPS}
    />
  );
}

// ---------------------------------------------------------------------------
// ChannelSelectCell — numeric channel dropdown (0..max), excluding channels
// already used by OTHER entries (the current value is always selectable).
// ---------------------------------------------------------------------------

export interface ChannelSelectCellProps {
  value: number | null | undefined;
  max: number;
  used?: ReadonlySet<number>;
  onChange: (v: number | undefined) => void;
}

export function ChannelSelectCell({ value, max, used, onChange }: ChannelSelectCellProps) {
  const options: number[] = [];
  for (let i = 0; i <= max; i++) {
    if (!used?.has(i) || i === value) options.push(i);
  }
  return (
    <NativeSelect
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
      bg="bg.canvas"
      borderWidth="1px"
      borderColor="border.default"
      borderRadius="control"
      fontSize="xs"
      fontFamily="mono"
      px={2}
      py={1}
      minW="64px"
      color="text.primary"
      cursor="pointer"
      _focusVisible={{ borderColor: "accent.solid", outline: "none" }}
    >
      <option value="">—</option>
      {options.map((n) => (
        <option key={n} value={n}>{n}</option>
      ))}
    </NativeSelect>
  );
}

/** Small icon button used for row delete / inline actions. */
export function IconButton({
  icon,
  label,
  onClick,
  tone = "muted",
}: {
  icon: string;
  label: string;
  onClick: () => void;
  tone?: "muted" | "fault" | "accent";
}) {
  const color = tone === "fault" ? "fault" : tone === "accent" ? "accent.solid" : "text.muted";
  return (
    <Box
      as="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      p={1}
      borderRadius="control"
      color={color}
      cursor="pointer"
      _hover={{ bg: "bg.surfaceRaised" }}
    >
      <Icon name={icon} size={16} />
    </Box>
  );
}

/** "Add row" button shown under a table. */
export function AddRowButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Flex
      as="button"
      align="center"
      gap={1}
      onClick={onClick}
      px={3}
      py={1.5}
      m={3}
      borderRadius="control"
      border="1px dashed"
      borderColor="border.default"
      color="text.muted"
      fontSize="xs"
      fontWeight="600"
      cursor="pointer"
      _hover={{ borderColor: "accent.solid", color: "accent.solid" }}
    >
      <Icon name="add" size={16} /> {label}
    </Flex>
  );
}

/** Boolean toggle cell rendered as a small pill button. */
export function ToggleCell({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Box
      as="button"
      onClick={() => onChange(!value)}
      px={2}
      py={1}
      borderRadius="chip"
      fontSize="2xs"
      fontFamily="mono"
      fontWeight="700"
      border="1px solid"
      bg={value ? "color-mix(in srgb, var(--chakra-colors-nominal) 16%, transparent)" : "bg.surfaceRaised"}
      borderColor={value ? "nominal" : "border.default"}
      color={value ? "nominal" : "text.muted"}
      cursor="pointer"
    >
      {value ? "ON" : "OFF"}
    </Box>
  );
}

/** Shared table-cell wrapper to keep padding consistent. */
export function Cell({ children }: { children: ReactNode }) {
  return <Box py={1}>{children}</Box>;
}

/** Uppercase, raised-background header row shared by all config tables. */
export const TABLE_CSS = {
  "& thead th": {
    backgroundColor: "var(--chakra-colors-bg\\.surfaceRaised)",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    fontSize: "0.6875rem",
    color: "var(--chakra-colors-text-muted)",
    whiteSpace: "nowrap",
  },
} as const;

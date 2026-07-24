"use client";

import { Flex } from "@chakra-ui/react";
import { Icon, Mono } from "@/components/primitives";
import { useNovaStore, sel } from "@/lib/store";
import type { PmbStatus } from "@/lib/flight/types";

// ---------------------------------------------------------------------------
// BatteryIndicator — top-bar pack voltage.
//
// The backend reports pack voltage (PMB vmon.vBatt) and sometimes a cell count,
// but no true state-of-charge. Per the "never fabricate a value" rule we show
// the *voltage* (mono) and use a coarse battery glyph as a rough visual only —
// never an invented percentage. Colour tracks the same per-cell thresholds the
// battery alert source uses; without a known cell count we stay neutral.
// ---------------------------------------------------------------------------

const PER_CELL_WARN = 3.5;
const PER_CELL_CRITICAL = 3.3;
const PER_CELL_FULLISH = 4.0;
const PER_CELL_GOOD = 3.7;

/** First PMB carrying a battery voltage reading, if any. */
function pickBatteryPmb(pmb: Record<string, PmbStatus> | undefined): PmbStatus | null {
  if (!pmb) return null;
  for (const p of Object.values(pmb)) {
    if (p.vmon?.vBatt != null) return p;
  }
  return null;
}

/** Coarse fill glyph from per-cell voltage (visual only, not a %). */
function batteryGlyph(perCell: number | null): string {
  if (perCell == null) return "battery_horiz_075";
  if (perCell <= PER_CELL_CRITICAL) return "battery_alert";
  if (perCell <= PER_CELL_WARN) return "battery_2_bar";
  if (perCell < PER_CELL_GOOD) return "battery_4_bar";
  if (perCell < PER_CELL_FULLISH) return "battery_6_bar";
  return "battery_full";
}

function toneColor(perCell: number | null): string {
  if (perCell == null) return "chrome.textMuted";
  if (perCell <= PER_CELL_CRITICAL) return "fault";
  if (perCell <= PER_CELL_WARN) return "warn";
  return "nominal";
}

export function BatteryIndicator() {
  const flightData = useNovaStore(sel.flightData);
  const pmb = pickBatteryPmb(flightData?.pmb);

  const v = pmb?.vmon?.vBatt ?? null;
  const cells = pmb?.charger?.cells ?? pmb?.chgCfg?.cells ?? null;
  const charging = pmb?.charger?.charging === true;
  const perCell = v != null && cells ? v / cells : null;

  // No reading → explicit em dash, muted battery glyph (never a fabricated 0).
  if (v == null) {
    return (
      <Flex align="center" gap={1.5} title="Battery voltage unavailable">
        <Icon name="battery_unknown" size={15} color="chrome.textMuted" />
        <Mono fontSize="xs" color="chrome.textMuted">
          —
        </Mono>
      </Flex>
    );
  }

  const glyph = charging ? "battery_charging_full" : batteryGlyph(perCell);
  const color = charging ? "accent.solid" : toneColor(perCell);

  return (
    <Flex
      align="center"
      gap={1.5}
      title={
        `Battery ${v.toFixed(2)} V` +
        (cells ? ` · ${(v / cells).toFixed(2)} V/cell × ${cells}` : "") +
        (charging ? " · charging" : "")
      }
    >
      <Icon name={glyph} size={15} color={color} fill={1} />
      <Mono fontSize="xs" color="chrome.text">
        {v.toFixed(2)}
        <Mono as="span" color="chrome.textMuted">
          {" "}
          V
        </Mono>
      </Mono>
    </Flex>
  );
}

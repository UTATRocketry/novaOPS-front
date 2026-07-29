"use client";

import { Box, Flex, Grid } from "@chakra-ui/react";
import { Card } from "@/components/primitives";
import { MiniButton, NumberField, SectionLabel, ToggleRow } from "./controls";
import { normalizeSavgolWindow } from "@/lib/analysis";
import type { Dataset, ProcessingOptions } from "@/lib/analysis";

export interface ProcessingCardProps {
  options: ProcessingOptions;
  onChange: (next: Partial<ProcessingOptions>) => void;
  onReset: () => void;
  dataset: Dataset | null;
}

/**
 * The processing knobs, mirroring the offline script's flags.
 *
 * Defaults reproduce a no-flag run of `plot_calibrate_data5.py`, so a chart
 * here should match a chart from the script for the same capture.
 */
export function ProcessingCard({
  options,
  onChange,
  onReset,
  dataset,
}: ProcessingCardProps) {
  const effectiveWindow = normalizeSavgolWindow(
    options.savgolWindow,
    options.savgolPolyorder,
  );
  const windowCoerced = effectiveWindow !== Math.round(options.savgolWindow);

  const massChannels = (dataset?.channels ?? []).filter(
    (c) => c.unit.trim().toLowerCase() === "kg",
  );

  return (
    <Card
      title="Processing"
      headerAction={<MiniButton onClick={onReset}>Reset defaults</MiniButton>}
    >
      <Flex direction="column" gap={4}>
        {/* --- Sampling ------------------------------------------------- */}
        <Box>
          <SectionLabel>SAMPLING</SectionLabel>
          <Grid templateColumns="1fr 1fr" gap={3}>
            <NumberField
              label="Decimate"
              value={options.decimate}
              min={1}
              step={1}
              suffix="every Nth"
              onChange={(v) => onChange({ decimate: Math.max(1, Math.round(v ?? 1)) })}
              hint={
                options.decimate > 1 && dataset
                  ? `${dataset.rowCount.toLocaleString()} rows kept`
                  : undefined
              }
            />
          </Grid>
        </Box>

        {/* --- Mass smoothing ------------------------------------------- */}
        <Box borderTop="1px solid" borderColor="border.default" pt={3}>
          <SectionLabel>MASS SMOOTHING · kg</SectionLabel>
          <ToggleRow
            label="Savitzky-Golay on mass channels"
            checked={options.smoothMass}
            onChange={(v) => onChange({ smoothMass: v })}
            hint={
              massChannels.length
                ? `Applies to ${massChannels.map((c) => c.name).join(", ")}`
                : "No kg channels in this capture"
            }
          />
          <Grid templateColumns="1fr 1fr" gap={3} mt={3}>
            <NumberField
              label="Window"
              value={options.savgolWindow}
              min={3}
              step={2}
              suffix="samples"
              disabled={!options.smoothMass}
              onChange={(v) => onChange({ savgolWindow: Math.max(3, Math.round(v ?? 51)) })}
              hint={windowCoerced ? `Coerced to ${effectiveWindow} (odd, > order)` : undefined}
            />
            <NumberField
              label="Poly order"
              value={options.savgolPolyorder}
              min={1}
              max={9}
              step={1}
              disabled={!options.smoothMass}
              onChange={(v) =>
                onChange({ savgolPolyorder: Math.max(1, Math.round(v ?? 3)) })
              }
            />
          </Grid>
        </Box>
      </Flex>
    </Card>
  );
}

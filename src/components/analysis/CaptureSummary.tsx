"use client";

import { Box, Flex, Grid, Text } from "@chakra-ui/react";
import { Card, Chip, Icon, KpiTile, Mono } from "@/components/primitives";
import { SOURCE_LABEL } from "@/lib/analysis";
import type { Dataset } from "@/lib/analysis";

export interface CaptureSummaryProps {
  dataset: Dataset;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return seconds.toFixed(2);
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}m ${s.toFixed(1)}`;
}

/** Top-line facts about the loaded capture, before any channel is selected. */
export function CaptureSummary({ dataset }: CaptureSummaryProps) {
  const n = dataset.elapsed.length;
  const duration = n > 1 ? dataset.elapsed[n - 1] - dataset.elapsed[0] : null;
  const started = dataset.epochMs
    ? new Date(dataset.epochMs[0]).toISOString().replace("T", " ").slice(0, 23)
    : null;

  const calibrated = dataset.channels.filter((c) => c.origin === "calibrated").length;
  const rawPassthrough = dataset.channels.filter((c) => c.origin === "raw").length;

  return (
    <Card>
      <Grid
        templateColumns="repeat(auto-fit, minmax(120px, 1fr))"
        gap={4}
        alignItems="start"
      >
        <KpiTile label="Samples" value={dataset.rowCount.toLocaleString()} />
        <KpiTile
          label="Duration"
          value={duration != null ? formatDuration(duration) : undefined}
          unit={duration != null && duration < 60 ? "s" : undefined}
        />
        <KpiTile
          label="Sample rate"
          value={dataset.sampleRateHz != null ? dataset.sampleRateHz.toFixed(1) : undefined}
          unit="Hz"
        />
        <KpiTile label="Channels" value={dataset.channels.length} />
      </Grid>

      <Flex gap={2} flexWrap="wrap" mt={4}>
        {/* The timeline everything else was resampled onto. */}
        <Chip status="info">
          <Icon name="schedule" size={12} /> {SOURCE_LABEL[dataset.primarySource]} timeline
        </Chip>
        {calibrated > 0 && (
          <Chip status="nominal">
            <Icon name="check_circle" size={12} /> {calibrated} calibrated
          </Chip>
        )}
        {rawPassthrough > 0 && (
          <Chip status="warn">
            <Icon name="warning" size={12} /> {rawPassthrough} uncalibrated (raw counts)
          </Chip>
        )}
        {dataset.events.length > 0 && (
          <Chip status="nominal">
            <Icon name="bolt" size={12} /> {dataset.events.length} actuation events
          </Chip>
        )}
        {dataset.skipped.length > 0 && (
          <Chip status="neutral">
            <Icon name="help" size={12} /> {dataset.skipped.length} sensors unresolved
          </Chip>
        )}
        {dataset.unalignedSources.map((s) => (
          <Box
            key={s}
            title="Merging resamples onto the primary timeline, which needs a timestamp column in both logs."
          >
            <Chip status="fault">
              <Icon name="link_off" size={12} /> {s} not merged — no timestamp
            </Chip>
          </Box>
        ))}
      </Flex>

      {/* How each secondary log was lined up. `elapsed` alignment means the two
          clocks are unrelated and only the *relative* timing is meaningful, so
          it is stated rather than left to be assumed. */}
      {dataset.alignments.length > 0 && (
        <Flex direction="column" gap={1} mt={3}>
          {dataset.alignments.map((a) => (
            <Flex key={a.source} align="center" gap={2} fontSize="2xs" color="text.muted">
              <Icon name="merge" size={12} color="currentColor" />
              <Mono fontSize="2xs">{a.source}</Mono>
              <Text fontSize="2xs">
                {a.columns.length} channel{a.columns.length === 1 ? "" : "s"} merged by{" "}
                {a.mode === "epoch" ? "wall clock" : "elapsed time"}
              </Text>
              {a.worstSkewS != null && (
                <Mono fontSize="2xs" color={a.worstSkewS > 0.5 ? "warn" : "text.muted"}>
                  worst skew {a.worstSkewS.toFixed(3)}s
                </Mono>
              )}
            </Flex>
          ))}
        </Flex>
      )}

      {started && (
        <Text fontSize="2xs" color="text.muted" mt={3} fontFamily="mono">
          First sample {started} UTC
        </Text>
      )}
      {!dataset.epochMs && (
        <Text fontSize="2xs" color="warn" mt={3}>
          No usable timestamp column — the x-axis is a sample index, and
          rate-dependent filters need an explicit sample rate.
        </Text>
      )}
    </Card>
  );
}

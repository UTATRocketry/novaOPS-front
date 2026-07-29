"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Button, Flex, Text } from "@chakra-ui/react";
import Link from "next/link";
import { PageHeader } from "@/components/shell";
import { Card, Chip, Icon, Mono } from "@/components/primitives";
import {
  CaptureSummary,
  ChannelPicker,
  ChartGrid,
  EventsCard,
  MiniButton,
  ProcessingCard,
  SourceCard,
  StatsTable,
  ToggleRow,
  WindowBar,
  buildColorMap,
} from "@/components/analysis";
import { useConfig } from "@/hooks";
import { useAnalysisSession } from "@/hooks/useAnalysisSession";
import { buildCalibratedCsv, downloadCsv } from "@/lib/analysis";

// ---------------------------------------------------------------------------
// Analysis page
//
// Post-test review of a recorded capture, following the team's offline
// `plot_calibrate_data5.py` pipeline in the browser: bind a CSV's columns to
// the configured sensors, apply each sensor's piecewise-linear calibration,
// smooth mass channels, then plot, measure, and re-export.
//
// This page is read-only with respect to the vehicle. It reads the loaded
// config for calibration tables and reads data files; it issues no commands and
// never writes config back.
// ---------------------------------------------------------------------------

const CHART_HEIGHTS = { compact: 220, normal: 300, tall: 420 } as const;
type ChartSize = keyof typeof CHART_HEIGHTS;

export default function AnalysisPage() {
  const { data: config } = useConfig();
  const sensors = useMemo(() => config?.Sensors ?? [], [config]);
  const actuators = useMemo(() => config?.Actuators ?? [], [config]);

  const session = useAnalysisSession(sensors, actuators);
  const { dataset } = session;

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [cursorIndex, setCursorIndex] = useState<number | null>(null);
  const [autoSplit, setAutoSplit] = useState(true);
  const [keepRaw, setKeepRaw] = useState(false);
  const [chartSize, setChartSize] = useState<ChartSize>("normal");
  const [showEvents, setShowEvents] = useState(true);
  const [showEventLabels, setShowEventLabels] = useState(true);

  const colors = useMemo(
    () => buildColorMap(dataset?.channels ?? []),
    [dataset?.channels],
  );

  // Default the selection to everything the first time a capture resolves, and
  // drop ids that no longer exist after a config or option change.
  const channelIdKey = dataset?.channels.map((c) => c.id).join("|") ?? "";
  useEffect(() => {
    if (!dataset) {
      setSelectedIds(new Set());
      return;
    }
    const available = new Set(dataset.channels.map((c) => c.id));
    setSelectedIds((prev) => {
      if (prev.size === 0) return available;
      return new Set([...prev].filter((id) => available.has(id)));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelIdKey]);

  const selectedChannels = useMemo(
    () => (dataset?.channels ?? []).filter((c) => selectedIds.has(c.id)),
    [dataset, selectedIds],
  );

  const toggleChannel = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const setAll = useCallback((ids: string[]) => setSelectedIds(new Set(ids)), []);

  const handleExport = useCallback(() => {
    if (!dataset || selectedChannels.length === 0) return;
    const csv = buildCalibratedCsv(dataset, selectedChannels, {
      keepRaw,
      window: session.window,
      rawColumns: session.rawColumns,
    });
    const base = (session.sensorFiles[0]?.name ?? "capture").replace(/\.csv$/i, "");
    downloadCsv(csv, `${base}_calibrated.csv`);
  }, [
    dataset,
    selectedChannels,
    keepRaw,
    session.window,
    session.rawColumns,
    session.sensorFiles,
  ]);

  const hasData = dataset != null && dataset.rowCount > 0;
  const canExport = hasData && selectedChannels.length > 0;

  return (
    <Box>
      <PageHeader
        title="Analysis"
        subtitle={
          session.files.length > 0
            ? `${session.files.length} log${session.files.length === 1 ? "" : "s"} · calibrated offline review`
            : "Post-test review of a recorded capture"
        }
        action={
          <Flex align="center" gap={2}>
            {hasData && (
              <Flex align="center" gap={1}>
                {(Object.keys(CHART_HEIGHTS) as ChartSize[]).map((size) => (
                  <MiniButton
                    key={size}
                    active={chartSize === size}
                    onClick={() => setChartSize(size)}
                  >
                    {size}
                  </MiniButton>
                ))}
              </Flex>
            )}
            <Box
              as="button"
              onClick={canExport ? handleExport : undefined}
              aria-disabled={!canExport}
              px={3}
              py={1.5}
              fontSize="xs"
              fontFamily="mono"
              fontWeight="600"
              borderRadius="control"
              border="1px solid"
              borderColor={canExport ? "accent.solid" : "border.default"}
              color={canExport ? "accent.solid" : "text.muted"}
              cursor={canExport ? "pointer" : "not-allowed"}
              _hover={canExport ? { bg: "accent.solid", color: "white" } : {}}
            >
              <Flex align="center" gap={1}>
                <Icon name="download" size={14} /> Export calibrated CSV
              </Flex>
            </Box>
            <Button size="sm" variant="outline" asChild>
              <Link href="/tools">← Back to Tools</Link>
            </Button>
          </Flex>
        }
      />

      {sensors.length === 0 && (
        <Box mb={4}>
          <Chip status="warn">
            <Icon name="warning" size={13} />
            No sensors in the loaded config — channels cannot be calibrated or named.
          </Chip>
        </Box>
      )}

      <Flex gap={4} align="flex-start" flexWrap={{ base: "wrap", xl: "nowrap" }}>
        {/* ---- Left rail: source, processing, channels ------------------ */}
        <Flex
          direction="column"
          gap={4}
          width={{ base: "100%", xl: "340px" }}
          flexShrink={0}
        >
          <SourceCard
            files={session.files}
            loading={session.loading}
            error={session.error}
            onLoadBackendFile={session.loadBackendFile}
            onLoadLocalFile={session.loadLocalFile}
            onSetFileSource={session.setFileSource}
            onRemoveFile={session.removeFile}
            onClear={session.clear}
          />

          {hasData && (
            <ProcessingCard
              options={session.options}
              onChange={session.setOptions}
              onReset={session.resetOptions}
              dataset={dataset}
            />
          )}

          {hasData && (
            <ChannelPicker
              dataset={dataset}
              selected={selectedIds}
              onToggle={toggleChannel}
              onSetAll={setAll}
              colors={colors}
            />
          )}

          {hasData && (
            <Card title="Display & export">
              <Flex direction="column" gap={3}>
                <ToggleRow
                  label="Auto-split mismatched ranges"
                  checked={autoSplit}
                  onChange={setAutoSplit}
                  hint="Give a channel its own chart when its span dwarfs the rest of its unit group."
                />
                <ToggleRow
                  label="Actuation markers on charts"
                  checked={showEvents}
                  onChange={setShowEvents}
                  hint="Vertical lines where a valve, relay, or servo was commanded."
                />
                <ToggleRow
                  label="Label actuation markers"
                  checked={showEventLabels}
                  onChange={setShowEventLabels}
                  hint="Turn off when a dense command sequence crowds the plot."
                />
                <ToggleRow
                  label="Keep raw columns in export"
                  checked={keepRaw}
                  onChange={setKeepRaw}
                  hint="Carry the un-calibrated source columns through alongside the calibrated ones."
                />
                <Text fontSize="2xs" color="text.muted" lineHeight="1.5">
                  Export writes the current window and the selected channels, named
                  <Mono fontSize="2xs"> cal_&lt;name&gt;[unit]</Mono> to match the offline
                  script&apos;s output.
                </Text>
              </Flex>
            </Card>
          )}
        </Flex>

        {/* ---- Main column: summary, charts, stats ---------------------- */}
        <Box flex={1} minW={0} width={{ base: "100%", xl: "auto" }}>
          {!hasData ? (
            <Card>
              <Flex
                direction="column"
                align="center"
                justify="center"
                py={20}
                gap={3}
                color="text.muted"
              >
                <Icon name="analytics" size={36} />
                <Text fontSize="sm" fontWeight="600" color="text.primary">
                  No capture loaded
                </Text>
                <Text fontSize="xs" maxW="460px" textAlign="center" lineHeight="1.6">
                  Pick a CSV from the backend data directory, or drop one in from this
                  machine. Columns are bound to the sensors in the loaded config and
                  calibrated with each sensor&apos;s table.
                </Text>
                <Text fontSize="xs" maxW="460px" textAlign="center" lineHeight="1.6">
                  novaGround and novaThermo sensor logs can be loaded together — each is
                  tagged by subsystem, since both spell their columns{" "}
                  <Mono fontSize="xs">hatX_chY</Mono>. Add a matching{" "}
                  <Mono fontSize="xs">*_actuators.csv</Mono> to overlay valve and igniter
                  commands.
                </Text>
              </Flex>
            </Card>
          ) : (
            <Flex direction="column" gap={4}>
              <CaptureSummary dataset={dataset} />

              {session.fullRange && (
                <WindowBar
                  window={session.window}
                  fullRange={session.fullRange}
                  onChange={session.setWindow}
                  xIsIndex={dataset.epochMs === null}
                />
              )}

              <ChartGrid
                dataset={dataset}
                channels={selectedChannels}
                window={session.window}
                onWindowChange={session.setWindow}
                cursorIndex={cursorIndex}
                onCursorIndex={setCursorIndex}
                colors={colors}
                autoSplit={autoSplit}
                chartHeight={CHART_HEIGHTS[chartSize]}
                showEvents={showEvents}
                showEventLabels={showEventLabels}
              />

              {(dataset.events.length > 0 || session.eventsUnplaceable) && (
                <EventsCard
                  events={dataset.events}
                  window={session.window}
                  onSeek={session.setWindow}
                  showMarkers={showEvents}
                  onToggleMarkers={setShowEvents}
                  unplaceable={session.eventsUnplaceable}
                />
              )}

              <StatsTable
                dataset={dataset}
                channels={selectedChannels}
                window={session.window}
                cursorIndex={cursorIndex}
                colors={colors}
              />
            </Flex>
          )}
        </Box>
      </Flex>
    </Box>
  );
}

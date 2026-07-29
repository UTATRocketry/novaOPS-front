"use client";

import { useEffect, useRef } from "react";
import { Box } from "@chakra-ui/react";
import { useColorMode } from "@/lib/theme/color-mode";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import type { ActuationEvent, TimeWindow } from "@/lib/analysis";
import { toPlotSeries } from "./plotData";

// ---------------------------------------------------------------------------
// Static post-test chart.
//
// The live `Plot` primitive owns a rolling buffer and scrolls itself; this one
// renders a fixed capture instead. Drag selects a time window (lifted into
// React so every chart, the stats table, and the export all agree on it);
// double-click clears it. Cursors are synchronised across charts sharing a
// `syncKey`, so hovering one trace lines up every other channel at the same
// instant — the thing you actually do when reading a hot-fire.
//
// uPlot paints to canvas and cannot read CSS variables, so theme colours are
// resolved through hidden probe elements, as in Plot.tsx.
// ---------------------------------------------------------------------------

export interface AnalysisSeriesDef {
  label: string;
  values: Float64Array;
  /** Chakra colour token, e.g. "plot.1". */
  colorToken: string;
}

export interface AnalysisChartProps {
  /** Shared x axis: elapsed seconds (or sample index when `xIsIndex`). */
  xs: Float64Array;
  series: AnalysisSeriesDef[];
  unit?: string;
  height?: number;
  /** Charts sharing this key share a cursor. */
  syncKey: string;
  /** Current zoom window, or null for the full capture. */
  window: TimeWindow | null;
  onWindowChange: (window: TimeWindow | null) => void;
  /** True when the source CSV had no timestamps and x is a sample index. */
  xIsIndex?: boolean;
  /** Reports the hovered sample index (null when the cursor leaves). */
  onCursorIndex?: (index: number | null) => void;
  /** Actuation events drawn as vertical markers. */
  events?: ActuationEvent[];
  /** Draw event labels as well as the marker lines. */
  showEventLabels?: boolean;
}

/**
 * Marker colour by what the event did.
 *
 * Energising / opening reads green and de-energising / closing reads muted,
 * matching the status vocabulary the rest of the app uses, so a glance at the
 * chart says which way a valve went.
 */
function eventTone(event: ActuationEvent): "open" | "close" | "other" {
  if (event.kind === "recording") return "other";
  const s = event.state.toLowerCase();
  if (s.includes("open") || /(^|\s|·\s)on\b/.test(s) || s === "high") return "open";
  if (s.includes("closed") || /(^|\s|·\s)off\b/.test(s) || s === "low") return "close";
  return "other";
}

/** Short label for a marker: the actuator name where known, else the channel. */
function eventLabel(event: ActuationEvent): string {
  if (event.kind === "recording") return event.state;
  const who = event.actuator ?? event.channel;
  return `${who} ${event.state}`;
}

function readColor(el: HTMLElement | null, fallback: string): string {
  if (!el) return fallback;
  const c = getComputedStyle(el).color;
  return c && c !== "" ? c : fallback;
}


export function AnalysisChart({
  xs,
  series,
  unit,
  height = 300,
  syncKey,
  window: win,
  onWindowChange,
  xIsIndex = false,
  onCursorIndex,
  events,
  showEventLabels = true,
}: AnalysisChartProps) {
  const { colorMode } = useColorMode();

  const hostRef = useRef<HTMLDivElement>(null);
  const probeRefs = useRef<(HTMLDivElement | null)[]>([]);
  const axisProbeRef = useRef<HTMLDivElement>(null);
  const gridProbeRef = useRef<HTMLDivElement>(null);
  const openProbeRef = useRef<HTMLDivElement>(null);
  const closeProbeRef = useRef<HTMLDivElement>(null);
  const otherProbeRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);

  // Keep callbacks out of the rebuild dependency list.
  const onWindowChangeRef = useRef(onWindowChange);
  onWindowChangeRef.current = onWindowChange;
  const onCursorIndexRef = useRef(onCursorIndex);
  onCursorIndexRef.current = onCursorIndex;
  // Events are read at draw time, so changing them only needs a redraw.
  const eventsRef = useRef(events);
  eventsRef.current = events;
  const showEventLabelsRef = useRef(showEventLabels);
  showEventLabelsRef.current = showEventLabels;

  // Identity of the plotted set — rebuild only when it genuinely changes.
  const seriesKey = series.map((s) => `${s.label}:${s.colorToken}`).join("|");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const colors = series.map((_, i) => readColor(probeRefs.current[i], "#7f8ea3"));
    const axisColor = readColor(axisProbeRef.current, "#94a0b3");
    const gridColor = readColor(gridProbeRef.current, "#26303f");
    const eventColors = {
      open: readColor(openProbeRef.current, "#22c55e"),
      close: readColor(closeProbeRef.current, "#94a0b3"),
      other: readColor(otherProbeRef.current, "#3b82f6"),
    };
    const rect = host.getBoundingClientRect();

    const opts: uPlot.Options = {
      width: Math.max(rect.width, 120),
      height,
      legend: { show: false },
      cursor: {
        // We drive zoom ourselves so the window can be shared with the stats
        // table and the export, rather than living inside one chart.
        drag: { x: true, y: false, setScale: false },
        sync: { key: syncKey },
      },
      scales: { x: { time: false }, y: {} },
      axes: [
        {
          stroke: axisColor,
          grid: { stroke: gridColor, width: 1 },
          ticks: { stroke: gridColor, width: 1, size: 4 },
          values: (_u, splits) =>
            splits.map((v) => (xIsIndex ? String(Math.round(v)) : `${v.toFixed(2)}s`)),
        },
        {
          scale: "y",
          label: unit,
          stroke: axisColor,
          grid: { stroke: gridColor, width: 1 },
          ticks: { stroke: gridColor, width: 1, size: 4 },
        },
      ],
      series: [
        {},
        ...series.map((s, i) => ({
          label: s.label,
          stroke: colors[i],
          width: 1.5,
          points: { show: false },
          // Gaps stay gaps — uPlot skips non-finite samples rather than
          // bridging them with an invented straight line.
          spanGaps: false,
        })),
      ],
      hooks: {
        setSelect: [
          (u) => {
            if (u.select.width <= 2) return;
            const min = u.posToVal(u.select.left, "x");
            const max = u.posToVal(u.select.left + u.select.width, "x");
            u.setSelect({ left: 0, top: 0, width: 0, height: 0 }, false);
            if (Number.isFinite(min) && Number.isFinite(max) && max > min) {
              onWindowChangeRef.current({ start: min, end: max });
            }
          },
        ],
        setCursor: [
          (u) => {
            onCursorIndexRef.current?.(u.cursor.idx ?? null);
          },
        ],
        // Painted after the series so markers sit on top of the traces.
        draw: [
          (u) => {
            const evts = eventsRef.current;
            if (!evts || evts.length === 0) return;

            const ctx = u.ctx;
            const { left, top, width, height: plotH } = u.bbox;
            const xMin = u.scales.x.min ?? -Infinity;
            const xMax = u.scales.x.max ?? Infinity;

            ctx.save();
            ctx.beginPath();
            ctx.rect(left, top, width, plotH);
            ctx.clip();
            ctx.font = `10px ${getComputedStyle(u.root).fontFamily || "monospace"}`;
            ctx.textBaseline = "top";

            // Labels are stacked in rows and skipped when a row is already
            // occupied at that x, so a burst of commands stays readable instead
            // of overprinting itself into a smear.
            const ROWS = 3;
            const rowEnds = new Array<number>(ROWS).fill(-Infinity);

            for (const e of evts) {
              if (e.outsideCapture) continue;
              if (e.elapsed < xMin || e.elapsed > xMax) continue;
              const x = Math.round(u.valToPos(e.elapsed, "x", true)) + 0.5;
              const color = eventColors[eventTone(e)];

              ctx.strokeStyle = color;
              ctx.lineWidth = 1;
              ctx.setLineDash(e.kind === "recording" ? [2, 3] : [4, 3]);
              ctx.beginPath();
              ctx.moveTo(x, top);
              ctx.lineTo(x, top + plotH);
              ctx.stroke();

              if (!showEventLabelsRef.current) continue;
              const text = eventLabel(e);
              const w = ctx.measureText(text).width;
              const row = rowEnds.findIndex((end) => x > end + 6);
              if (row < 0) continue;
              rowEnds[row] = x + w;

              ctx.setLineDash([]);
              ctx.fillStyle = color;
              ctx.fillText(text, x + 3, top + 3 + row * 12);
            }

            ctx.restore();
          },
        ],
      },
    };

    const data = [
      xs,
      ...series.map((s) => toPlotSeries(s.values)),
    ] as unknown as uPlot.AlignedData;
    const u = new uPlot(opts, data, host);
    plotRef.current = u;

    const reset = () => onWindowChangeRef.current(null);
    host.addEventListener("dblclick", reset);

    const ro = new ResizeObserver(() => {
      if (hostRef.current) {
        u.setSize({ width: Math.max(hostRef.current.clientWidth, 120), height });
      }
    });
    ro.observe(host);

    return () => {
      host.removeEventListener("dblclick", reset);
      ro.disconnect();
      u.destroy();
      plotRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorMode, seriesKey, unit, height, syncKey, xs, xIsIndex]);

  // Data refresh without a full rebuild. `series` is rebuilt by the parent on
  // every render, so compare the sample buffers by identity and bail when they
  // are the same arrays — otherwise every unrelated re-render repaints.
  const lastValuesRef = useRef<Float64Array[]>([]);
  useEffect(() => {
    const u = plotRef.current;
    if (!u) return;
    const next = series.map((s) => s.values);
    const prev = lastValuesRef.current;
    const unchanged =
      next.length === prev.length && next.every((v, i) => v === prev[i]);
    lastValuesRef.current = next;
    if (unchanged) return;
    u.setData(
      [xs, ...next.map(toPlotSeries)] as unknown as uPlot.AlignedData,
      false,
    );
  });

  // Apply the shared window.
  useEffect(() => {
    const u = plotRef.current;
    if (!u || xs.length === 0) return;
    const min = win ? win.start : xs[0];
    const max = win ? win.end : xs[xs.length - 1];
    if (Number.isFinite(min) && Number.isFinite(max) && max > min) {
      u.setScale("x", { min, max });
    }
  }, [win, xs]);

  // Markers live in the draw hook, so a changed event list is just a repaint.
  useEffect(() => {
    plotRef.current?.redraw();
  }, [events, showEventLabels]);

  return (
    <Box position="relative" width="100%">
      <Box ref={hostRef} width="100%" height={`${height}px`} />
      {/* Hidden probes — let Chakra resolve theme tokens to concrete colours
          that uPlot can paint with. */}
      <Box position="absolute" w="0" h="0" overflow="hidden" aria-hidden>
        {series.map((s, i) => (
          <Box
            key={i}
            ref={(el: HTMLDivElement | null) => {
              probeRefs.current[i] = el;
            }}
            color={s.colorToken}
          />
        ))}
        <Box ref={openProbeRef} color="nominal" />
        <Box ref={closeProbeRef} color="text.muted" />
        <Box ref={otherProbeRef} color="info" />
        <Box ref={axisProbeRef} color="text.muted" />
        <Box ref={gridProbeRef} color="border.default" />
      </Box>
    </Box>
  );
}

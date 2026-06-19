"use client";

import { useEffect, useRef } from "react";
import { Box } from "@chakra-ui/react";
import { useColorMode } from "@/lib/theme/color-mode";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

// ---------------------------------------------------------------------------
// Generic live time-series plot (uPlot).
//
// One reusable rolling-window chart for both the Engine plots and the Flight
// dashboard. Theme colours are resolved from the live Chakra tokens (uPlot draws
// to canvas and cannot read CSS variables) so axis labels, ticks, grid, and
// series strokes follow the active color mode. The X axis reads as seconds-ago
// ("60s" … "now"); the cursor is disabled; Y can be pinned to a fixed range
// (e.g. a sensor's configured range) instead of autoscaling.
// ---------------------------------------------------------------------------

export interface PlotSeriesDef {
  label: string;
  /** Chakra colour token, e.g. "info", "fault", "nominal", "accent.solid". */
  colorToken: string;
}

export interface PlotProps {
  series: PlotSeriesDef[];
  /** Latest value for each series (parallel to `series`). null/undefined → gap. */
  values: (number | null | undefined)[];
  /** Y-axis label (unit). */
  unit?: string;
  /** Fixed Y range. When both are set the chart does not autoscale. */
  yMin?: number;
  yMax?: number;
  /** Rolling window length in ms (default 60 000). */
  windowMs?: number;
  /** Sample cadence in ms (default 200). Scrolling itself runs at rAF rate. */
  tickMs?: number;
  height?: number;
  /** When this changes the rolling buffer is cleared (e.g. launch detected). */
  resetKey?: string | number | null;
}

function readColor(el: HTMLElement | null, fallback: string): string {
  if (!el) return fallback;
  const c = getComputedStyle(el).color;
  return c && c !== "" ? c : fallback;
}

export function Plot({
  series,
  values,
  unit,
  yMin,
  yMax,
  windowMs = 30_000,
  tickMs = 1,
  height = 260,
  resetKey = null,
}: PlotProps) {
  const { colorMode } = useColorMode();

  const containerRef = useRef<HTMLDivElement>(null);
  const seriesProbeRefs = useRef<(HTMLDivElement | null)[]>([]);
  const axisProbeRef = useRef<HTMLDivElement>(null);
  const gridProbeRef = useRef<HTMLDivElement>(null);

  const plotRef = useRef<uPlot | null>(null);
  const xsRef = useRef<number[]>([]);
  const ysRef = useRef<number[][]>(series.map(() => []));
  const valuesRef = useRef(values);
  valuesRef.current = values;

  const windowSec = windowMs / 1000;
  // Identity of the series set — rebuild the chart when it changes.
  const seriesKey = series.map((s) => `${s.colorToken}:${s.label}`).join("|");

  // --- Build (and rebuild on theme / series / scale change) ----------------
  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;

    const seriesColors = series.map((_, i) => readColor(seriesProbeRefs.current[i], "#7f8ea3"));
    const axisColor = readColor(axisProbeRef.current, "#94a0b3");
    const gridColor = readColor(gridProbeRef.current, "#26303f");
    const rect = host.getBoundingClientRect();

    const fixedY = yMin != null && yMax != null;

    const opts: uPlot.Options = {
      width: Math.max(rect.width, 120),
      height,
      cursor: { show: false },
      legend: { show: false },
      scales: {
        x: { time: false },
        y: fixedY ? { range: [yMin as number, yMax as number] } : {},
      },
      axes: [
        {
          stroke: axisColor,
          grid: { stroke: gridColor, width: 1 },
          ticks: { stroke: gridColor, width: 1, size: 4 },
          // Tick at each 15s boundary back from "now".
          splits: (_u, _i, _min, max) => {
            const out: number[] = [];
            for (let s = windowSec; s >= 0; s -= 5) out.push(max - s);
            return out;
          },
          values: (u, splits) => {
            const max = u.scales.x.max ?? 0;
            return splits.map((v) => {
              const ago = Math.round(max - v);
              return ago <= 0 ? "now" : `${ago}s`;
            });
          },
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
          stroke: seriesColors[i],
          width: 2,
          points: { show: false },
        })),
      ],
    };

    const u = new uPlot(opts, [[], ...series.map(() => [])] as unknown as uPlot.AlignedData, host);
    plotRef.current = u;
    // Repaint immediately from whatever is already buffered.
    if (xsRef.current.length) {
      u.setData([xsRef.current, ...ysRef.current] as unknown as uPlot.AlignedData);
    }

    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        u.setSize({ width: Math.max(containerRef.current.clientWidth, 120), height });
      }
    });
    ro.observe(host);

    return () => {
      ro.disconnect();
      u.destroy();
      plotRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorMode, seriesKey, unit, yMin, yMax, height, windowSec]);

  // --- Reset buffer on resetKey change (e.g. launch detected) --------------
  useEffect(() => {
    xsRef.current = [];
    ysRef.current = series.map(() => []);
    plotRef.current?.setData([[], ...series.map(() => [])] as unknown as uPlot.AlignedData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, seriesKey]);

  // --- Sample at tickMs, but scroll the window every animation frame so the
  //     trace glides instead of stepping forward in discrete jumps. ----------
  useEffect(() => {
    let raf = 0;
    let lastSample = 0;
    const loop = () => {
      const u = plotRef.current;
      if (u) {
        const nowMs = Date.now();
        const now = nowMs / 1000;
        // Append a new sample only every tickMs (controls point density).
        if (nowMs - lastSample >= tickMs) {
          lastSample = nowMs;
          const vals = valuesRef.current;
          xsRef.current.push(now);
          ysRef.current.forEach((arr, i) => {
            const v = vals[i];
            arr.push(typeof v === "number" && Number.isFinite(v) ? v : NaN);
          });
          const cutoff = now - windowSec - 1;
          while (xsRef.current.length && xsRef.current[0] < cutoff) {
            xsRef.current.shift();
            ysRef.current.forEach((arr) => arr.shift());
          }
          u.setData([xsRef.current, ...ysRef.current] as unknown as uPlot.AlignedData, false);
        }
        // Smooth scroll: move the x-window to "now" on every frame.
        u.setScale("x", { min: now - windowSec, max: now });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickMs, windowSec, seriesKey]);

  return (
    <Box position="relative" width="100%">
      <Box ref={containerRef} width="100%" height={`${height}px`} />
      {/* Hidden probes — let Chakra resolve theme tokens to concrete colours
          that uPlot can paint with. */}
      <Box position="absolute" w="0" h="0" overflow="hidden" aria-hidden>
        {series.map((s, i) => (
          <Box
            key={i}
            ref={(el: HTMLDivElement | null) => { seriesProbeRefs.current[i] = el; }}
            color={s.colorToken}
          />
        ))}
        <Box ref={axisProbeRef} color="text.muted" />
        <Box ref={gridProbeRef} color="border.default" />
      </Box>
    </Box>
  );
}

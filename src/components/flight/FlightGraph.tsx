"use client";

import {
  useRef,
  useState,
  useEffect,
  useCallback,
} from "react";
import { Box, Flex, Text, Separator } from "@chakra-ui/react";
import { Card, Mono } from "@/components/primitives";
import { useFlightRecord } from "@/hooks/useFlightRecord";
import { clearFlightRecord } from "@/lib/flight/recorder";
import type { FlightEvent } from "@/lib/flight/types";
require("uplot/dist/uPlot.min.css");

// ---------------------------------------------------------------------------
// Series config
// ---------------------------------------------------------------------------

type SeriesKey = "altitude" | "velocity" | "accelMag" | "pressure" | "temperature";

interface SeriesMeta {
  key: SeriesKey;
  label: string;
  unit: string;
  color: string;
}

// uPlot requires CSS colours — hardcoded hex is acceptable here per spec
const SERIES: SeriesMeta[] = [
  { key: "altitude",    label: "Altitude",        unit: "m",     color: "#60a5fa" },
  { key: "velocity",    label: "Velocity",        unit: "m/s",   color: "#34d399" },
  { key: "accelMag",    label: "Accel Magnitude", unit: "m/s²",  color: "#f87171" },
  { key: "pressure",    label: "Pressure",        unit: "hPa",   color: "#a78bfa" },
  { key: "temperature", label: "Temperature",     unit: "°C",    color: "#fbbf24" },
];

/** Rolling-window length (seconds) shown before launch is detected. */
const ROLLING_SEC = 60;

export interface FlightGraphProps {
  events: FlightEvent[];
  /** T-0 epoch ms — null before launch (rolling), set after (T+ mission clock). */
  launchEpochMs: number | null;
}

// ---------------------------------------------------------------------------
// Small numeric helpers (loop-based to avoid spread-on-huge-array stack limits)
// ---------------------------------------------------------------------------

function lowerBound(arr: number[], t: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function minMaxFinite(arr: number[]): [number, number] | null {
  let mn = Infinity;
  let mx = -Infinity;
  let any = false;
  for (const v of arr) {
    if (Number.isFinite(v)) {
      any = true;
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
  }
  return any ? [mn, mx] : null;
}

/** Normalise a series to 0–100% over its own finite min/max (NaN = gap). */
function normalise(arr: number[]): number[] {
  const mm = minMaxFinite(arr);
  if (!mm) return arr.map(() => NaN);
  const [min, max] = mm;
  const span = max - min || 1;
  return arr.map((v) => (Number.isFinite(v) ? ((v - min) / span) * 100 : NaN));
}

// ---------------------------------------------------------------------------
// FlightGraph
// ---------------------------------------------------------------------------

export function FlightGraph({ events, launchEpochMs }: FlightGraphProps) {
  // Live recorded series (collected centrally from connect — see recorder.ts).
  const { tsSec, channels } = useFlightRecord(200);

  // Series toggles
  const [enabledSeries, setEnabledSeries] = useState<Record<SeriesKey, boolean>>({
    altitude: true,
    velocity: true,
    accelMag: true,
    pressure: false,
    temperature: false,
  });

  // Event marker toggles
  const uniqueEventNames = Array.from(new Set(events.map((e) => e.name)));
  const [enabledEvents, setEnabledEvents] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(uniqueEventNames.map((n) => [n, true])),
  );

  // Keep enabledEvents in sync as new event names arrive
  useEffect(() => {
    setEnabledEvents((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const name of uniqueEventNames) {
        if (!(name in next)) {
          next[name] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events.length]);

  // --- Window selection: rolling before launch, full T+ history after -------
  const launchActive = launchEpochMs != null;
  const launchSec = launchActive ? launchEpochMs! / 1000 : null;
  const nowSec = Date.now() / 1000;
  const minT = launchSec != null ? launchSec : nowSec - ROLLING_SEC;
  const startIdx = lowerBound(tsSec, minT);

  const times = tsSec.slice(startIdx);
  const dataByKey = {} as Record<SeriesKey, number[]>;
  for (const s of SERIES) dataByKey[s.key] = channels[s.key].slice(startIdx);
  const t0 = launchSec != null ? launchSec : (times[0] ?? 0);
  const hasData = times.length > 1;

  // Legend range info
  const rangeInfo = SERIES.map((s) => {
    const mm = minMaxFinite(dataByKey[s.key]);
    return mm ? { ...s, min: mm[0], max: mm[1] } : { ...s, min: null, max: null };
  });

  const activeSeries = SERIES.filter((s) => enabledSeries[s.key]);

  const clearHistory = useCallback(() => {
    clearFlightRecord();
  }, []);

  return (
    <Flex gap={4} p={4} align="flex-start">
      {/* ------------------------------------------------------------------ */}
      {/* Left: chart ~75%                                                     */}
      {/* ------------------------------------------------------------------ */}
      <Box flex="3" minW={0}>
        <Card
          title="Flight Data Graph"
          headerAction={
            <Mono fontSize="2xs" color={launchActive ? "nominal" : "text.muted"}>
              {launchActive ? "T+ mission clock" : `Rolling ${ROLLING_SEC}s`}
            </Mono>
          }
          flush
          minH="400px"
        >
          {!hasData ? (
            <Flex align="center" justify="center" minH="400px" direction="column" gap={2}>
              <Text fontFamily="mono" fontSize="2xl" color="text.muted">—</Text>
              <Text fontSize="sm" color="text.muted">No flight data recorded yet</Text>
            </Flex>
          ) : (
            <Box>
              <UplotChart
                times={times}
                dataByKey={dataByKey}
                activeSeries={activeSeries}
                t0={t0}
                launchActive={launchActive}
                events={events}
                enabledEvents={enabledEvents}
              />
              {/* Legend */}
              <Flex flexWrap="wrap" gap={2} px={4} pb={3} pt={2}>
                {rangeInfo.map((s) => (
                  <Flex
                    key={s.key}
                    align="center"
                    gap={1.5}
                    opacity={enabledSeries[s.key] ? 1 : 0.4}
                    transition="opacity 0.15s"
                  >
                    <Box
                      w="10px"
                      h="10px"
                      borderRadius="2px"
                      flexShrink={0}
                      bg={s.color}
                    />
                    <Text fontSize="xs" color="text.muted" fontFamily="mono">
                      {s.label}
                    </Text>
                    {s.min != null && s.max != null && (
                      <Text fontSize="xs" color="text.muted" fontFamily="mono">
                        <Mono fontSize="xs">
                          {s.min.toFixed(1)}–{s.max.toFixed(1)} {s.unit}
                        </Mono>
                      </Text>
                    )}
                    {s.min == null && (
                      <Mono fontSize="xs" color="text.muted">—</Mono>
                    )}
                  </Flex>
                ))}
              </Flex>
            </Box>
          )}
        </Card>
      </Box>

      {/* ------------------------------------------------------------------ */}
      {/* Right: control panel ~25%                                            */}
      {/* ------------------------------------------------------------------ */}
      <Box flex="1" minW="180px" maxW="260px">
        <Card title="Series">
          <Flex direction="column" gap={3}>
            {SERIES.map((s) => (
              <Flex key={s.key} align="center" gap={2} as="label" cursor="pointer">
                <Box
                  w="8px"
                  h="8px"
                  borderRadius="2px"
                  flexShrink={0}
                  bg={s.color}
                  opacity={enabledSeries[s.key] ? 1 : 0.35}
                  transition="opacity 0.15s"
                />
                <Text fontSize="sm" color="text.primary" flex={1}>
                  {s.label}
                </Text>
                <Text fontSize="xs" color="text.muted" fontFamily="mono" mr={2}>
                  {s.unit}
                </Text>
                <input
                  type="checkbox"
                  checked={enabledSeries[s.key]}
                  onChange={(e) =>
                    setEnabledSeries((prev) => ({
                      ...prev,
                      [s.key]: e.target.checked,
                    }))
                  }
                />
              </Flex>
            ))}

            {uniqueEventNames.length > 0 && (
              <>
                <Separator />
                <Text fontSize="xs" fontWeight="600" color="text.muted" letterSpacing="0.06em" textTransform="uppercase">
                  Events
                </Text>
                {uniqueEventNames.map((name) => (
                  <Flex key={name} align="center" gap={2} as="label" cursor="pointer">
                    <Box
                      w="8px"
                      h="8px"
                      borderRadius="1px"
                      flexShrink={0}
                      border="1px dashed"
                      borderColor="text.muted"
                      opacity={enabledEvents[name] ? 1 : 0.35}
                    />
                    <Mono fontSize="xs" color="text.primary" flex={1} truncate>
                      {name}
                    </Mono>
                    <input
                      type="checkbox"
                      checked={enabledEvents[name] ?? true}
                      onChange={(e) =>
                        setEnabledEvents((prev) => ({
                          ...prev,
                          [name]: e.target.checked,
                        }))
                      }
                    />
                  </Flex>
                ))}
              </>
            )}

            <Separator />

            <Box
              as="button"
              onClick={clearHistory}
              px={3}
              py={2}
              fontSize="xs"
              fontFamily="mono"
              border="1px solid"
              borderColor="border.default"
              borderRadius="control"
              color="text.muted"
              cursor="pointer"
              transition="all 0.15s"
              textAlign="center"
              _hover={{ borderColor: "fault", color: "fault" }}
            >
              Clear history
            </Box>
          </Flex>
        </Card>
      </Box>
    </Flex>
  );
}

// ---------------------------------------------------------------------------
// uPlot chart sub-component
// ---------------------------------------------------------------------------

interface UplotChartProps {
  times: number[];                       // x in seconds
  dataByKey: Record<SeriesKey, number[]>;
  activeSeries: SeriesMeta[];
  t0: number;                            // T-0 reference (seconds) for labels
  launchActive: boolean;
  events: FlightEvent[];
  enabledEvents: Record<string, boolean>;
}

function UplotChart({
  times, dataByKey, activeSeries, t0, launchActive, events, enabledEvents,
}: UplotChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const axisProbeRef = useRef<HTMLDivElement>(null);
  const gridProbeRef = useRef<HTMLDivElement>(null);
  // uPlot is a CJS module — the constructor IS the module export
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const uplotRef = useRef<any>(null);
  // t0 is read at paint time from a ref so a changing T-0 (rolling window) does
  // not force the whole chart to be rebuilt.
  const t0Ref = useRef(t0);
  t0Ref.current = t0;

  const seriesKey = activeSeries.map((s) => s.key).join(",");

  // --- Create the chart (only when the series set / launch mode changes) ----
  useEffect(() => {
    if (!containerRef.current) return;

    const readColor = (el: HTMLElement | null, fallback: string) =>
      (el && getComputedStyle(el).color) || fallback;
    const axisColor = readColor(axisProbeRef.current, "#94a0b3");
    const gridColor = readColor(gridProbeRef.current, "#26303f");

    let destroyed = false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    import("uplot").then((mod: any) => {
      const uPlot = mod.default ?? mod;
      if (destroyed || !containerRef.current) return;

      if (uplotRef.current) {
        uplotRef.current.destroy();
        uplotRef.current = null;
      }

      const w = containerRef.current.clientWidth || 800;
      const h = 360;

      const opts = {
        width: w,
        height: h,
        scales: {
          x: { time: false },
          y: { range: [0, 100] },
        },
        axes: [
          {
            // X axis: T±MM:SS relative to T-0 (read live from t0Ref)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            values: (_u: any, vals: number[]) =>
              vals.map((v) => {
                const dt = Math.round(v - t0Ref.current);
                const sign = dt < 0 ? "-" : "+";
                const abs = Math.abs(dt);
                const mm = String(Math.floor(abs / 60)).padStart(2, "0");
                const ss = String(abs % 60).padStart(2, "0");
                return `T${sign}${mm}:${ss}`;
              }),
            stroke: axisColor,
            ticks: { stroke: gridColor, width: 1 },
            grid: { stroke: gridColor, width: 1, dash: [3, 4] },
          },
          {
            label: "% of range",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            values: (_u: any, vals: number[]) => vals.map((v) => `${v?.toFixed(0)}%`),
            stroke: axisColor,
            ticks: { stroke: gridColor, width: 1 },
            grid: { stroke: gridColor, width: 1, dash: [3, 4] },
          },
        ],
        series: [
          { label: "Time" },
          ...activeSeries.map((s) => ({
            label: s.label,
            stroke: s.color,
            width: 2,
            spanGaps: false,
          })),
        ],
        cursor: { show: true },
        legend: { show: false },
      };

      const emptyData = [
        new Float64Array(0),
        ...activeSeries.map(() => new Float64Array(0)),
      ];
      uplotRef.current = new uPlot(opts, emptyData, containerRef.current);
    });

    return () => {
      destroyed = true;
      if (uplotRef.current) {
        uplotRef.current.destroy();
        uplotRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesKey, launchActive]);

  // --- Push data + redraw markers on every record tick ----------------------
  useEffect(() => {
    const u = uplotRef.current;
    if (!u || times.length === 0) return;

    const normData = activeSeries.map((s) => normalise(dataByKey[s.key]));
    const data = [
      new Float64Array(times),
      ...normData.map((arr) => {
        const fa = new Float64Array(arr.length);
        arr.forEach((v, i) => { fa[i] = Number.isFinite(v) ? v : NaN; });
        return fa;
      }),
    ];
    u.setData(data);

    // Event markers — vertical dashed lines on the .u-over layer.
    const over = (containerRef.current?.querySelector(".u-over") as HTMLElement) ?? null;
    if (over) {
      over.querySelectorAll(".nova-event-marker").forEach((el) => el.remove());

      const span = times[times.length - 1] - times[0] || 1;
      const draw = (xPct: number, label: string, color: string) => {
        if (xPct < 0 || xPct > 1) return;
        const marker = document.createElement("div");
        marker.className = "nova-event-marker";
        marker.style.cssText = `position:absolute;top:0;bottom:0;left:${(xPct * 100).toFixed(2)}%;width:1px;background:${color};border-left:1px dashed ${color};pointer-events:none;`;
        const tag = document.createElement("span");
        tag.style.cssText = `position:absolute;top:2px;left:3px;font-size:9px;font-family:JetBrains Mono,monospace;color:${color};white-space:nowrap;pointer-events:none;`;
        tag.textContent = label.slice(0, 14);
        marker.appendChild(tag);
        over.appendChild(marker);
      };

      // Milestone: always mark T-0 once launch is detected.
      if (launchActive) {
        draw((t0Ref.current - times[0]) / span, "LAUNCH", "rgba(52, 211, 153, 0.9)");
      }

      // Backend events with a timestamp (treated as epoch ms).
      for (const ev of events) {
        if (ev.timestamp == null) continue;
        if (!(enabledEvents[ev.name] ?? true)) continue;
        const evSec = ev.timestamp / 1000;
        draw((evSec - times[0]) / span, ev.name, "rgba(251, 191, 36, 0.85)");
      }
    }
  }, [times, dataByKey, activeSeries, events, enabledEvents, launchActive]);

  // --- Responsive width -----------------------------------------------------
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => {
      if (uplotRef.current && containerRef.current) {
        uplotRef.current.setSize({
          width: containerRef.current.clientWidth || 800,
          height: 360,
        });
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <Box position="relative" w="100%">
      <Box
        ref={containerRef}
        w="100%"
        css={{
          "& .u-wrap": { width: "100% !important" },
          "& .u-over": { position: "relative" },
        }}
      />
      {/* Hidden probes — let Chakra resolve theme tokens for the canvas axes. */}
      <Box position="absolute" w="0" h="0" overflow="hidden" aria-hidden>
        <Box ref={axisProbeRef} color="text.muted" />
        <Box ref={gridProbeRef} color="border.default" />
      </Box>
    </Box>
  );
}

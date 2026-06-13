"use client";

import {
  useRef,
  useState,
  useEffect,
  useCallback,
} from "react";
import { Box, Flex, Text, Separator } from "@chakra-ui/react";
import { Card, Mono } from "@/components/primitives";
import type { FlightTelemetry, FlightEvent } from "@/lib/flight/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FlightTelemetryPoint {
  t: number;
  altitude?: number;
  velocity?: number;
  accelMag?: number;
  pressure?: number;
  temperature?: number;
}

export interface FlightGraphProps {
  currentTelemetry: FlightTelemetry | null;
  events: FlightEvent[];
}

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
  { key: "altitude",    label: "Altitude",         unit: "m",     color: "#60a5fa" },
  { key: "velocity",    label: "Velocity",          unit: "m/s",   color: "#34d399" },
  { key: "accelMag",   label: "Accel Magnitude",   unit: "m/s²",  color: "#f87171" },
  { key: "pressure",   label: "Pressure",          unit: "hPa",   color: "#a78bfa" },
  { key: "temperature",label: "Temperature",       unit: "°C",    color: "#fbbf24" },
];

const MAX_HISTORY = 1000;

// ---------------------------------------------------------------------------
// Normalise a data array to 0–100% over its own min/max
// ---------------------------------------------------------------------------

function normalise(arr: (number | null | undefined)[]): (number | null)[] {
  const valid = arr.filter((v): v is number => v != null);
  if (valid.length === 0) return arr.map(() => null);
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const span = max - min || 1;
  return arr.map((v) => (v == null ? null : ((v - min) / span) * 100));
}

// ---------------------------------------------------------------------------
// FlightGraph
// ---------------------------------------------------------------------------

export function FlightGraph({ currentTelemetry, events }: FlightGraphProps) {
  // History buffer — mutated in place
  const historyRef = useRef<FlightTelemetryPoint[]>([]);
  const [, forceRender] = useState(0);

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

  // Accumulate history
  useEffect(() => {
    if (!currentTelemetry) return;
    const t = currentTelemetry.timestamp ?? Date.now();
    const last = historyRef.current[historyRef.current.length - 1];
    if (last && last.t === t) return; // deduplicate same timestamp

    const point: FlightTelemetryPoint = {
      t,
      altitude: currentTelemetry.altitude,
      velocity: currentTelemetry.velocity,
      accelMag: currentTelemetry.accel?.magnitude,
      pressure: currentTelemetry.pressure,
      temperature: currentTelemetry.temperature,
    };
    historyRef.current = [...historyRef.current, point].slice(-MAX_HISTORY);
    forceRender((n) => n + 1);
  }, [currentTelemetry]);

  const clearHistory = useCallback(() => {
    historyRef.current = [];
    forceRender((n) => n + 1);
  }, []);

  const history = historyRef.current;
  const hasData = history.length > 0;

  // Compute range info for legend
  const rangeInfo = SERIES.map((s) => {
    const vals = history.map((p) => p[s.key]).filter((v): v is number => v != null);
    if (vals.length === 0) return { ...s, min: null, max: null };
    return { ...s, min: Math.min(...vals), max: Math.max(...vals) };
  });

  // Active series in current render
  const activeSeries = SERIES.filter((s) => enabledSeries[s.key]);

  return (
    <Flex gap={4} p={4} align="flex-start">
      {/* ------------------------------------------------------------------ */}
      {/* Left: chart ~75%                                                     */}
      {/* ------------------------------------------------------------------ */}
      <Box flex="3" minW={0}>
        <Card title="Flight Data Graph" flush minH="400px">
          {!hasData ? (
            <Flex align="center" justify="center" minH="400px" direction="column" gap={2}>
              <Text fontFamily="mono" fontSize="2xl" color="text.muted">—</Text>
              <Text fontSize="sm" color="text.muted">No flight data recorded yet</Text>
            </Flex>
          ) : (
            <Box>
              <UplotChart
                history={history}
                activeSeries={activeSeries}
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
  history: FlightTelemetryPoint[];
  activeSeries: SeriesMeta[];
  events: FlightEvent[];
  enabledEvents: Record<string, boolean>;
}

function UplotChart({ history, activeSeries, events, enabledEvents }: UplotChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // uPlot is a CJS module — the constructor IS the module export
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const uplotRef = useRef<any>(null);
  // Key to force chart recreation when series list changes
  const seriesKeyRef = useRef<string>("");

  const buildChart = useCallback(() => {
    if (!containerRef.current || history.length === 0) return;

    // Lazily import uPlot (CJS module — the module itself is the constructor)
    import("uplot").then((mod) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const uPlot = (mod as any).default ?? mod;
      if (!containerRef.current) return;

      // Destroy existing instance
      if (uplotRef.current) {
        uplotRef.current.destroy();
        uplotRef.current = null;
      }

      const w = containerRef.current.clientWidth || 800;
      const h = 360;

      const times = history.map((p) => p.t / 1000); // uPlot uses seconds

      // Build data arrays: [timestamps, ...series]
      const rawData: (number | null)[][] = activeSeries.map((s) =>
        history.map((p) => {
          const v = p[s.key];
          return v != null ? v : null;
        }),
      );
      const normData = rawData.map(normalise);

      const data: uPlot.AlignedData = [
        new Float64Array(times),
        ...normData.map((arr) => {
          const fa = new Float64Array(arr.length);
          arr.forEach((v, i) => { fa[i] = v ?? NaN; });
          return fa;
        }),
      ] as unknown as uPlot.AlignedData;

      // First timestamp for T+ labelling
      const t0 = times[0] ?? 0;

      const opts: uPlot.Options = {
        width: w,
        height: h,
        scales: {
          x: { time: false },
          y: { range: [0, 100] },
        },
        axes: [
          {
            // X axis: T+MM:SS relative to first point
            values: (_u, vals) =>
              vals.map((v) => {
                const dt = Math.round(v - t0);
                const sign = dt < 0 ? "-" : "+";
                const abs = Math.abs(dt);
                const mm = String(Math.floor(abs / 60)).padStart(2, "0");
                const ss = String(abs % 60).padStart(2, "0");
                return `T${sign}${mm}:${ss}`;
              }),
            stroke: "var(--chakra-colors-text-muted)",
            ticks: { stroke: "var(--chakra-colors-border-default)", width: 1 },
            grid: { stroke: "var(--chakra-colors-border-default)", width: 1, dash: [3, 4] },
          },
          {
            // Y axis: normalised 0–100%
            values: (_u, vals) => vals.map((v) => `${v?.toFixed(0)}%`),
            stroke: "var(--chakra-colors-text-muted)",
            ticks: { stroke: "var(--chakra-colors-border-default)", width: 1 },
            grid: { stroke: "var(--chakra-colors-border-default)", width: 1, dash: [3, 4] },
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
        legend: { show: false }, // we render our own legend
      };

      const u = new uPlot(opts, data, containerRef.current);
      uplotRef.current = u;

      // Draw event markers as vertical dashed lines using the over div
      const over = containerRef.current.querySelector<HTMLElement>(".u-over");
      if (over) {
        // Remove old markers
        over.querySelectorAll(".nova-event-marker").forEach((el) => el.remove());

        const visibleEvents = events.filter(
          (e) => e.timestamp != null && (enabledEvents[e.name] ?? true),
        );

        for (const ev of visibleEvents) {
          if (ev.timestamp == null) continue;
          const evSec = ev.timestamp / 1000;
          const xPct = (evSec - times[0]) / (times[times.length - 1] - times[0]);
          if (xPct < 0 || xPct > 1) continue;

          const marker = document.createElement("div");
          marker.className = "nova-event-marker";
          marker.style.cssText = `
            position: absolute;
            top: 0;
            bottom: 0;
            left: ${(xPct * 100).toFixed(2)}%;
            width: 1px;
            background: rgba(251, 191, 36, 0.7);
            border-left: 1px dashed rgba(251, 191, 36, 0.7);
            pointer-events: none;
          `;

          const label = document.createElement("span");
          label.style.cssText = `
            position: absolute;
            top: 2px;
            left: 3px;
            font-size: 9px;
            font-family: JetBrains Mono, monospace;
            color: rgba(251, 191, 36, 0.9);
            white-space: nowrap;
            pointer-events: none;
          `;
          label.textContent = ev.name.slice(0, 12);
          marker.appendChild(label);
          over.appendChild(marker);
        }
      }
    });
  }, [history, activeSeries, events, enabledEvents]);

  // Rebuild on data/series/events change
  useEffect(() => {
    const newKey = activeSeries.map((s) => s.key).join(",");
    if (newKey !== seriesKeyRef.current) {
      seriesKeyRef.current = newKey;
    }
    buildChart();

    return () => {
      if (uplotRef.current) {
        uplotRef.current.destroy();
        uplotRef.current = null;
      }
    };
  }, [buildChart]);

  // ResizeObserver for responsive width
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
    <Box
      ref={containerRef}
      w="100%"
      css={{
        "& .u-wrap": { width: "100% !important" },
        "& .u-over": { position: "relative" },
      }}
    />
  );
}

"use client";

import { Box, Flex } from "@chakra-ui/react";
import { Mono } from "./Mono";
import { useToken } from "@chakra-ui/react";


export interface GaugeZone {
  /** Fraction 0..1 of the arc where this zone ends. */
  upTo: number;
  /** Chakra color token name. */
  color: string;
}

export interface GaugeProps {
  value?: number | null;
  min?: number;
  max?: number;
  unit?: string;
  label?: string;
  size?: number;
  /** Coloured limit zones (blue -> green -> amber -> red as values climb). */
  zones?: GaugeZone[];
  stale?: boolean;
}

const DEFAULT_ZONES: GaugeZone[] = [
  { upTo: 0.25, color: "info" },
  { upTo: 0.6,  color: "nominal" },
  { upTo: 0.85, color: "warn" },
  { upTo: 1,    color: "fault" },
];

/**
 * Half-circle needle dial. Arc sweeps 180° (left=min, top=mid, right=max).
 * Coloured limit zones, outer-rim tick marks, scale labels, and a needle.
 */
export function Gauge({
  value,
  min = 0,
  max = 100,
  unit,
  label,
  size = 180,
  zones = DEFAULT_ZONES,
  stale = false,
}: GaugeProps) {
  const [text, muted] = useToken("colors", ["text","text.muted"]);

  const w = size;
  const h = size * 0.62;
  const margin = 15;
  const cx = w / 2;
  const cy = h - 6;
  const rw = 14; // rim width, for tick mark calculations
  const r = w * 0.4;
  const rarc = r - rw / 2; // radius for zone arcs (so ticks can be drawn on top)

  const hasValue = value !== undefined && value !== null && Number.isFinite(value);
  const clamped = hasValue ? Math.min(max, Math.max(min, value as number)) : min;
  const frac = max > min ? (clamped - min) / (max - min) : 0;

  const angle = Math.PI * (1 - frac);
  const needleX = cx + Math.cos(angle) * (r - 4);
  const needleY = cy - Math.sin(angle) * (r - 4);

  // Outer-rim ticks: 11 stops, major at 0/5/10, mid at even, minor at odd
  const ticks = Array.from({ length: 11 }, (_, i) => {
    const tp = i / 10;
    const a = Math.PI * (1 - tp);
    const isMaj = i % 5 === 0;
    const isMid = i % 2 === 0;
    const r1 = r * (isMaj ? 0.77 : isMid ? 0.83 : 0.88);
    return {
      x1: cx + r1 * Math.cos(a),
      y1: cy - r1 * Math.sin(a),
      x2: cx + r  * Math.cos(a),
      y2: cy - r  * Math.sin(a),
      opacity: isMaj ? 1 : isMid ? 0.75 : 0.5,
      strokeWidth: isMaj ? 2 : 1,
    };
  });

  // 5 scale labels outside the ring at 0/25/50/75/100%
  const labelRadius = r + 15;
  const scaleLabels = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const a = Math.PI * (1 - f);
    const lx = cx + Math.cos(a) * labelRadius;
    const ly = cy - Math.sin(a) * labelRadius + 4;
    const val = min + f * (max - min);
    const range = max - min;
    const disp =
      range >= 200
        ? Math.round(val)
        : range >= 10
          ? parseFloat(val.toFixed(1))
          : parseFloat(val.toFixed(2));
    return {
      x:  Math.max(9, Math.min(w - 9, lx)),
      y:  Math.max(9, Math.min(h - 3, ly)),
      label: String(disp),
    };
  });

  return (
    <Flex direction="column" align="center" opacity={stale ? 0.55 : 1} transition="opacity 0.2s">
      <svg width={w} height={h + 4} viewBox={`${-margin} ${-margin} ${w + margin * 3} ${h + margin * 2}`}>
        {/* Track */}
        <path
          d={arcPath(cx, cy, rarc, 180, 0)}
          fill="none"
          stroke="var(--chakra-colors-border-default)"
          strokeWidth={10}
          strokeLinecap="round"
        />
        {/* Zones */}
        {zones.map((zone, i) => {
          const startFrac = i === 0 ? 0 : zones[i - 1].upTo;
          const a0 = 180 - startFrac * 180;
          const a1 = 180 - zone.upTo * 180;
          return (
            <path
              key={i}
              d={arcPath(cx, cy, rarc, a0, a1)}
              fill="none"
              stroke={`var(--chakra-colors-${zone.color})`}
              strokeWidth={10}
              strokeLinecap="butt"
              opacity={hasValue ? 0.9 : 0.3}
            />
          );
        })}
        {/* Rim ticks — drawn on top of zone arcs */}
        {ticks.map(({ x1, y1, x2, y2, opacity, strokeWidth }, i) => (
          <line
            key={i}
            x1={x1.toFixed(1)} y1={y1.toFixed(1)}
            x2={x2.toFixed(1)} y2={y2.toFixed(1)}
            stroke={`var(--chakra-colors-text\\.primary)`}//{muted}
            opacity={opacity}
            strokeWidth={strokeWidth}
          />
        ))}
        {/* Scale labels */}
        {scaleLabels.map(({ x, y, label: lbl }, i) => (
          <text
            key={i}
            x={x.toFixed(1)}
            y={y.toFixed(1)}
            //dominantBaseline="middle"
            textAnchor={ 
              i === 0 ? "end" :
              i === scaleLabels.length - 1 ? "start" : "middle"
             }
            style={{
              fill: "var(--chakra-colors-text\\.muted)",
              fontSize: "var(--chakra-fontSizes-xs)",
              fontFamily: "var(--chakra-fonts-mono)",
            }}
          >
            {lbl}
          </text>
        ))}
        {/* Needle */}
        {hasValue && (
          <>
            <line
              x1={cx} y1={cy}
              x2={needleX.toFixed(1)} y2={needleY.toFixed(1)}
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
            />
            <circle cx={cx} cy={cy} r={4} fill="currentColor" />
          </>
        )}
      </svg>
      <Flex align="baseline" gap={1} mt={-1}>
        <Mono fontSize="xl" fontWeight="600" color={hasValue ? "text.primary" : "text.muted"}>
          {hasValue ? formatValue(clamped) : "—"}
        </Mono>
        {hasValue && unit && (
          <Mono fontSize="xs" color="text.muted">
            {unit}
          </Mono>
        )}
      </Flex>
      {label && (
        <Box fontSize="2xs" textTransform="uppercase" letterSpacing="0.08em" color="text.muted">
          {label}
        </Box>
      )}
    </Flex>
  );
}

function formatValue(v: number): string {
  if (Math.abs(v) >= 1000) return v.toFixed(0);
  if (Math.abs(v) >= 100)  return v.toFixed(1);
  return v.toFixed(2);
}

/** SVG arc path between two angles (degrees, 0=right, 180=left), upper half. */
function arcPath(cx: number, cy: number, r: number, a0Deg: number, a1Deg: number): string {
  const a0 = (a0Deg * Math.PI) / 180;
  const a1 = (a1Deg * Math.PI) / 180;
  const x0 = cx + Math.cos(a0) * r;
  const y0 = cy - Math.sin(a0) * r;
  const x1 = cx + Math.cos(a1) * r;
  const y1 = cy - Math.sin(a1) * r;
  const largeArc = Math.abs(a0Deg - a1Deg) > 180 ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${largeArc} 1 ${x1} ${y1}`;
}

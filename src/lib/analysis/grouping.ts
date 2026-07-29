/**
 * Chart grouping.
 *
 * Channels sharing an engineering unit belong on one axis — that is the whole
 * point of unit grouping. But a group can still be unreadable when its members'
 * magnitudes differ wildly: the thrust load cell reads 0–500 kg while the
 * propellant tank cells read 0–10 kg, and sharing an axis flattens the tanks
 * into a straight line.
 *
 * The offline script solved this by name-matching `CC-LC`. Here the split is
 * driven by the data instead: a channel gets its own chart when its span is
 * more than `SPLIT_RATIO`× the median span of the *other* channels in the
 * group. Comparing against the whole group's median would fail exactly where it
 * matters — in a two-channel group the outlier drags the median up with it —
 * so it is held out of its own comparison. The reason is surfaced in the UI so
 * nothing silently rearranges itself.
 */

import type { Channel, TimeWindow } from "./types";
import { windowIndices } from "./pipeline";

/** A channel's full-scale span is this many times the group median -> split. */
export const SPLIT_RATIO = 20;

export interface ChartGroup {
  /** Stable key for React and for chart-cursor syncing. */
  key: string;
  /** Engineering unit shared by every channel in the group. */
  unit: string;
  channels: Channel[];
  /** Set when the group was broken out of a larger unit group by range. */
  splitReason?: string;
}

function span(
  channel: Channel,
  elapsed: Float64Array,
  window: TimeWindow | null,
): number | null {
  const [lo, hi] = windowIndices(elapsed, window);
  let min = Infinity;
  let max = -Infinity;
  for (let i = lo; i < hi; i++) {
    const v = channel.values[i];
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min === Infinity) return null;
  return Math.max(Math.abs(min), Math.abs(max), max - min);
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Group channels by unit, optionally splitting out range outliers.
 * Order within a group follows the input order (i.e. config order).
 */
export function groupChannels(
  channels: Channel[],
  elapsed: Float64Array,
  window: TimeWindow | null,
  autoSplit: boolean,
): ChartGroup[] {
  const byUnit = new Map<string, Channel[]>();
  for (const ch of channels) {
    const unit = ch.unit || "unitless";
    const list = byUnit.get(unit);
    if (list) list.push(ch);
    else byUnit.set(unit, [ch]);
  }

  const groups: ChartGroup[] = [];
  for (const [unit, members] of byUnit) {
    if (!autoSplit || members.length < 2) {
      groups.push({ key: unit, unit, channels: members });
      continue;
    }

    const spans = new Map<Channel, number>();
    for (const ch of members) {
      const s = span(ch, elapsed, window);
      if (s != null && s > 0) spans.set(ch, s);
    }
    if (spans.size < 2) {
      groups.push({ key: unit, unit, channels: members });
      continue;
    }

    const outliers = members.filter((ch) => {
      const s = spans.get(ch);
      if (s == null) return false;
      // Median of every *other* channel's span — see the note above.
      const others = [...spans.entries()]
        .filter(([other]) => other !== ch)
        .map(([, v]) => v);
      if (others.length === 0) return false;
      const med = median(others);
      return med > 0 && s / med > SPLIT_RATIO;
    });
    const rest = members.filter((ch) => !outliers.includes(ch));

    if (outliers.length === 0 || rest.length === 0) {
      groups.push({ key: unit, unit, channels: members });
      continue;
    }

    groups.push({ key: unit, unit, channels: rest });
    for (const ch of outliers) {
      groups.push({
        key: `${unit}:${ch.id}`,
        unit,
        channels: [ch],
        splitReason: `Range is >${SPLIT_RATIO}× the other ${unit} channels — plotted separately so they stay readable.`,
      });
    }
  }

  return groups;
}

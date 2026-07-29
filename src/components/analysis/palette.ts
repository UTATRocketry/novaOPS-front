import type { Channel } from "@/lib/analysis";

/** Categorical series tokens defined in the theme (`plot.1` … `plot.10`). */
const PLOT_TOKENS = [
  "plot.1",
  "plot.2",
  "plot.3",
  "plot.4",
  "plot.5",
  "plot.6",
  "plot.7",
  "plot.8",
  "plot.9",
  "plot.10",
] as const;

/**
 * Assign a stable colour token to every channel in a dataset.
 *
 * Keyed off the channel's position in the dataset rather than its position in
 * the current selection, so a trace keeps its colour when other channels are
 * toggled on and off.
 */
export function buildColorMap(channels: Channel[]): Map<string, string> {
  const map = new Map<string, string>();
  channels.forEach((ch, i) => {
    map.set(ch.id, PLOT_TOKENS[i % PLOT_TOKENS.length]);
  });
  return map;
}

import { describe, expect, it } from "vitest";

import { SPLIT_RATIO, groupChannels } from "./grouping";
import type { Channel } from "./types";

function channel(id: string, unit: string, values: number[]): Channel {
  return {
    id,
    name: id,
    unit,
    type: "LC",
    origin: "calibrated",
    binding: { source: "GCS", colKey: id },
    values: Float64Array.from(values),
    applied: [],
    sampleRateHz: null,
  };
}

const ramp = (n: number, top: number) => Array.from({ length: n }, (_, i) => (top * i) / (n - 1));
const elapsed = Float64Array.from({ length: 11 }, (_, i) => i);

describe("groupChannels", () => {
  it("groups by unit in input order", () => {
    const groups = groupChannels(
      [channel("a", "psi", ramp(11, 1)), channel("b", "kg", ramp(11, 1)), channel("c", "psi", ramp(11, 1))],
      elapsed,
      null,
      false,
    );
    expect(groups.map((g) => [g.key, g.channels.map((c) => c.id)])).toEqual([
      ["psi", ["a", "c"]],
      ["kg", ["b"]],
    ]);
  });

  it("files a channel with no unit under 'unitless'", () => {
    const groups = groupChannels([channel("a", "", ramp(11, 1))], elapsed, null, false);
    expect(groups[0].unit).toBe("unitless");
  });

  it("returns nothing for no channels", () => {
    expect(groupChannels([], elapsed, null, true)).toEqual([]);
  });

  it("does not split when autoSplit is off", () => {
    const groups = groupChannels(
      [channel("thrust", "kg", ramp(11, 500)), channel("tank", "kg", ramp(11, 10))],
      elapsed,
      null,
      false,
    );
    expect(groups).toHaveLength(1);
  });

  it("splits a channel whose span is far above the others", () => {
    const groups = groupChannels(
      [
        channel("tank1", "kg", ramp(11, 10)),
        channel("thrust", "kg", ramp(11, 500)),
        channel("tank2", "kg", ramp(11, 8)),
      ],
      elapsed,
      null,
      true,
    );
    expect(groups.map((g) => g.key)).toEqual(["kg", "kg:thrust"]);
    expect(groups[0].channels.map((c) => c.id)).toEqual(["tank1", "tank2"]);
    expect(groups[1].splitReason).toContain(`>${SPLIT_RATIO}×`);
  });

  it("compares a channel against the others, so a two-channel group still splits", () => {
    const groups = groupChannels(
      [channel("tank", "kg", ramp(11, 10)), channel("thrust", "kg", ramp(11, 500))],
      elapsed,
      null,
      true,
    );
    expect(groups.map((g) => g.key)).toEqual(["kg", "kg:thrust"]);
  });

  it("keeps channels together at exactly the ratio", () => {
    const groups = groupChannels(
      [channel("a", "kg", ramp(11, 10)), channel("b", "kg", ramp(11, 10 * SPLIT_RATIO))],
      elapsed,
      null,
      true,
    );
    expect(groups).toHaveLength(1);
  });

  it("never drops or duplicates a channel when splitting", () => {
    const groups = groupChannels(
      [channel("a", "kg", ramp(11, 1)), channel("b", "kg", ramp(11, 1000)), channel("c", "kg", ramp(11, 1_000_000))],
      elapsed,
      null,
      true,
    );
    expect(groups.flatMap((g) => g.channels.map((c) => c.id)).sort()).toEqual(["a", "b", "c"]);
  });

  it("ignores channels with no finite data or zero span", () => {
    const groups = groupChannels(
      [
        channel("a", "kg", ramp(11, 10)),
        channel("flat", "kg", new Array(11).fill(0)),
        channel("nan", "kg", new Array(11).fill(NaN)),
      ],
      elapsed,
      null,
      true,
    );
    expect(groups).toHaveLength(1);
  });

  it("only measures spans inside the time window", () => {
    // thrust is huge only after t=5; the window [0, 4] sees it as small.
    const late = [...new Array(6).fill(1), 400, 450, 500, 500, 500];
    const channels = [channel("tank", "kg", ramp(11, 10)), channel("thrust", "kg", late)];
    expect(groupChannels(channels, elapsed, { start: 0, end: 4 }, true)).toHaveLength(1);
    expect(groupChannels(channels, elapsed, null, true)).toHaveLength(2);
  });
});

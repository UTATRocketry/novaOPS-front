import { describe, expect, it } from "vitest";

import {
  counterLabel,
  nodeLink,
  parseNodeHardware,
  parseNodeInfo,
  parseNodeMessage,
  parseNodeState,
  parseNodeStats,
  relayLevel,
} from "./nodes";

describe("parseNodeInfo", () => {
  it("reads novaGround's identity and hardware report", () => {
    const info = parseNodeInfo({
      schema: 1,
      build_id: "b1",
      started_ms: 5,
      stats_interval_ms: 1000,
      actuation: "stopped",
      hardware: { build_id: "b1", parts: { gpio: { expected: true, found: true }, daq: { expected: true, found: false, detail: "none" } }, missing: ["daq"] },
      loops: { publisher: { configured_ms: 50 } },
    })!;
    expect(info).toMatchObject({ build_id: "b1", started_ms: 5, stats_interval_ms: 1000, actuation: "stopped" });
    expect(info.hardware).toEqual({
      build_id: "b1",
      parts: { gpio: { expected: true, found: true, detail: null }, daq: { expected: true, found: false, detail: "none" } },
      missing: ["daq"],
    });
    expect(info.loops).toEqual({ publisher: { configured_ms: 50 } });
  });

  it("works without a hardware report (older builds, novaSim)", () => {
    expect(parseNodeInfo({ build_id: "novaSim" })!.hardware).toBeNull();
    expect(parseNodeInfo(null)).toBeNull();
  });

  it("treats an expected part that wasn't found as missing even if the list leaves it out", () => {
    expect(parseNodeHardware({ parts: { relays: { expected: true, found: false } }, missing: [] })!.missing).toEqual(["relays"]);
  });
});

describe("parseNodeStats", () => {
  it("collects the counters and keeps loops and commands", () => {
    const s = parseNodeStats({
      seq: 1, time_ms: 2, uptime_s: 3.5,
      loops: { publisher: { ticks: 10, overruns: 0, period_ms: { last: { count: 1, min: 1, p50: 1, p99: 1, max: 1 } } } },
      commands: { relay: { count: 2 } },
      publish_failures: 0, daq_read_errors: 4, novel_counter: 9, note: "text",
    })!;
    expect(s.counters).toEqual({ publish_failures: 0, daq_read_errors: 4, novel_counter: 9 });
    expect(s.loops.publisher.period_ms.last?.p50).toBe(1);
    expect(s.loops.publisher.period_ms.total).toBeNull();
    expect(s.commands.relay.count).toBe(2);
    expect(s.uptime_s).toBe(3.5);
  });
});

describe("parseNodeState", () => {
  it("reads relays, servos and GPIO, leaving out absent hardware", () => {
    const st = parseNodeState({
      time_ms: 1,
      relays: { ok: true, mask: 65534 },
      gpios: { ok: true, outputs: [{ pin_id: 17, state: 1 }] },
    })!;
    expect(st.relays).toEqual({ ok: true, mask: 65534 });
    expect(st.servos).toBeNull();
    expect(st.gpios).toEqual({ ok: true, outputs: [{ pin: 17, level: 1 }] });
    expect(relayLevel(65534, 0)).toBe(0);
    expect(relayLevel(65534, 1)).toBe(1);
    expect(relayLevel(null, 1)).toBeNull();
  });
});

describe("parseNodeMessage", () => {
  it("maps each message type to its part, and null payloads to a clear", () => {
    expect(parseNodeMessage({ type: "node_stats_info", node: "n", info: {} })?.part).toBe("info");
    expect(parseNodeMessage({ type: "node_stats", node: "n", stats: null })).toEqual({ node: "n", part: "stats", value: null });
    expect(parseNodeMessage({ type: "node_state", node: "n", state: {} })?.part).toBe("state");
    expect(parseNodeMessage({ type: "node_state", state: {} })).toBeNull();
    expect(parseNodeMessage({ type: "other", node: "n" })).toBeNull();
  });
});

describe("nodeLink and labels", () => {
  it("is online with stats, offline with only retained info, else unknown", () => {
    const base = { info: null, stats: null, state: null };
    expect(nodeLink(undefined)).toBe("unknown");
    expect(nodeLink({ ...base, state: parseNodeState({})! })).toBe("unknown");
    expect(nodeLink({ ...base, info: parseNodeInfo({})! })).toBe("offline");
    expect(nodeLink({ ...base, stats: parseNodeStats({})! })).toBe("online");
  });

  it("labels counters", () => {
    expect(counterLabel("gpio_claim_failures")).toBe("GPIO claim failures");
    expect(counterLabel("output_trips")).toBe("Output trips");
  });
});

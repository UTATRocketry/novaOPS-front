import { act, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useNovaStore } from "@/lib/store/store";
import { parseNodeInfo, parseNodeState, parseNodeStats } from "@/lib/pi/nodes";
import { renderWithProviders } from "@/test/render";
import { NodeStateCard } from "./NodeStateCard";
import { NodeStatsCard } from "./NodeStatsCard";

const initial = useNovaStore.getInitialState();

// Payloads as novaGround publishes them (src/core/stats.cpp, actuator_state.cpp).
const INFO = {
  schema: 1,
  build_id: "novaThermo-1.4.0",
  started_ms: 1795110000000,
  stats_interval_ms: 1000,
  actuation: "enabled",
  hardware: {
    build_id: "novaThermo-1.4.0",
    parts: {
      gpio: { expected: true, found: true },
      daq: { expected: true, found: false },
      relays: { expected: false, found: false },
      servo: { expected: false, found: true },
    },
    missing: ["daq"],
  },
  loops: { publisher: { configured_ms: 50 }, state: { configured_ms: 1000 } },
  measurement: { overrun_period_factor: 2 },
};

const summary = (p50: number, p99: number, max: number, count = 20) => ({ count, min: p50, p50, p99, max });

const STATS = {
  seq: 42,
  time_ms: 1795110042000,
  uptime_s: 3725,
  loops: {
    publisher: { ticks: 840, overruns: 3, period_ms: { last: summary(50.1, 52, 101), total: summary(50, 51, 120) } },
  },
  commands: {
    relay: {
      count: 7,
      received_to_handled_ms: { last: summary(0.1, 0.2, 0.3), total: summary(0.1, 0.2, 0.3) },
      received_to_done_ms: { last: summary(0, 0, 0, 0), total: summary(1.5, 2.5, 3.5) },
    },
  },
  publish_failures: 0,
  daq_read_errors: 12,
  actuator_read_errors: 0,
  stopped_writes: 0,
  gpio_claim_failures: 0,
  gpio_write_failures: 0,
  refused_commands: 0,
  output_trips: 1,
};

const STATE = {
  schema: 1,
  time_ms: 1795110041000,
  // Active-low: bits 0 and 3 cleared = relays 0 and 3 energized.
  relays: { ok: true, mask: 0xffff & ~0b1001 },
  servos: { ok: true, channels: [{ id: 0, output: "off" }, { id: 1, output: "pulse", pulse_us: 1498 }, { id: 2, output: "off" }] },
  gpios: { ok: true, outputs: [{ pin_id: 17, state: 1 }, { pin_id: 27, state: 0 }] },
};

function ingest(node: string, parts: { info?: unknown; stats?: unknown; state?: unknown }) {
  act(() => {
    const s = useNovaStore.getState();
    if (parts.info !== undefined) s.ingestNodeInfo(node, parseNodeInfo(parts.info));
    if (parts.stats !== undefined) s.ingestNodeStats(node, parseNodeStats(parts.stats));
    if (parts.state !== undefined) s.ingestNodeState(node, parseNodeState(parts.state));
  });
}

beforeEach(() => {
  useNovaStore.setState(initial, true);
});

describe("NodeStateCard", () => {
  const panel = (node: string) => within(screen.getByTestId(`node-state-${node}`));

  it("lists both Pis before anything arrives", () => {
    renderWithProviders(<NodeStateCard />);
    expect(panel("novaGround").getByText("No actuator read-back from this node.")).toBeInTheDocument();
    expect(panel("novaThermo").getByText("no stats")).toBeInTheDocument();
  });

  it("shows relays, servos and GPIO outputs as read back", () => {
    renderWithProviders(<NodeStateCard />);
    ingest("novaGround", { info: INFO, stats: STATS, state: STATE });
    const p = panel("novaGround");
    expect(p.getByText("online")).toBeInTheDocument();
    expect(p.getByTestId("relay-0")).toHaveAttribute("data-energized", "true");
    expect(p.getByTestId("relay-3")).toHaveAttribute("data-energized", "true");
    expect(p.getByTestId("relay-1")).toHaveAttribute("data-energized", "false");
    expect(p.getByText("pulse 1498 µs")).toBeInTheDocument();
    expect(p.getByText("2 other channels off")).toBeInTheDocument();
    expect(p.getByText("GPIO 17 high")).toBeInTheDocument();
    expect(p.getByText("GPIO 27 low")).toBeInTheDocument();
  });

  it("flags failed read-backs and missing hardware sections", () => {
    renderWithProviders(<NodeStateCard />);
    ingest("novaThermo", { state: { time_ms: 1, relays: { ok: false }, gpios: { ok: false, outputs: [] } } });
    const p = panel("novaThermo");
    expect(p.getByText("Relay read-back failed")).toBeInTheDocument();
    expect(p.getByText("GPIO read-back failed")).toBeInTheDocument();
    expect(p.getByText("No servo driver.")).toBeInTheDocument();
  });

  it("warns when actuation is stopped and lists trips from the config status", () => {
    renderWithProviders(<NodeStateCard />);
    ingest("novaThermo", { info: { ...INFO, actuation: "stopped" }, state: STATE });
    act(() =>
      useNovaStore.getState().ingestPiConfigStatus({
        node: "novaThermo", target: "TCS", expected_hash: "a", received: true, config_hash: "a", applied_ms: 1,
        rejected: [], reserved_pins: [], thermocouples: {}, mismatch: false, mismatch_reasons: [],
        tripped: [{ output: "gpio:17", reason: "comms_loss", time_ms: 2 }],
      }),
    );
    const p = panel("novaThermo");
    expect(p.getByText("actuation stopped")).toBeInTheDocument();
    expect(p.getByText(/every output write is dropped/)).toBeInTheDocument();
    expect(p.getByText("GPIO 17")).toBeInTheDocument();
    expect(p.getByText("comms loss")).toBeInTheDocument();
  });

  it("adds other reporting nodes such as novaSim", () => {
    renderWithProviders(<NodeStateCard />);
    ingest("novaSim", { state: STATE });
    expect(screen.getByTestId("node-state-novaSim")).toBeInTheDocument();
  });
});

describe("NodeStatsCard", () => {
  const panel = (node: string) => within(screen.getByTestId(`node-stats-${node}`));

  it("says when a node has sent nothing", () => {
    renderWithProviders(<NodeStatsCard />);
    expect(panel("novaGround").getByText(/No stats from this node/)).toBeInTheDocument();
  });

  it("shows identity, uptime, loop timing, command latency and counters", () => {
    renderWithProviders(<NodeStatsCard />);
    ingest("novaThermo", { info: INFO, stats: STATS });
    const p = panel("novaThermo");
    expect(p.getByText("novaThermo-1.4.0")).toBeInTheDocument();
    expect(p.getByText("01:02:05")).toBeInTheDocument();
    expect(p.getByText("1000 ms")).toBeInTheDocument();
    expect(p.getByText("42")).toBeInTheDocument();

    const loop = within(p.getByTestId("loop-publisher"));
    expect(loop.getByText("every 50 ms")).toBeInTheDocument();
    expect(loop.getByText("p50 50.10 · p99 52.00 · max 101.00 ms")).toBeInTheDocument();
    expect(loop.getByText("3 overruns / 840 ticks")).toBeInTheDocument();
    // A loop that's configured but hasn't reported a period yet still lists.
    expect(p.getByTestId("loop-state")).toBeInTheDocument();

    // The last window is empty, so the command latency falls back to the total.
    expect(p.getByText("p50 1.50 · p99 2.50 · max 3.50 ms")).toBeInTheDocument();
    expect(p.getByText("7×")).toBeInTheDocument();

    expect(within(p.getByTestId("counter-daq_read_errors")).getByText("DAQ read errors")).toBeInTheDocument();
    expect(within(p.getByTestId("counter-daq_read_errors")).getByText("12")).toBeInTheDocument();
    expect(within(p.getByTestId("counter-publish_failures")).getByText("0")).toBeInTheDocument();
  });

  it("highlights missing expected hardware as an error", () => {
    renderWithProviders(<NodeStatsCard />);
    ingest("novaThermo", { info: INFO });
    const p = panel("novaThermo");
    expect(p.getByText("1 missing")).toBeInTheDocument();
    expect(p.getByTestId("hardware-missing")).toHaveTextContent("Missing expected hardware: DAQ HATs");
    expect(within(p.getByTestId("hw-daq")).getByText("MISSING")).toBeInTheDocument();
    expect(within(p.getByTestId("hw-gpio")).getByText("found")).toBeInTheDocument();
    expect(within(p.getByTestId("hw-servo")).getByText("found, not expected")).toBeInTheDocument();
    expect(within(p.getByTestId("hw-relays")).getByText("not fitted")).toBeInTheDocument();
    // Info is retained but no stats came: offline.
    expect(p.getByText("offline")).toBeInTheDocument();
  });

  it("shows hardware ok when nothing is missing", () => {
    renderWithProviders(<NodeStatsCard />);
    const hardware = { ...INFO.hardware, parts: { gpio: { expected: true, found: true } }, missing: [] };
    ingest("novaGround", { info: { ...INFO, hardware }, stats: STATS });
    expect(panel("novaGround").getByText("hardware ok")).toBeInTheDocument();
    expect(panel("novaGround").queryByTestId("hardware-missing")).not.toBeInTheDocument();
  });
});

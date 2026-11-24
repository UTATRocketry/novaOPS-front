import { act, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useNovaStore } from "@/lib/store/store";
import type { PiConfigStatus } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { PiConfigStatusCard } from "./PiConfigStatusCard";

const initial = useNovaStore.getInitialState();

const status = (over: Partial<PiConfigStatus> = {}): PiConfigStatus => ({
  node: "novaThermo",
  target: "TCS",
  expected_hash: "3f9a1c0be27d4a55",
  received: true,
  config_hash: "3f9a1c0be27d4a55",
  applied_ms: 1795110000000,
  rejected: [],
  reserved_pins: [],
  thermocouples: {},
  tripped: [],
  mismatch: false,
  mismatch_reasons: [],
  ...over,
});

const panel = (node: string) => within(screen.getByTestId(`pi-status-${node}`));

beforeEach(() => {
  useNovaStore.setState(initial, true);
});

describe("PiConfigStatusCard", () => {
  it("lists both Pis as unknown before the backend reports", () => {
    renderWithProviders(<PiConfigStatusCard />);
    expect(panel("novaGround").getByText("No status from the backend.")).toBeInTheDocument();
    expect(panel("novaThermo").getAllByText("—").length).toBeGreaterThan(0);
    expect(panel("novaThermo").getByText("no stats")).toBeInTheDocument();
  });

  it("says when a Pi hasn't answered yet", () => {
    renderWithProviders(<PiConfigStatusCard />);
    act(() => useNovaStore.getState().ingestPiConfigStatus(status({ received: false, config_hash: null })));
    expect(panel("novaThermo").getByText(/hasn.t reported a config status yet/)).toBeInTheDocument();
  });

  it("shows an applied config", () => {
    renderWithProviders(<PiConfigStatusCard />);
    act(() => useNovaStore.getState().ingestPiConfigStatus(status()));
    expect(panel("novaThermo").getByText("config applied")).toBeInTheDocument();
    expect(panel("novaThermo").getByText("3f9a1c0be27d4a55")).toBeInTheDocument();
  });

  it("shows when it was applied, when the status came, and the applied types and reserved pins", () => {
    renderWithProviders(<PiConfigStatusCard />);
    act(() =>
      useNovaStore.getState().ingestPiConfigStatus(
        status({ apply_state: "applied", received_ms: 1795110000500, thermocouples: { "1": { "1": "T", "0": "K" } }, reserved_pins: [0, 1, 2] }),
      ),
    );
    const p = panel("novaThermo");
    expect(p.getByTestId("pi-apply-novaThermo")).toHaveTextContent(/^applied /);
    expect(p.getByText("last status")).toBeInTheDocument();
    expect(p.getByText("HAT 1: ch0 K, ch1 T")).toBeInTheDocument();
    expect(p.getByText("0, 1, 2")).toBeInTheDocument();
  });

  it("shows a pending config with the time it was sent", () => {
    renderWithProviders(<PiConfigStatusCard />);
    act(() =>
      useNovaStore.getState().ingestPiConfigStatus(
        status({ config_hash: "0000", apply_state: "pending", published_ms: 1795110000000, mismatch: true, mismatch_reasons: ["config_hash"] }),
      ),
    );
    const p = panel("novaThermo");
    expect(p.getByTestId("pi-apply-novaThermo")).toHaveTextContent(/^pending since .*not yet applied/);
    // Both hashes show: what the Pi holds and what was sent.
    expect(p.getByText("0000")).toBeInTheDocument();
    expect(p.getByText("3f9a1c0be27d4a55")).toBeInTheDocument();
  });

  it("derives pending for a status without apply_state", () => {
    renderWithProviders(<PiConfigStatusCard />);
    act(() => useNovaStore.getState().ingestPiConfigStatus(status({ config_hash: "0000", mismatch: true })));
    expect(panel("novaThermo").getByTestId("pi-apply-novaThermo")).toHaveTextContent("pending (Pi holds another config)");
  });

  it("shows the build id and online state from the node's stats", () => {
    renderWithProviders(<PiConfigStatusCard />);
    act(() => {
      const s = useNovaStore.getState();
      s.ingestPiConfigStatus(status());
      s.ingestNodeInfo("novaThermo", { build_id: "novaThermo-1.4.0", started_ms: 1, stats_interval_ms: 1000, actuation: "stopped", hardware: null, loops: {} });
      s.ingestNodeStats("novaThermo", { seq: 1, time_ms: 2, uptime_s: 3, loops: {}, commands: {}, counters: {} });
    });
    const p = panel("novaThermo");
    expect(p.getByText("novaThermo-1.4.0")).toBeInTheDocument();
    expect(p.getByText("online")).toBeInTheDocument();
    expect(p.getByText("stopped")).toBeInTheDocument();
    // Stats gone (stale) but info retained: offline.
    act(() => useNovaStore.getState().ingestNodeStats("novaThermo", null));
    expect(p.getByText("offline")).toBeInTheDocument();
  });

  it("shows a mismatch with its rejected items", () => {
    renderWithProviders(<PiConfigStatusCard />);
    act(() =>
      useNovaStore.getState().ingestPiConfigStatus(
        status({ rejected: [{ item: "gpio.outputs.8", reason: "reserved (SPI0 CE0)" }], mismatch: true, mismatch_reasons: ["rejected"] }),
      ),
    );
    const p = panel("novaThermo");
    expect(p.getByText("config mismatch")).toBeInTheDocument();
    expect(p.getByText("1 item rejected")).toBeInTheDocument();
    expect(p.getByText("gpio.outputs.8")).toBeInTheDocument();
    expect(p.getByText(/reserved \(SPI0 CE0\)/)).toBeInTheDocument();
  });

  it("shows a hash mismatch", () => {
    renderWithProviders(<PiConfigStatusCard />);
    act(() => useNovaStore.getState().ingestPiConfigStatus(status({ config_hash: "0000", mismatch: true, mismatch_reasons: ["config_hash"] })));
    expect(panel("novaThermo").getByText("Pi has config 0000, backend sent 3f9a1c0be27d4a55")).toBeInTheDocument();
  });

  it("shows tripped outputs with their reason and actuators", () => {
    renderWithProviders(<PiConfigStatusCard />);
    act(() =>
      useNovaStore.getState().ingestPiConfigStatus(
        status({ tripped: [{ output: "gpio:17", reason: "comms_loss", time_ms: 1795110123456, actuators: ["TANK-HTR-PWR"] }] }),
      ),
    );
    const p = panel("novaThermo");
    expect(p.getByText("output tripped")).toBeInTheDocument();
    expect(p.getByText("GPIO 17")).toBeInTheDocument();
    expect(p.getByText("comms loss")).toBeInTheDocument();
    expect(p.getByText("TANK-HTR-PWR")).toBeInTheDocument();
    // The other Pi is unaffected.
    expect(panel("novaGround").queryByText("output tripped")).not.toBeInTheDocument();
  });
});

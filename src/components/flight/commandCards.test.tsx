import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { sendFasAux, sendFasRab, sendFasRuncamRecord, sendFasSd } from "@/lib/api/direct";
import { withBackendSupport as realWithBackendSupport } from "@/lib/api/direct";
import type { FmcAuxStatus, FmcSdStatus, FmcStatus, RabStatus } from "@/lib/flight/types";
import { useNovaStore } from "@/lib/store/store";
import type { ClientRole } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { FmcAuxCard } from "./FmcAuxCard";
import { RabCard } from "./RabCard";
import { SdCard } from "./SdCard";

vi.mock("@/lib/api/direct", () => ({
  sendFasAux: vi.fn(),
  sendFasRab: vi.fn(),
  sendFasRuncamRecord: vi.fn(),
  sendFasSd: vi.fn(),
  // Same wrapper as the real one, so a "not supported yet" error reads the same.
  withBackendSupport: async (label: string, call: () => Promise<unknown>) => {
    try {
      return await call();
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (/\b(404|405)\b/.test(m) || /not found/i.test(m)) throw new Error(`${label}: backend does not support this yet`);
      throw e;
    }
  },
}));

const initial = useNovaStore.getInitialState();

function session(role: ClientRole | null, lockout: "locked" | "unlocked" | "unknown" = "unlocked") {
  const store = useNovaStore.getState();
  useNovaStore.setState({ session: { clientId: role ? "c1" : null, role } });
  if (lockout !== "unknown") store.ingestLockout(lockout);
}

const flush = () => act(async () => {});
const button = (name: string | RegExp) => screen.getByRole("button", { name });

beforeEach(() => {
  useNovaStore.setState(initial, true);
  for (const fn of [sendFasAux, sendFasRab, sendFasRuncamRecord, sendFasSd]) {
    vi.mocked(fn).mockReset().mockResolvedValue({ published_commands: [] });
  }
});

void realWithBackendSupport;

// ---------------------------------------------------------------------------

describe("RabCard", () => {
  const rab = (over: Partial<RabStatus> = {}): RabStatus => ({
    rabId: 0,
    fcArmed: false,
    armLine: false,
    disarmLine: false,
    fcArmedGpio: false,
    fmcRx: true,
    armMismatch: false,
    armExpected: false,
    ...over,
  });

  describe("display", () => {
    it("still shows both boards as unknown when there is no telemetry", () => {
      renderWithProviders(<RabCard />);
      expect(screen.getByText("No RAB telemetry")).toBeInTheDocument();
      expect(screen.getAllByText("—")).toHaveLength(2);
    });

    it("labels boards A and B, in key order", () => {
      renderWithProviders(<RabCard rab={{ "RAB:1": rab({ rabId: 1 }), "RAB:0": rab() }} />);
      const labels = screen.getAllByText(/^RAB [AB]$/).map((n) => n.textContent);
      expect(labels).toEqual(["RAB A", "RAB B"]);
    });

    it("shows an armed flight computer, the expected state and the line levels", () => {
      renderWithProviders(<RabCard rab={{ "RAB:0": rab({ fcArmed: true, armExpected: true, armLine: true }) }} />);
      expect(screen.getAllByText("ARMED")).toHaveLength(2);
      expect(screen.getByText("high")).toBeInTheDocument();
      expect(screen.getByText("low")).toBeInTheDocument();
    });

    it("shows 'safe' for a disarmed board", () => {
      renderWithProviders(<RabCard rab={{ "RAB:0": rab() }} />);
      expect(screen.getAllByText("safe")).toHaveLength(2);
    });

    it("raises a card-level ALARM and a per-board chip on an arm mismatch", () => {
      renderWithProviders(<RabCard rab={{ "RAB:0": rab({ armMismatch: true }) }} />);
      expect(screen.getByText("ALARM")).toBeInTheDocument();
      expect(screen.getByText("ARM MISMATCH")).toBeInTheDocument();
    });

    it("shows no alarm when every board agrees", () => {
      renderWithProviders(<RabCard rab={{ "RAB:0": rab(), "RAB:1": rab({ rabId: 1 }) }} />);
      expect(screen.queryByText("ALARM")).not.toBeInTheDocument();
      expect(screen.queryByText("ARM MISMATCH")).not.toBeInTheDocument();
    });

    it("warns when the board is not hearing the FMC", () => {
      renderWithProviders(<RabCard rab={{ "RAB:0": rab({ fmcRx: false }) }} />);
      expect(screen.getByText("LINK DOWN")).toBeInTheDocument();
      expect(screen.getByText("down")).toBeInTheDocument();
    });

    it("shows online status, and the RX count only when known", () => {
      renderWithProviders(<RabCard rab={{ "RAB:0": rab({ online: false, rxCount8: 42 }) }} />);
      expect(screen.getByText("offline")).toBeInTheDocument();
      expect(screen.getByText("42")).toBeInTheDocument();
    });
  });

  describe("arm and disarm", () => {
    const card = (r: Partial<RabStatus> = {}, key = "RAB:0") => renderWithProviders(<RabCard rab={{ [key]: rab(r) }} />);

    it("asks a viewer to get a role, with no controls", () => {
      session("viewer");
      card();
      expect(screen.getByText("Operator role required to arm")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Arm" })).not.toBeInTheDocument();
    });

    it("offers no controls when there is no session", () => {
      card();
      expect(screen.queryByRole("button", { name: "Arm" })).not.toBeInTheDocument();
    });

    it("needs a second click to confirm arming, and sends nothing before it", async () => {
      session("operator");
      card();
      fireEvent.click(button("Arm"));
      expect(screen.getByText("Arm RAB A?")).toBeInTheDocument();
      expect(sendFasRab).not.toHaveBeenCalled();
      fireEvent.click(button("Confirm"));
      await flush();
      expect(sendFasRab).toHaveBeenCalledWith({ action: "arm", rab_id: 0 }, "c1");
      expect(screen.getByText("arm sent")).toBeInTheDocument();
    });

    it("can be cancelled without sending", () => {
      session("operator");
      card();
      fireEvent.click(button("Arm"));
      fireEvent.click(button("Cancel"));
      expect(screen.queryByText("Arm RAB A?")).not.toBeInTheDocument();
      expect(sendFasRab).not.toHaveBeenCalled();
    });

    it("addresses RAB B as board 1", async () => {
      session("operator");
      card({ rabId: 1 }, "RAB:1");
      fireEvent.click(button("Arm"));
      fireEvent.click(button("Confirm"));
      await flush();
      expect(sendFasRab).toHaveBeenCalledWith({ action: "arm", rab_id: 1 }, "c1");
    });

    it("arms only when disarmed, and disarms only when armed", () => {
      session("operator");
      const view = card({ armExpected: false });
      expect(button("Arm")).toBeEnabled();
      expect(button("Disarm")).toBeDisabled();
      view.unmount();
      card({ armExpected: true });
      expect(button("Arm")).toBeDisabled();
      expect(button("Disarm")).toBeEnabled();
    });

    it("also needs a confirmation to disarm", async () => {
      session("operator");
      card({ armExpected: true });
      fireEvent.click(button("Disarm"));
      expect(screen.getByText("Disarm RAB A?")).toBeInTheDocument();
      fireEvent.click(button("Confirm"));
      await flush();
      expect(sendFasRab).toHaveBeenCalledWith({ action: "disarm", rab_id: 0 }, "c1");
    });

    it("blocks arming while the lockout is engaged, and says so", () => {
      session("operator", "locked");
      card();
      expect(button("Arm")).toBeDisabled();
      expect(screen.getByText("Nova lockout active")).toBeInTheDocument();
    });

    it("treats an unknown lockout as engaged", () => {
      session("operator", "unknown");
      card();
      expect(button("Arm")).toBeDisabled();
    });

    it("never blocks disarming on the lockout, since safe must always be reachable", async () => {
      session("operator", "locked");
      card({ armExpected: true });
      expect(button("Disarm")).toBeEnabled();
      fireEvent.click(button("Disarm"));
      fireEvent.click(button("Confirm"));
      await flush();
      expect(sendFasRab).toHaveBeenCalledWith({ action: "disarm", rab_id: 0 }, "c1");
    });

    it("stays on the confirmation and shows the error when the command is rejected", async () => {
      session("operator");
      vi.mocked(sendFasRab).mockRejectedValue(new Error("RAB offline"));
      card();
      fireEvent.click(button("Arm"));
      fireEvent.click(button("Confirm"));
      await flush();
      expect(screen.getByText("Arm RAB A?")).toBeInTheDocument();
    });

    it("cannot address a board that is not A or B", () => {
      session("operator");
      card({ rabId: 5 }, "RAB:5");
      expect(screen.getByText("RAB 5")).toBeInTheDocument();
      expect(button("Arm")).toBeDisabled();
      expect(button("Disarm")).toBeDisabled();
    });

    // Known gap: the lockout is checked when ARM is first clicked but not again
    // at Confirm, so engaging the lockout while the prompt is up still arms.
    it.fails("does not send ARM if the lockout engages while the confirmation is open", async () => {
      session("operator", "unlocked");
      card();
      fireEvent.click(button("Arm"));
      act(() => useNovaStore.getState().ingestLockout("locked"));
      fireEvent.click(button("Confirm"));
      await flush();
      expect(sendFasRab).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------

describe("FmcAuxCard", () => {
  const fmc = (radio: FmcStatus["radio"], temp?: FmcStatus["temp"]): FmcStatus => ({ radio, temp });
  const aux = (over: Partial<FmcAuxStatus> = {}): FmcAuxStatus => ({ runcamPowered: false, ppsPresent: false, ...over });

  describe("display", () => {
    it("shows dashes, never zeros, with no telemetry", () => {
      renderWithProviders(<FmcAuxCard fmc={undefined} />);
      expect(screen.getAllByText("—").length).toBeGreaterThan(8);
      expect(screen.queryByText("0.0 °C")).not.toBeInTheDocument();
    });

    it("shows board temperatures", () => {
      renderWithProviders(<FmcAuxCard fmc={fmc(undefined, { h7: 55.5, pwr: 40 })} />);
      expect(screen.getByText("55.5 °C")).toBeInTheDocument();
      expect(screen.getByText("40.0 °C")).toBeInTheDocument();
    });

    it("shows a radio fault and its code", () => {
      renderWithProviders(<FmcAuxCard fmc={fmc({ fault: true, lastFault: 12 })} />);
      expect(screen.getByText("radio fault · code 12")).toBeInTheDocument();
      expect(screen.getByText("FAULT")).toBeInTheDocument();
    });

    it.each([
      [{ powered: true }, "on"],
      [{ powered: false, powerRequested: true }, "requested, not on"],
      [{ powered: false, powerRequested: false }, "off"],
    ])("radio power %j reads '%s'", (radio, text) => {
      renderWithProviders(<FmcAuxCard fmc={fmc(radio)} />);
      expect(screen.getAllByText(text).length).toBeGreaterThan(0);
    });

    it.each([
      [{ configValid: false }, "invalid"],
      [{ configValid: true, readbackMatches: false }, "valid / MISMATCH"],
      [{ configValid: true, readbackMatches: true }, "valid / matches"],
      [{ configValid: true }, "valid"],
    ])("radio config %j reads '%s'", (radio, text) => {
      renderWithProviders(<FmcAuxCard fmc={fmc(radio)} />);
      expect(screen.getByText(text)).toBeInTheDocument();
    });

    it("counts accepted and dropped transmissions", () => {
      renderWithProviders(<FmcAuxCard fmc={fmc({ txAccepted: 120, txDropped: 3, queueDepth: 2 })} />);
      expect(screen.getByText("120 ok / 3 drop")).toBeInTheDocument();
    });

    it.each([
      [{ rfPaOn: true, rfPaCycling: true }, "on (cycling)"],
      [{ rfPaOn: true }, "on"],
      [{ rfPaOn: false, rfPaInhibited: true }, "inhibited"],
      [{ rfPaOn: false, rfPaRequested: true }, "requested, not on"],
      [{ rfPaOn: false }, "off"],
    ])("RF amplifier %j reads '%s'", (over, text) => {
      renderWithProviders(<FmcAuxCard fmc={fmc(undefined)} aux={aux(over)} />);
      expect(screen.getAllByText(text).length).toBeGreaterThan(0);
    });

    it("explains an inhibited RF amplifier is not a failed command", () => {
      renderWithProviders(<FmcAuxCard fmc={fmc(undefined)} aux={aux({ rfPaInhibited: true, rfPaOn: false })} />);
      expect(screen.getByText(/This is not a failed command/)).toBeInTheDocument();
    });

    it("shows PPS lock and age", () => {
      renderWithProviders(<FmcAuxCard fmc={fmc(undefined)} aux={aux({ ppsPresent: true, ppsAgeMs: 2500 })} />);
      expect(screen.getByText("lock")).toBeInTheDocument();
      expect(screen.getByText("2.5 s")).toBeInTheDocument();
    });

    it("shows the camera auto-stop countdown, and a dash for 'not applicable', not 0 s", () => {
      const view = renderWithProviders(<FmcAuxCard fmc={fmc(undefined)} aux={aux({ runcamRecordS: 90 })} />);
      expect(screen.getByText("90 s")).toBeInTheDocument();
      view.unmount();
      renderWithProviders(<FmcAuxCard fmc={fmc(undefined)} aux={aux({ runcamRecordS: null })} />);
      expect(screen.queryByText("0 s")).not.toBeInTheDocument();
    });
  });

  describe("rail power toggles", () => {
    const toggle = (label: string) => screen.getByRole("button", { name: new RegExp(`^${label}`) });

    it("shows no controls to a viewer or with no session", () => {
      session("viewer");
      renderWithProviders(<FmcAuxCard fmc={fmc({ powered: true })} aux={aux()} />);
      expect(screen.queryByRole("button", { name: /^Radio/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Rail on/ })).not.toBeInTheDocument();
    });

    it("turns a powered rail off and an unpowered one on, addressing the node and device", async () => {
      session("operator");
      renderWithProviders(<FmcAuxCard fmc={fmc({ powered: true })} aux={aux({ runcamPowered: false, rfPaOn: true })} node="FMC_1" />);
      fireEvent.click(toggle("Radio"));
      fireEvent.click(toggle("RunCam"));
      fireEvent.click(toggle("RF amp"));
      await flush();
      expect(vi.mocked(sendFasAux).mock.calls.map((c) => c[0])).toEqual([
        { node: "FMC_1", device: "radio", enable: false },
        { node: "FMC_1", device: "runcam", enable: true },
        { node: "FMC_1", device: "rf_pa", enable: false },
      ]);
    });

    it("will not toggle a rail whose state is unknown, since there is no defensible target", () => {
      session("operator");
      renderWithProviders(<FmcAuxCard fmc={fmc(undefined)} aux={undefined} />);
      expect(toggle("Radio")).toBeDisabled();
      expect(toggle("Radio").textContent).toContain("—");
    });

    it("blocks the EPB rails, but not the FMC-local radio rail, while the lockout is engaged", async () => {
      session("operator", "locked");
      renderWithProviders(<FmcAuxCard fmc={fmc({ powered: true })} aux={aux({ runcamPowered: true, rfPaOn: true })} />);
      expect(toggle("RunCam")).toBeDisabled();
      expect(toggle("RF amp")).toBeDisabled();
      expect(screen.getAllByText("Nova lockout active")).toHaveLength(2);
      expect(toggle("Radio")).toBeEnabled();
      fireEvent.click(toggle("RunCam"));
      await flush();
      expect(sendFasAux).not.toHaveBeenCalled();
    });

    it("treats an unknown lockout as engaged for the gated rails", () => {
      session("operator", "unknown");
      renderWithProviders(<FmcAuxCard fmc={fmc({ powered: true })} aux={aux({ runcamPowered: true })} />);
      expect(toggle("RunCam")).toBeDisabled();
    });

    it("shows the backend's error", async () => {
      session("operator");
      vi.mocked(sendFasAux).mockRejectedValue(new Error("EPB offline"));
      renderWithProviders(<FmcAuxCard fmc={fmc({ powered: true })} aux={aux()} />);
      fireEvent.click(toggle("Radio"));
      await flush();
      expect(screen.getByText("EPB offline")).toBeInTheDocument();
    });

    it("turns a missing endpoint into a plain 'not supported yet' message", async () => {
      session("operator");
      vi.mocked(sendFasAux).mockRejectedValue(new Error("NovaOps API error 404"));
      renderWithProviders(<FmcAuxCard fmc={fmc({ powered: true })} aux={aux()} />);
      fireEvent.click(toggle("Radio"));
      await flush();
      expect(screen.getByText("Radio: backend does not support this yet")).toBeInTheDocument();
    });
  });

  describe("RunCam recording", () => {
    const railOn = () => button("Rail on");
    const field = () => screen.getByPlaceholderText("FMC default");

    beforeEach(() => session("operator"));

    it("omits the auto-stop when the field is blank so the FMC applies its own default", async () => {
      renderWithProviders(<FmcAuxCard fmc={fmc(undefined)} aux={aux()} />);
      fireEvent.click(railOn());
      await flush();
      expect(sendFasRuncamRecord).toHaveBeenCalledWith({ node: "FMC_0", enable: true }, "c1");
    });

    it("sends an explicit 0 only when asked, since that means no timer at all", async () => {
      renderWithProviders(<FmcAuxCard fmc={fmc(undefined)} aux={aux()} />);
      fireEvent.change(field(), { target: { value: "0" } });
      fireEvent.click(railOn());
      await flush();
      expect(sendFasRuncamRecord).toHaveBeenCalledWith({ node: "FMC_0", enable: true, autostop_s: 0 }, "c1");
    });

    it("rounds and clamps the auto-stop to the firmware's 12 h limit, and shows what was sent", async () => {
      renderWithProviders(<FmcAuxCard fmc={fmc(undefined)} aux={aux()} />);
      fireEvent.change(field(), { target: { value: "99999" } });
      fireEvent.click(railOn());
      await flush();
      expect(sendFasRuncamRecord).toHaveBeenCalledWith(expect.objectContaining({ autostop_s: 43200 }), "c1");
      expect(field()).toHaveValue(43200);
    });

    it("clamps a negative value to zero", async () => {
      renderWithProviders(<FmcAuxCard fmc={fmc(undefined)} aux={aux()} />);
      fireEvent.change(field(), { target: { value: "-30" } });
      fireEvent.click(railOn());
      await flush();
      expect(sendFasRuncamRecord).toHaveBeenCalledWith(expect.objectContaining({ autostop_s: 0 }), "c1");
    });

    it("sends no auto-stop when turning the rail off", async () => {
      renderWithProviders(<FmcAuxCard fmc={fmc(undefined)} aux={aux()} />);
      fireEvent.change(field(), { target: { value: "600" } });
      fireEvent.click(button("Rail off"));
      await flush();
      expect(sendFasRuncamRecord).toHaveBeenCalledWith({ node: "FMC_0", enable: false }, "c1");
    });

    it("hides the controls from a viewer but still shows the rail and countdown", () => {
      session("viewer");
      renderWithProviders(<FmcAuxCard fmc={fmc(undefined)} aux={aux({ runcamPowered: true, runcamRecordS: 30 })} />);
      expect(screen.queryByRole("button", { name: "Rail on" })).not.toBeInTheDocument();
      expect(screen.getByText("30 s")).toBeInTheDocument();
    });

    it("reminds the operator that powering the rail can start a recording", () => {
      renderWithProviders(<FmcAuxCard fmc={fmc(undefined)} aux={aux()} />);
      expect(screen.getByText(/starts a recording by itself/)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------

describe("SdCard", () => {
  const sd = (over: Partial<FmcSdStatus> = {}): FmcSdStatus => ({ stateName: "logging", logging: true, ...over });

  describe("display", () => {
    it("shows a dash when there is no SD status", () => {
      renderWithProviders(<SdCard />);
      expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    });

    it("shows state, logging, capacity and free space", () => {
      renderWithProviders(<SdCard sd={sd({ pctUsed: 42, freeMb: 900, totalMb: 1600 })} />);
      expect(screen.getAllByText("logging")).toHaveLength(2); // state chip and logging badge
      expect(screen.getByText(/42% · 900 MB free \/ 1600 MB/)).toBeInTheDocument();
    });

    it("shows the log rate divisor", () => {
      const view = renderWithProviders(<SdCard sd={sd({ rateDiv: 10 })} />);
      expect(screen.getByText("÷10")).toBeInTheDocument();
      view.unmount();
      renderWithProviders(<SdCard sd={sd({ rateDiv: 1 })} />);
      expect(screen.getByText("÷1 (full)")).toBeInTheDocument();
    });

    it("shows a custom divisor as such, and an unknown one as a dash", () => {
      const view = renderWithProviders(<SdCard sd={sd({ rateDiv: 0 })} />);
      expect(screen.getByText("custom")).toBeInTheDocument();
      view.unmount();
      renderWithProviders(<SdCard sd={sd({ rateDiv: null })} />);
      expect(screen.queryByText("custom")).not.toBeInTheDocument();
    });

    it("flags a stalled logger, a reduced rate (but not both), and an error code", () => {
      const view = renderWithProviders(<SdCard sd={sd({ stalled: true, rateReduced: true, err: 7 })} />);
      expect(screen.getByText("stalled")).toBeInTheDocument();
      expect(screen.queryByText("rate reduced")).not.toBeInTheDocument();
      expect(screen.getByText("7")).toBeInTheDocument();
      view.unmount();
      renderWithProviders(<SdCard sd={sd({ rateReduced: true })} />);
      expect(screen.getByText("rate reduced")).toBeInTheDocument();
    });
  });

  describe("full-card warning", () => {
    it("opens by itself when the card becomes full", async () => {
      const view = renderWithProviders(<SdCard sd={sd()} />);
      expect(screen.queryByText("SD Card Full")).not.toBeInTheDocument();
      view.rerender(<SdCard sd={sd({ full: true })} />);
      expect(await screen.findByText("SD Card Full")).toBeInTheDocument();
    });

    it("opens for a card that is already full on first sight", async () => {
      renderWithProviders(<SdCard sd={sd({ stateName: "full" })} />);
      expect(await screen.findByText("SD Card Full")).toBeInTheDocument();
    });

    it("can be dismissed and does not pop up again until the card has been non-full", async () => {
      const view = renderWithProviders(<SdCard sd={sd({ full: true })} />);
      fireEvent.click(await screen.findByRole("button", { name: "Leave Full" }));
      await waitFor(() => expect(screen.queryByText("SD Card Full")).not.toBeInTheDocument());
      view.rerender(<SdCard sd={sd({ full: true, pctUsed: 100 })} />);
      expect(screen.queryByText("SD Card Full")).not.toBeInTheDocument();
    });
  });

  describe("operator controls", () => {
    it.each(["viewer", "pad", null] as const)("offers no controls to role %s", (role) => {
      session(role);
      renderWithProviders(<SdCard sd={sd()} />);
      expect(screen.queryByRole("button", { name: "Apply" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Clear Card" })).not.toBeInTheDocument();
    });

    it.each(["operator", "admin"] as const)("offers controls to %s", (role) => {
      session(role);
      renderWithProviders(<SdCard sd={sd()} />);
      expect(button("Apply")).toBeEnabled();
      expect(button("Clear Card")).toBeEnabled();
    });

    it("sets the chosen log rate on the node", async () => {
      session("operator");
      renderWithProviders(<SdCard sd={sd()} node="FMC_1" />);
      fireEvent.change(screen.getByDisplayValue("Full rate"), { target: { value: "10" } });
      fireEvent.click(button("Apply"));
      await flush();
      expect(sendFasSd).toHaveBeenCalledWith({ node: "FMC_1", action: "set_rate", divisor: 10 }, "c1");
      expect(screen.getByText("Rate set to ÷10")).toBeInTheDocument();
    });

    it("shows the backend's error", async () => {
      session("operator");
      vi.mocked(sendFasSd).mockRejectedValue(new Error("FMC busy"));
      renderWithProviders(<SdCard sd={sd()} />);
      fireEvent.click(button("Apply"));
      await flush();
      expect(screen.getByText("FMC busy")).toBeInTheDocument();
    });

    it("erases only after an explicit second step", async () => {
      session("operator");
      renderWithProviders(<SdCard sd={sd()} />);
      fireEvent.click(button("Clear Card"));
      expect(screen.getByText("Erase all data?")).toBeInTheDocument();
      expect(sendFasSd).not.toHaveBeenCalled();
      fireEvent.click(button("Yes, Erase"));
      await flush();
      expect(sendFasSd).toHaveBeenCalledWith({ node: "FMC_0", action: "clear" }, "c1");
      expect(screen.getByText("SD card cleared")).toBeInTheDocument();
    });

    it("can back out of erasing", () => {
      session("operator");
      renderWithProviders(<SdCard sd={sd()} />);
      fireEvent.click(button("Clear Card"));
      fireEvent.click(button("Cancel"));
      expect(button("Clear Card")).toBeInTheDocument();
      expect(sendFasSd).not.toHaveBeenCalled();
    });

    it("keeps the confirmation open when the erase fails", async () => {
      session("operator");
      vi.mocked(sendFasSd).mockRejectedValue(new Error("write protected"));
      renderWithProviders(<SdCard sd={sd()} />);
      fireEvent.click(button("Clear Card"));
      fireEvent.click(button("Yes, Erase"));
      await flush();
      expect(screen.getByText("write protected")).toBeInTheDocument();
      expect(screen.getByText("Erase all data?")).toBeInTheDocument();
    });

    // Known gap: the full-card dialog is shown to everyone, including a viewer,
    // and its "Clear Card" button (a reformat) is not role-gated or two-step.
    it.fails("does not offer the destructive Clear Card button to a viewer", async () => {
      session("viewer");
      renderWithProviders(<SdCard sd={sd({ full: true })} />);
      await screen.findByText("SD Card Full");
      expect(within(screen.getByRole("dialog")).queryByRole("button", { name: "Clear Card" })).not.toBeInTheDocument();
    });
  });
});

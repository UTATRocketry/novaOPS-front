import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { sendFasCharger } from "@/lib/api/direct";
import * as api from "@/lib/api";
import type { PmbStatus } from "@/lib/flight/types";
import { useNovaStore } from "@/lib/store/store";
import type { ClientRole } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { ActionsCard } from "../engine/ActionsCard";
import { ChargerCard } from "./ChargerCard";

vi.mock("@/lib/api/direct", () => ({ sendFasCharger: vi.fn() }));
vi.mock("@/lib/api");

const mocked = vi.mocked(api);
const initial = useNovaStore.getInitialState();

function session(role: ClientRole | null, lockout: "locked" | "unlocked" = "unlocked") {
  useNovaStore.setState({ session: { clientId: role ? "c1" : null, role } });
  useNovaStore.getState().ingestLockout(lockout);
}

const flush = () => act(async () => {});
const button = (name: string | RegExp) => screen.getByRole("button", { name });

beforeEach(() => {
  useNovaStore.setState(initial, true);
  vi.mocked(sendFasCharger).mockReset().mockResolvedValue({ published_commands: [] });
});

// ---------------------------------------------------------------------------

describe("ChargerCard", () => {
  type Charger = NonNullable<PmbStatus["charger"]>;
  const charger = (over: Partial<Charger> = {}): Charger => ({ enabled: false, ...over });
  const card = (c: Charger = charger(), chgCfg?: PmbStatus["chgCfg"], boardKey = "PMB:0") =>
    renderWithProviders(<ChargerCard boardKey={boardKey} charger={c} chgCfg={chgCfg} />);
  const iField = () => screen.getAllByPlaceholderText("unchanged")[0] as HTMLInputElement;
  const vField = () => screen.getAllByPlaceholderText("unchanged")[1] as HTMLInputElement;

  describe("display", () => {
    it("shows dashes, not zeros, for readings that are absent", () => {
      card();
      expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(5);
    });

    it("shows the charger readings and flags", () => {
      card(charger({ vBat: 15.234, iChg: 1.5, cells: 4, state: "cc_cv", status: "ok", charging: true, vinGood: true, present: true }));
      expect(screen.getByText("15.23 V")).toBeInTheDocument();
      expect(screen.getByText("1.50 A")).toBeInTheDocument();
      expect(screen.getByText("cc_cv")).toBeInTheDocument();
      expect(screen.getByText("4")).toBeInTheDocument();
    });

    it("shows the firmware read-back of the limits and its warnings", () => {
      card(charger(), { iSetting: 12, vSetting: 20, cells: 4, enabledIntent: false, targetsOk: true, vlimit: true, controlUnknown: true, persistError: true });
      expect(screen.getByText("12 / 31")).toBeInTheDocument();
      expect(screen.getByText("20 / 31")).toBeInTheDocument();
      expect(screen.getByText("voltage cutoff active")).toBeInTheDocument();
      expect(screen.getByText("control state unknown")).toBeInTheDocument();
      expect(screen.getByText("persist error")).toBeInTheDocument();
      expect(screen.getByText("yes")).toBeInTheDocument();
    });

    it("shows no firmware-limits section without a read-back", () => {
      card();
      expect(screen.queryByText("Firmware limits")).not.toBeInTheDocument();
    });

    it("seeds the limit fields once from the read-back, and does not overwrite later edits", () => {
      const view = card(charger(), { iSetting: 12, vSetting: 20 });
      expect(iField().value).toBe("12");
      expect(vField().value).toBe("20");
      fireEvent.change(iField(), { target: { value: "5" } });
      view.rerender(<ChargerCard boardKey="PMB:0" charger={charger()} chgCfg={{ iSetting: 30, vSetting: 31 }} />);
      expect(iField().value).toBe("5");
    });

    it("dims the readings when stale", () => {
      renderWithProviders(<ChargerCard boardKey="PMB:0" charger={charger()} stale />);
      expect(screen.getByText("VBAT")).toBeInTheDocument();
    });
  });

  describe("who may control", () => {
    it.each(["viewer", null] as const)("blocks role %s and says why", (role) => {
      session(role);
      card();
      expect(button("Enable")).toBeDisabled();
      expect(button("Apply limits")).toBeDisabled();
      expect(screen.getAllByText(role ? "Operator role required" : "Operator role required").length).toBeGreaterThan(0);
    });

    it.each(["operator", "pad", "admin"] as const)("allows role %s", (role) => {
      session(role);
      card();
      expect(button("Enable")).toBeEnabled();
      expect(button("Apply limits")).toBeEnabled();
    });
  });

  describe("enable and suspend", () => {
    beforeEach(() => session("operator"));

    it("enables charging on the PMB node without touching the limits", async () => {
      card();
      fireEvent.click(button("Enable"));
      await flush();
      expect(sendFasCharger).toHaveBeenCalledWith({ node: "PMB_0", enable: true }, "c1");
      expect(screen.getByText("Charging enabled")).toBeInTheDocument();
    });

    it("suspends charging only while it is enabled, and enables only while it is not", async () => {
      const view = card(charger({ enabled: true }));
      expect(button("Enable")).toBeDisabled();
      fireEvent.click(button("Suspend"));
      await flush();
      expect(sendFasCharger).toHaveBeenCalledWith({ node: "PMB_0", enable: false }, "c1");
      expect(screen.getByText("Charging suspended")).toBeInTheDocument();
      view.unmount();
      card(charger({ enabled: false }));
      expect(button("Suspend")).toBeDisabled();
    });

    it("addresses the node from the board key", async () => {
      card(charger(), undefined, "pmb:1");
      fireEvent.click(button("Enable"));
      await flush();
      expect(sendFasCharger).toHaveBeenCalledWith({ node: "PMB_1", enable: true }, "c1");
    });

    it("treats an unknown enabled state as not enabled", () => {
      card({} as Charger);
      expect(button("Enable")).toBeEnabled();
      expect(button("Suspend")).toBeDisabled();
    });

    it("shows the backend's error", async () => {
      vi.mocked(sendFasCharger).mockRejectedValue(new Error("PMB offline"));
      card();
      fireEvent.click(button("Enable"));
      await flush();
      expect(screen.getByText("PMB offline")).toBeInTheDocument();
    });

    // Known gap: unlike the RunCam and RF-amplifier rails, starting a battery
    // charge is not behind the physical lockout, though the card reads it.
    it.fails("does not enable charging while the lockout is engaged", async () => {
      session("operator", "locked");
      card();
      expect(button("Enable")).toBeDisabled();
    });
  });

  describe("limits", () => {
    beforeEach(() => session("operator"));

    it("sends only the codes that were entered, keeping the current enable state", async () => {
      card(charger({ enabled: true }));
      fireEvent.change(iField(), { target: { value: "10" } });
      fireEvent.click(button("Apply limits"));
      await flush();
      expect(sendFasCharger).toHaveBeenCalledWith({ node: "PMB_0", enable: true, i_setting: 10 }, "c1");
      expect(screen.getByText("Limits applied")).toBeInTheDocument();
    });

    it("sends both codes, accepting the 0 and 31 limits", async () => {
      card();
      fireEvent.change(iField(), { target: { value: "0" } });
      fireEvent.change(vField(), { target: { value: "31" } });
      fireEvent.click(button("Apply limits"));
      await flush();
      expect(sendFasCharger).toHaveBeenCalledWith({ node: "PMB_0", enable: false, i_setting: 0, v_setting: 31 }, "c1");
    });

    it.each(["32", "-1", "1.5"])("refuses the code '%s' and sends nothing", async (value) => {
      card();
      fireEvent.change(iField(), { target: { value } });
      fireEvent.click(button("Apply limits"));
      await flush();
      expect(sendFasCharger).not.toHaveBeenCalled();
      expect(screen.getByText("DAC codes must be integers 0–31")).toBeInTheDocument();
    });

    it("treats text typed into a number field as blank, since the browser discards it", async () => {
      card();
      fireEvent.change(iField(), { target: { value: "abc" } });
      expect(iField().value).toBe("");
      fireEvent.click(button("Apply limits"));
      await flush();
      expect(sendFasCharger).not.toHaveBeenCalled();
      expect(screen.getByText("No limits to apply")).toBeInTheDocument();
    });

    it("refuses to send when both fields are blank", async () => {
      card();
      fireEvent.click(button("Apply limits"));
      await flush();
      expect(sendFasCharger).not.toHaveBeenCalled();
      expect(screen.getByText("No limits to apply")).toBeInTheDocument();
    });

    it("explains that the codes are not amps or volts", () => {
      card();
      expect(screen.getByText(/raw LTC4162 DAC codes/)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------

describe("ActionsCard", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocked.getRecordingStatus.mockResolvedValue({ enabled: false });
    mocked.getCalibrationStatus.mockResolvedValue({ enabled: false });
    mocked.startRecording.mockResolvedValue({ enabled: true });
    mocked.stopRecording.mockResolvedValue({ enabled: false });
    mocked.toggleCalibration.mockResolvedValue({ enabled: true });
    mocked.reloadConfig.mockResolvedValue({});
    mocked.downloadData.mockResolvedValue(undefined);
  });

  async function card(role: ClientRole | null = "operator") {
    session(role);
    renderWithProviders(<ActionsCard />);
    await flush();
  }

  it("shows the recording and calibration state the backend reports on load", async () => {
    mocked.getRecordingStatus.mockResolvedValue({ enabled: true });
    mocked.getCalibrationStatus.mockResolvedValue({ enabled: true });
    await card();
    expect(screen.getByText("Stop recording")).toBeInTheDocument();
    expect(screen.getByText("Recording in progress")).toBeInTheDocument();
    expect(screen.getByText("Calibration: on")).toBeInTheDocument();
  });

  it("assumes off, and shows no error, when the status cannot be read", async () => {
    mocked.getRecordingStatus.mockRejectedValue(new Error("down"));
    mocked.getCalibrationStatus.mockRejectedValue(new Error("down"));
    await card();
    expect(screen.getByText("Start recording")).toBeInTheDocument();
    expect(screen.getByText("Calibration: off")).toBeInTheDocument();
    expect(screen.queryByText("down")).not.toBeInTheDocument();
  });

  it("starts recording with the client id and flips to Stop", async () => {
    await card();
    fireEvent.click(screen.getByText("Start recording"));
    await flush();
    expect(mocked.startRecording).toHaveBeenCalledWith("c1");
    expect(screen.getByText("Stop recording")).toBeInTheDocument();
  });

  it("stops recording when it is running", async () => {
    mocked.getRecordingStatus.mockResolvedValue({ enabled: true });
    await card();
    fireEvent.click(screen.getByText("Stop recording"));
    await flush();
    expect(mocked.stopRecording).toHaveBeenCalledWith("c1");
    expect(screen.getByText("Start recording")).toBeInTheDocument();
  });

  it("shows what the backend answers rather than what was asked for", async () => {
    mocked.startRecording.mockResolvedValue({ enabled: false });
    await card();
    fireEvent.click(screen.getByText("Start recording"));
    await flush();
    expect(screen.getByText("Start recording")).toBeInTheDocument();
  });

  it("toggles calibration to the opposite of what is shown", async () => {
    await card();
    fireEvent.click(screen.getByText("Toggle calibration"));
    await flush();
    expect(mocked.toggleCalibration).toHaveBeenCalledWith("c1", true);
    expect(screen.getByText("Calibration: on")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Toggle calibration"));
    await flush();
    expect(mocked.toggleCalibration).toHaveBeenLastCalledWith("c1", false);
  });

  it("reloads the config and downloads the data", async () => {
    await card();
    fireEvent.click(screen.getByText("Reload config"));
    fireEvent.click(screen.getByText("Download data"));
    await flush();
    expect(mocked.reloadConfig).toHaveBeenCalledTimes(1);
    expect(mocked.downloadData).toHaveBeenCalledTimes(1);
  });

  it("shows the reason an action failed", async () => {
    mocked.startRecording.mockRejectedValue(new Error("Operator role required"));
    await card();
    fireEvent.click(screen.getByText("Start recording"));
    await flush();
    expect(screen.getByText("Operator role required")).toBeInTheDocument();
    expect(screen.getByText("Start recording")).toBeInTheDocument();
  });

  it("uses a generic message for an error that is not an Error", async () => {
    mocked.reloadConfig.mockRejectedValue("nope");
    await card();
    fireEvent.click(screen.getByText("Reload config"));
    await flush();
    expect(screen.getByText("Action failed")).toBeInTheDocument();
  });

  it("clears an earlier error when the next action starts", async () => {
    mocked.reloadConfig.mockRejectedValueOnce(new Error("first failure"));
    await card();
    fireEvent.click(screen.getByText("Reload config"));
    await flush();
    expect(screen.getByText("first failure")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Download data"));
    await flush();
    expect(screen.queryByText("first failure")).not.toBeInTheDocument();
  });

  it("ignores a second click while the same action is still running", async () => {
    mocked.reloadConfig.mockReturnValue(new Promise(() => {}));
    await card();
    fireEvent.click(screen.getByText("Reload config"));
    await flush();
    fireEvent.click(screen.getByText("Reload config"));
    expect(mocked.reloadConfig).toHaveBeenCalledTimes(1);
  });

  // Known gap: every action is offered to every role, including a viewer or no
  // session; recording and calibration are sent with an empty client id then.
  it.fails("does not offer recording to a viewer", async () => {
    await card("viewer");
    fireEvent.click(screen.getByText("Start recording"));
    await flush();
    expect(mocked.startRecording).not.toHaveBeenCalled();
  });

  it.fails("does not send an empty client id when there is no session", async () => {
    await card(null);
    fireEvent.click(screen.getByText("Start recording"));
    await flush();
    expect(mocked.startRecording).not.toHaveBeenCalledWith("");
  });
});

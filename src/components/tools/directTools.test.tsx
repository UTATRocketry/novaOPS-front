import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendDirectRelay, sendDirectServo } from "@/lib/api/direct";
import { useNovaStore } from "@/lib/store";
import type { ActuatorEntry } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { RelayTester } from "./RelayTester";
import { ServoTester } from "./ServoTester";

vi.mock("@/lib/api/direct", () => ({ sendDirectRelay: vi.fn(), sendDirectServo: vi.fn() }));

let actuators: ActuatorEntry[] = [];
vi.mock("@/hooks/useConfig", () => ({ useActuators: () => ({ data: actuators }) }));

const initial = useNovaStore.getInitialState();

function connect(role: "viewer" | "operator" | null = "operator") {
  useNovaStore.setState({ session: { clientId: role ? "c1" : null, role } });
}

const live = () => fireEvent.click(screen.getByRole("checkbox"));
const button = (name: string | RegExp) => screen.getByRole("button", { name });
const tick = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });
const flush = () => act(async () => {});

beforeEach(() => {
  vi.useFakeTimers();
  useNovaStore.setState(initial, true);
  actuators = [];
  vi.mocked(sendDirectRelay).mockReset().mockResolvedValue({ ok: true });
  vi.mocked(sendDirectServo).mockReset().mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------

describe("RelayTester", () => {
  async function press(name: string | RegExp) {
    fireEvent.click(button(name));
    await flush();
  }

  describe("simulated mode (the default)", () => {
    it("starts simulated and off", () => {
      renderWithProviders(<RelayTester />);
      expect(screen.getByText("SIMULATED")).toBeInTheDocument();
      expect(screen.getAllByText("OFF").length).toBeGreaterThan(0);
    });

    it("changes the lamp and reports the state without sending anything", async () => {
      connect();
      renderWithProviders(<RelayTester />);
      await press("ON");
      expect(screen.getByText("[sim] state=1")).toBeInTheDocument();
      expect(sendDirectRelay).not.toHaveBeenCalled();
      await press("Toggle");
      expect(screen.getByText("[sim] state=0")).toBeInTheDocument();
      expect(sendDirectRelay).not.toHaveBeenCalled();
    });
  });

  describe("live mode", () => {
    it("is labelled LIVE once simulation is switched off", () => {
      renderWithProviders(<RelayTester />);
      live();
      expect(screen.getByText("LIVE")).toBeInTheDocument();
    });

    it("sends the relay state to the chosen target, node and channel with the client id", async () => {
      connect();
      renderWithProviders(<RelayTester />);
      live();
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "FAS" } });
      fireEvent.change(screen.getByPlaceholderText("e.g. EPB:0"), { target: { value: "EPB_0" } });
      fireEvent.change(screen.getAllByRole("spinbutton").at(-1)!, { target: { value: "7" } });
      await press("ON");
      expect(sendDirectRelay).toHaveBeenCalledWith({ target: "FAS", node: "EPB_0", channel: 7, state: 1 }, "c1");
      expect(screen.getByText("OK state=1")).toBeInTheDocument();
    });

    it("omits the node when it is blank", async () => {
      connect();
      renderWithProviders(<RelayTester />);
      live();
      await press("ON");
      expect(sendDirectRelay).toHaveBeenCalledWith({ target: "GCS", node: undefined, channel: 0, state: 1 }, "c1");
    });

    it("toggles between on and off", async () => {
      connect();
      renderWithProviders(<RelayTester />);
      live();
      await press("Toggle");
      await press("Toggle");
      expect(vi.mocked(sendDirectRelay).mock.calls.map((c) => c[0].state)).toEqual([1, 0]);
    });

    it("shows the backend's error", async () => {
      connect();
      vi.mocked(sendDirectRelay).mockRejectedValue(new Error("Operator role required"));
      renderWithProviders(<RelayTester />);
      live();
      await press("ON");
      expect(screen.getByText("Error: Operator role required")).toBeInTheDocument();
    });

    it("sends nothing and says so when there is no session", async () => {
      connect(null);
      renderWithProviders(<RelayTester />);
      live();
      await press("ON");
      expect(sendDirectRelay).not.toHaveBeenCalled();
      expect(screen.getByText("Not connected — no client ID.")).toBeInTheDocument();
      expect(screen.getByText("Not connected — no client session.")).toBeInTheDocument();
    });

    // Known gap: the tester never consults the role, so a viewer is offered live
    // controls that the backend will reject.
    it.fails("does not offer live controls to a viewer", async () => {
      connect("viewer");
      renderWithProviders(<RelayTester />);
      live();
      expect(button("ON")).toBeDisabled();
    });
  });

  describe("the bound actuator hint", () => {
    it("names the actuator on the channel for the selected target", () => {
      actuators = [
        { name: "SVFTV", type: "solenoid", binding: { target: "GCS", relay_channel: 0 } },
        { name: "OTHER", type: "solenoid", binding: { target: "FAS", node: "EPB_0", relay_channel: 0 } },
      ];
      renderWithProviders(<RelayTester />);
      expect(screen.getByText("SVFTV")).toBeInTheDocument();
      expect(screen.queryByText("OTHER")).not.toBeInTheDocument();
    });

    it("says no actuator is bound when none matches", () => {
      renderWithProviders(<RelayTester />);
      expect(screen.getByText("No actuator bound to this channel.")).toBeInTheDocument();
    });

    it("follows the node when one is given", () => {
      actuators = [{ name: "N1", type: "solenoid", binding: { target: "GCS", node: "A", relay_channel: 0 } }];
      renderWithProviders(<RelayTester />);
      live();
      fireEvent.change(screen.getByPlaceholderText("e.g. EPB:0"), { target: { value: "B" } });
      expect(screen.queryByText("N1")).not.toBeInTheDocument();
      fireEvent.change(screen.getByPlaceholderText("e.g. EPB:0"), { target: { value: "A" } });
      expect(screen.getByText("N1")).toBeInTheDocument();
    });
  });

  describe("pulse", () => {
    it("turns the relay on, then off after the pulse duration", async () => {
      connect();
      renderWithProviders(<RelayTester />);
      live();
      await press(/Pulse/);
      expect(vi.mocked(sendDirectRelay).mock.calls.map((c) => c[0].state)).toEqual([1]);
      tick(499);
      expect(sendDirectRelay).toHaveBeenCalledTimes(1);
      tick(1);
      await flush();
      expect(vi.mocked(sendDirectRelay).mock.calls.map((c) => c[0].state)).toEqual([1, 0]);
    });

    it("clamps the duration to its limits", () => {
      renderWithProviders(<RelayTester />);
      const [duration] = screen.getAllByRole("spinbutton") as HTMLInputElement[];
      fireEvent.change(duration, { target: { value: "5" } });
      expect(duration.value).toBe("10");
      fireEvent.change(duration, { target: { value: "999999" } });
      expect(duration.value).toBe("60000");
    });

    it("is cancelled by a manual change, so the later 'off' never fires", async () => {
      connect();
      renderWithProviders(<RelayTester />);
      live();
      await press(/Pulse/);
      await press("ON");
      tick(5000);
      await flush();
      expect(vi.mocked(sendDirectRelay).mock.calls.map((c) => c[0].state)).toEqual([1, 1]);
    });

    // Known gap: leaving the page mid-pulse clears the timer, so the "off" is
    // never sent and a live relay stays energised.
    it.fails("switches the relay off if the page is left mid-pulse", async () => {
      connect();
      const view = renderWithProviders(<RelayTester />);
      live();
      await press(/Pulse/);
      view.unmount();
      tick(5000);
      await flush();
      expect(vi.mocked(sendDirectRelay).mock.calls.at(-1)![0].state).toBe(0);
    });
  });

  describe("blink", () => {
    it("alternates on and off at the interval, and stops with an off", async () => {
      connect();
      renderWithProviders(<RelayTester />);
      live();
      await press("Blink");
      expect(button("Stop")).toBeInTheDocument();
      tick(500);
      await flush();
      tick(500);
      await flush();
      expect(vi.mocked(sendDirectRelay).mock.calls.map((c) => c[0].state)).toEqual([1, 0]);
      await press("Stop");
      expect(vi.mocked(sendDirectRelay).mock.calls.at(-1)![0].state).toBe(0);
      const sent = vi.mocked(sendDirectRelay).mock.calls.length;
      tick(5000);
      expect(sendDirectRelay).toHaveBeenCalledTimes(sent);
    });

    it("is stopped by a manual change", async () => {
      connect();
      renderWithProviders(<RelayTester />);
      live();
      await press("Blink");
      await press("OFF");
      expect(button("Blink")).toBeInTheDocument();
      const sent = vi.mocked(sendDirectRelay).mock.calls.length;
      tick(5000);
      expect(sendDirectRelay).toHaveBeenCalledTimes(sent);
    });

    it("clamps the interval to 50 ms to 10 s", () => {
      renderWithProviders(<RelayTester />);
      const blink = screen.getAllByRole("spinbutton")[1] as HTMLInputElement;
      fireEvent.change(blink, { target: { value: "1" } });
      expect(blink.value).toBe("50");
      fireEvent.change(blink, { target: { value: "99999" } });
      expect(blink.value).toBe("10000");
    });
  });
});

// ---------------------------------------------------------------------------

describe("ServoTester", () => {
  const slider = () => screen.getAllByRole("slider")[0] as HTMLInputElement;
  const exact = () => screen.getByPlaceholderText(/^\d+$/) as HTMLInputElement;
  const resultLine = (text: string) => screen.getByText(text);

  describe("simulated mode (the default)", () => {
    it("starts simulated at 1500 µs", () => {
      renderWithProviders(<ServoTester />);
      expect(screen.getByText("SIMULATED")).toBeInTheDocument();
      expect(screen.getByLabelText("Servo position: 90° / 1500µs")).toBeInTheDocument();
    });

    it("moves the dial and reports the pulse without sending anything", () => {
      connect();
      renderWithProviders(<ServoTester />);
      fireEvent.change(slider(), { target: { value: "1000" } });
      expect(screen.getByLabelText("Servo position: 45° / 1000µs")).toBeInTheDocument();
      expect(resultLine("[sim] pulse_us=1000")).toBeInTheDocument();
      expect(sendDirectServo).not.toHaveBeenCalled();
    });
  });

  describe("live mode", () => {
    it("sends the pulse to the chosen target, node and channel", async () => {
      connect();
      renderWithProviders(<ServoTester />);
      live();
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "FAS" } });
      fireEvent.change(screen.getByPlaceholderText("e.g. EPB_0"), { target: { value: "EPB_1" } });
      fireEvent.change(slider(), { target: { value: "2000" } });
      await flush();
      expect(sendDirectServo).toHaveBeenCalledWith({ target: "FAS", node: "EPB_1", channel: 0, pulse_us: 2000 }, "c1");
      expect(resultLine("OK pulse_us=2000")).toBeInTheDocument();
    });

    it("sends a preset as its pulse width", async () => {
      connect();
      renderWithProviders(<ServoTester />);
      live();
      fireEvent.click(button("180°"));
      await flush();
      expect(sendDirectServo).toHaveBeenCalledWith(expect.objectContaining({ pulse_us: 2500 }), "c1");
    });

    it("shows the backend's error", async () => {
      connect();
      vi.mocked(sendDirectServo).mockRejectedValue(new Error("pulse_us out of range"));
      renderWithProviders(<ServoTester />);
      live();
      fireEvent.click(button("0°"));
      await flush();
      expect(resultLine("Error: pulse_us out of range")).toBeInTheDocument();
    });

    it("sends nothing and says so with no session", async () => {
      connect(null);
      renderWithProviders(<ServoTester />);
      live();
      fireEvent.click(button("90°"));
      await flush();
      expect(sendDirectServo).not.toHaveBeenCalled();
      expect(resultLine("Not connected — no client ID.")).toBeInTheDocument();
    });

    it.fails("does not offer live controls to a viewer", () => {
      connect("viewer");
      renderWithProviders(<ServoTester />);
      live();
      expect(button("90°")).toBeDisabled();
    });
  });

  describe("exact entry", () => {
    it("applies a typed value with Go or Enter and clears the box", () => {
      renderWithProviders(<ServoTester />);
      fireEvent.change(exact(), { target: { value: "1234" } });
      fireEvent.click(button("Go"));
      expect(screen.getByLabelText(/1234µs/)).toBeInTheDocument();
      expect(exact().value).toBe("");
      fireEvent.change(exact(), { target: { value: "1800" } });
      fireEvent.keyDown(exact(), { key: "Enter" });
      expect(screen.getByLabelText(/1800µs/)).toBeInTheDocument();
    });

    it("rounds a fractional value and clamps to the range", () => {
      renderWithProviders(<ServoTester />);
      fireEvent.change(exact(), { target: { value: "1500.6" } });
      fireEvent.click(button("Go"));
      expect(screen.getByLabelText(/1501µs/)).toBeInTheDocument();
      fireEvent.change(exact(), { target: { value: "9999" } });
      fireEvent.click(button("Go"));
      expect(screen.getByLabelText(/2500µs/)).toBeInTheDocument();
      fireEvent.change(exact(), { target: { value: "-5" } });
      fireEvent.click(button("Go"));
      expect(screen.getByLabelText(/500µs/)).toBeInTheDocument();
    });

    it("ignores an empty entry", () => {
      renderWithProviders(<ServoTester />);
      fireEvent.click(button("Go"));
      expect(screen.getByLabelText(/1500µs/)).toBeInTheDocument();
      expect(screen.queryByText(/pulse_us=/)).not.toBeInTheDocument();
    });
  });

  describe("range limits", () => {
    const [minLimit, maxLimit] = [() => screen.getAllByRole("spinbutton")[1], () => screen.getAllByRole("spinbutton")[2]];

    it("restricts typed values to the narrowed range", () => {
      renderWithProviders(<ServoTester />);
      fireEvent.change(minLimit(), { target: { value: "1000" } });
      fireEvent.change(maxLimit(), { target: { value: "2000" } });
      fireEvent.change(exact(), { target: { value: "2400" } });
      fireEvent.click(button("Go"));
      expect(screen.getByLabelText(/2000µs/)).toBeInTheDocument();
      expect(slider()).toHaveAttribute("min", "1000");
      expect(slider()).toHaveAttribute("max", "2000");
    });

    it("never lets the limits cross or leave the hardware range", () => {
      renderWithProviders(<ServoTester />);
      fireEvent.change(minLimit(), { target: { value: "99999" } });
      expect((minLimit() as HTMLInputElement).value).toBe("2499");
      fireEvent.change(minLimit(), { target: { value: "0" } });
      expect((minLimit() as HTMLInputElement).value).toBe("500");
      fireEvent.change(maxLimit(), { target: { value: "100" } });
      expect((maxLimit() as HTMLInputElement).value).toBe("501");
    });
  });

  describe("A / B positions and sweep", () => {
    it("stores the current pulse as A or B and goes to it", () => {
      renderWithProviders(<ServoTester />);
      fireEvent.change(slider(), { target: { value: "1200" } });
      fireEvent.click(button("Set A"));
      fireEvent.change(slider(), { target: { value: "1800" } });
      fireEvent.click(button("Set B"));
      fireEvent.click(button("Go A"));
      expect(screen.getByLabelText(/1200µs/)).toBeInTheDocument();
      fireEvent.click(button("Go B"));
      expect(screen.getByLabelText(/1800µs/)).toBeInTheDocument();
    });

    it("sweeps between A and B at the set speed, turning at each end", () => {
      renderWithProviders(<ServoTester />);
      fireEvent.change(slider(), { target: { value: "1000" } });
      fireEvent.click(button("Set A"));
      fireEvent.change(slider(), { target: { value: "1100" } });
      fireEvent.click(button("Set B"));
      fireEvent.change(slider(), { target: { value: "1000" } });
      fireEvent.click(button("Sweep"));
      expect(button("Stop")).toBeInTheDocument();

      const seen: number[] = [];
      for (let i = 0; i < 30; i++) {
        tick(50);
        seen.push(Number(slider().value));
      }
      expect(Math.max(...seen)).toBe(1100);
      expect(Math.min(...seen)).toBe(1000);
      expect(seen.slice(0, 3)).toEqual([1010, 1020, 1030]);
      expect(seen.indexOf(1100)).toBeLessThan(seen.indexOf(1000, 11));
    });

    it("stops sweeping on Stop or when the slider is moved", () => {
      renderWithProviders(<ServoTester />);
      fireEvent.click(button("Sweep"));
      tick(100);
      fireEvent.click(button("Stop"));
      const at = slider().value;
      tick(1000);
      expect(slider().value).toBe(at);

      fireEvent.click(button("Sweep"));
      fireEvent.change(slider(), { target: { value: "700" } });
      tick(1000);
      expect(slider().value).toBe("700");
    });

    // Known gap: sweeping only animates the dial; in live mode no pulse is sent,
    // so the dial moves while the real servo does not.
    it.fails("sends pulses to the servo while sweeping in live mode", async () => {
      connect();
      renderWithProviders(<ServoTester />);
      live();
      fireEvent.click(button("Sweep"));
      tick(500);
      await flush();
      expect(sendDirectServo).toHaveBeenCalled();
    });
  });

  describe("the bound actuator hint", () => {
    it("names the actuator on the servo channel", () => {
      actuators = [{ name: "MAIN", type: "servo", binding: { target: "GCS", servo_channel: 0 } }];
      renderWithProviders(<ServoTester />);
      expect(screen.getByText("MAIN")).toBeInTheDocument();
    });
  });
});

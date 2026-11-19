import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { queryKeys } from "@/hooks/queryKeys";
import * as api from "@/lib/api";
import { useNovaStore } from "@/lib/store";
import type { ClientRole, SystemConfig } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { Commanding } from "./Commanding";
import { SerialConnection } from "./SerialConnection";
import { TransmitPacket } from "./TransmitPacket";

vi.mock("@/lib/api");

const mocked = vi.mocked(api);
const initial = useNovaStore.getInitialState();

const CONFIG: SystemConfig = {
  Actuators: [
    { name: "SVFTV", type: "solenoid", binding: { target: "GCS", relay_channel: 0 } },
    { name: "VENT", type: "solenoid", binding: { target: "GCS", relay_channel: 1 } },
    { name: "MAIN", type: "servo", binding: { target: "GCS", servo_channel: 0 }, actions: { position_aliases: ["closed", "half", "open"] } },
  ],
  Commands: {
    Abort: { binding: { target: "OPS" } },
    SetMode: { binding: { target: "OPS" }, states: ["safe", "armed"] },
  },
  safetyRules: { hazardous: [{ SVFTV: "open" }] },
};

function connect(role: ClientRole | null, lockout: "locked" | "unlocked" = "unlocked") {
  const store = useNovaStore.getState();
  if (role) store.ingestSession({ type: "session", role, client_id: "c1" });
  store.ingestLockout(lockout);
}

async function loaded(client: QueryClient) {
  await vi.waitFor(() => expect(client.getQueryData(queryKeys.config)).toBeTruthy());
  await vi.waitFor(() => expect(client.getQueryData(queryKeys.actuators)).toBeTruthy());
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

/** Console ingest is batched on a 120 ms timer, so wait one batch out. */
const consoleText = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 200));
  });
  return useNovaStore.getState().consoleMessages.map((m) => m.text);
};

beforeEach(() => {
  useNovaStore.setState(initial, true);
  useNovaStore.getState().clearConsole();
  vi.resetAllMocks();
  mocked.getConfig.mockResolvedValue(CONFIG);
  mocked.getActuators.mockResolvedValue(CONFIG.Actuators!);
  mocked.sendCommand.mockResolvedValue({ published_commands: [] });
  mocked.sendSystemCommand.mockResolvedValue({ published_commands: [] });
  mocked.sendConsoleCommand.mockResolvedValue({ published: true, action: "tx" });
  for (const fn of [mocked.fasListPorts, mocked.fasLinkStatus, mocked.fasConfigurePort, mocked.fasDisconnectPort]) {
    fn.mockResolvedValue({ published: true, action: "status" });
  }
});

afterEach(() => {
  useNovaStore.getState().clearConsole();
  vi.useRealTimers();
});

describe("Commanding", () => {
  const targetSelect = () => screen.getAllByRole("combobox")[0] as HTMLSelectElement;
  const stateSelect = () => screen.getAllByRole("combobox")[1] as HTMLSelectElement;
  const sendButton = () => screen.getByText(/Send Command|Sending/);
  const choose = (value: string) => fireEvent.change(targetSelect(), { target: { value } });

  async function setup(role: ClientRole | null = "operator", lockout: "locked" | "unlocked" = "unlocked") {
    connect(role, lockout);
    const view = renderWithProviders(<Commanding />);
    await loaded(view.client);
    return view;
  }

  it("lists configured actuators and system commands as targets", async () => {
    await setup();
    const values = Array.from(targetSelect().options).map((o) => o.value);
    expect(values).toEqual(["", "actuator:SVFTV", "actuator:VENT", "actuator:MAIN", "system:Abort", "system:SetMode"]);
  });

  it("offers nothing to send until a target is chosen", async () => {
    await setup();
    expect(screen.getByText("Select a target to fill in fields.")).toBeInTheDocument();
    expect(screen.getByText("— nothing composed —")).toBeInTheDocument();
    expect(sendButton()).toHaveAttribute("aria-disabled", "true");
    expect(stateSelect()).toBeDisabled();
  });

  it("offers an actuator's own command verbs and previews the exact request", async () => {
    await setup();
    choose("actuator:SVFTV");
    expect(Array.from(stateSelect().options).map((o) => o.value)).toEqual(["open", "closed"]);
    expect(screen.getByText('POST /api/commands {"type":"solenoid","name":"SVFTV","state":"open"}')).toBeInTheDocument();
  });

  it("offers a multi-position servo's aliases as its states", async () => {
    await setup();
    choose("actuator:MAIN");
    expect(Array.from(stateSelect().options).map((o) => o.value)).toContain("half");
  });

  it("updates the preview as the state changes, and resets it when the target changes", async () => {
    await setup();
    choose("actuator:VENT");
    fireEvent.change(stateSelect(), { target: { value: "closed" } });
    expect(screen.getByText(/"state":"closed"/)).toBeInTheDocument();
    choose("actuator:SVFTV");
    expect(screen.getByText(/"state":"open"/)).toBeInTheDocument();
  });

  it("previews a system command with a state, and without one when it takes none", async () => {
    await setup();
    choose("system:SetMode");
    expect(screen.getByText('POST /api/system-commands {"name":"SetMode","state":"safe"}')).toBeInTheDocument();
    choose("system:Abort");
    expect(screen.getByText('POST /api/system-commands {"name":"Abort"}')).toBeInTheDocument();
    expect(stateSelect()).toBeDisabled();
  });

  describe("sending", () => {
    it("sends an actuator command with the client id and logs the attempt and the result", async () => {
      await setup();
      choose("actuator:VENT");
      await act(async () => {
        fireEvent.click(sendButton());
      });
      expect(mocked.sendCommand).toHaveBeenCalledWith({ type: "solenoid", name: "VENT", state: "open" }, "c1");
      const lines = await consoleText();
      expect(lines.at(-2)).toContain("» POST /api/commands");
      expect(lines.at(-1)).toBe("✓ VENT accepted");
    });

    it("sends a system command with a null state when it takes none", async () => {
      await setup();
      choose("system:Abort");
      await act(async () => {
        fireEvent.click(sendButton());
      });
      expect(mocked.sendSystemCommand).toHaveBeenCalledWith({ name: "Abort", state: null }, "c1");
    });

    it("sends a system command with its chosen state", async () => {
      await setup();
      choose("system:SetMode");
      fireEvent.change(stateSelect(), { target: { value: "armed" } });
      await act(async () => {
        fireEvent.click(sendButton());
      });
      expect(mocked.sendSystemCommand).toHaveBeenCalledWith({ name: "SetMode", state: "armed" }, "c1");
    });

    it("logs a rejection with the backend's reason", async () => {
      mocked.sendCommand.mockRejectedValue(new Error("Physical lockout active"));
      await setup();
      choose("actuator:VENT");
      await act(async () => {
        fireEvent.click(sendButton());
      });
      expect((await consoleText()).at(-1)).toBe("✗ VENT: Physical lockout active");
    });

    it("shows 'Sending…' and ignores a second click while a request is in flight", async () => {
      mocked.sendCommand.mockReturnValue(new Promise(() => {}));
      await setup();
      choose("actuator:VENT");
      await act(async () => {
        fireEvent.click(sendButton());
      });
      expect(screen.getByText("Sending…")).toHaveAttribute("aria-disabled", "true");
      fireEvent.click(screen.getByText("Sending…"));
      expect(mocked.sendCommand).toHaveBeenCalledTimes(1);
    });
  });

  describe("who may send", () => {
    it("blocks a viewer, says why, and sends nothing", async () => {
      await setup("viewer");
      choose("actuator:VENT");
      expect(sendButton()).toHaveAttribute("aria-disabled", "true");
      expect(screen.getByText("Viewer role cannot send commands")).toBeInTheDocument();
      fireEvent.click(sendButton());
      expect(mocked.sendCommand).not.toHaveBeenCalled();
    });

    it("blocks everything with no session and says it is not connected", async () => {
      await setup(null);
      choose("actuator:VENT");
      expect(screen.getAllByText("Not connected").length).toBeGreaterThan(0);
      fireEvent.click(sendButton());
      expect(mocked.sendCommand).not.toHaveBeenCalled();
    });

    it("blocks the hazardous state while locked, but not the safe one", async () => {
      await setup("operator", "locked");
      choose("actuator:SVFTV");
      expect(screen.getByText("Physical lockout active")).toBeInTheDocument();
      expect(sendButton()).toHaveAttribute("aria-disabled", "true");
      fireEvent.click(sendButton());
      expect(mocked.sendCommand).not.toHaveBeenCalled();

      fireEvent.change(stateSelect(), { target: { value: "closed" } });
      expect(screen.queryByText("Physical lockout active")).not.toBeInTheDocument();
      expect(sendButton()).toHaveAttribute("aria-disabled", "false");
    });

    it("allows the hazardous state once the lockout opens", async () => {
      await setup("operator", "locked");
      choose("actuator:SVFTV");
      act(() => useNovaStore.getState().ingestLockout("unlocked"));
      expect(sendButton()).toHaveAttribute("aria-disabled", "false");
      await act(async () => {
        fireEvent.click(sendButton());
      });
      expect(mocked.sendCommand).toHaveBeenCalledWith({ type: "solenoid", name: "SVFTV", state: "open" }, "c1");
    });
  });
});

describe("TransmitPacket", () => {
  const transmit = () => screen.getByText("Transmit");
  const packetSelect = () => screen.getAllByRole("combobox")[0] as HTMLSelectElement;

  async function setup(role: ClientRole | null = "operator", config: SystemConfig = {}) {
    connect(role);
    mocked.getConfig.mockResolvedValue(config);
    const view = renderWithProviders(<TransmitPacket />);
    await vi.waitFor(() => expect(view.client.getQueryData(queryKeys.config)).toBeTruthy());
    return view;
  }

  it("falls back to the built-in packets when the config defines none, and says so", async () => {
    await setup();
    expect(screen.getByText("built-in")).toBeInTheDocument();
    expect(Array.from(packetSelect().options).map((o) => o.textContent)).toContain("PWM Set (servo)");
  });

  it("uses the config's packets when it defines some", async () => {
    await setup("operator", { Packets: [{ name: "Custom", op: "custom_op", fields: [{ key: "n", type: "number", default: 3 }] }] });
    await screen.findByText("config");
    expect(Array.from(packetSelect().options).map((o) => o.textContent)).toEqual(["Custom"]);
    expect(screen.getByText('POST /api/console/command {"action":"tx","op":"custom_op","n":3}')).toBeInTheDocument();
  });

  it("previews the request with default field values, typed correctly", async () => {
    await setup();
    fireEvent.change(packetSelect(), { target: { value: "1" } }); // Load Switch
    expect(screen.getByText('POST /api/console/command {"action":"tx","op":"load_sw_set","board_id":0,"channel":0,"enable":false,"hold_ms":0}')).toBeInTheDocument();
  });

  it("sends numbers as numbers and booleans as booleans", async () => {
    await setup();
    fireEvent.change(packetSelect(), { target: { value: "1" } });
    const inputs = screen.getAllByRole("spinbutton");
    fireEvent.change(inputs[1], { target: { value: "7" } }); // channel
    const enable = screen.getAllByRole("combobox")[1];
    fireEvent.change(enable, { target: { value: "1" } });
    await act(async () => {
      fireEvent.click(transmit());
    });
    expect(mocked.sendConsoleCommand).toHaveBeenCalledWith(
      { action: "tx", op: "load_sw_set", board_id: 0, channel: 7, enable: true, hold_ms: 0 },
      "c1",
    );
  });

  it("keeps each packet's field values separate", async () => {
    await setup();
    fireEvent.change(screen.getAllByRole("spinbutton")[2], { target: { value: "1900" } }); // PWM pulse_us
    fireEvent.change(packetSelect(), { target: { value: "1" } });
    fireEvent.change(packetSelect(), { target: { value: "0" } });
    expect((screen.getAllByRole("spinbutton")[2] as HTMLInputElement).value).toBe("1900");
  });

  it("sends a packet with no fields", async () => {
    await setup();
    fireEvent.change(packetSelect(), { target: { value: "6" } }); // Discover
    expect(screen.queryAllByRole("spinbutton")).toHaveLength(0);
    await act(async () => {
      fireEvent.click(transmit());
    });
    expect(mocked.sendConsoleCommand).toHaveBeenCalledWith({ action: "tx", op: "discover" }, "c1");
  });

  it("logs the attempt and the result, or the failure", async () => {
    await setup();
    await act(async () => {
      fireEvent.click(transmit());
    });
    expect(await consoleText()).toEqual(["» tx pwm_set", "✓ tx pwm_set published"]);

    useNovaStore.getState().clearConsole();
    mocked.sendConsoleCommand.mockRejectedValue(new Error("unencodable"));
    await act(async () => {
      fireEvent.click(transmit());
    });
    expect((await consoleText()).at(-1)).toBe("✗ tx pwm_set: unencodable");
  });

  it.each([
    ["viewer", "Operator or admin role required"],
    ["pad", "Operator or admin role required"],
    [null, "Not connected"],
  ] as const)("blocks role %s with '%s' and sends nothing", async (role, reason) => {
    await setup(role);
    expect(screen.getByText(reason)).toBeInTheDocument();
    expect(transmit()).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(transmit());
    expect(mocked.sendConsoleCommand).not.toHaveBeenCalled();
  });

  it.each(["operator", "admin"] as const)("lets %s transmit", async (role) => {
    await setup(role);
    expect(transmit()).toHaveAttribute("aria-disabled", "false");
  });
});

describe("SerialConnection", () => {
  const portSelect = () => screen.getAllByRole("combobox")[0] as HTMLSelectElement;
  const baudSelect = () => screen.getAllByRole("combobox")[1] as HTMLSelectElement;
  const button = (name: string) => screen.getByText(name);

  function setup(role: ClientRole | null = "operator") {
    connect(role);
    return renderWithProviders(<SerialConnection />);
  }

  it("says the link is unknown until the bridge has reported", () => {
    setup();
    expect(screen.getByText(/Link state unknown/)).toBeInTheDocument();
  });

  it("asks the bridge for its ports and link state as soon as it may", async () => {
    setup();
    await waitFor(() => expect(mocked.fasListPorts).toHaveBeenCalledWith("c1"));
    expect(mocked.fasLinkStatus).toHaveBeenCalledWith("c1");
  });

  it("asks for nothing, and disables every control, for a viewer", () => {
    setup("viewer");
    expect(mocked.fasListPorts).not.toHaveBeenCalled();
    expect(portSelect()).toBeDisabled();
    expect(baudSelect()).toBeDisabled();
    expect(button("Connect")).toHaveAttribute("aria-disabled", "true");
    expect(button("Start Stream")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Operator or admin role required")).toBeInTheDocument();
    fireEvent.click(button("Start Stream"));
    expect(mocked.sendConsoleCommand).not.toHaveBeenCalled();
  });

  it("lists the enumerated ports and offers 'No ports found' when there are none", () => {
    setup();
    expect(Array.from(portSelect().options).map((o) => o.textContent)).toEqual(["No ports found"]);
    act(() => useNovaStore.getState().ingestFasPorts([{ device: "COM3" }, { device: "COM4" }]));
    expect(Array.from(portSelect().options).map((o) => o.value)).toEqual(["COM3", "COM4"]);
  });

  it("keeps the bridge's current port selectable even if it was not enumerated", () => {
    setup();
    act(() => {
      useNovaStore.getState().ingestFasPorts([{ device: "COM4" }]);
      useNovaStore.getState().ingestFasLink({ connected: true, port: "COM9", baud: 115200, error: null });
    });
    expect(Array.from(portSelect().options).map((o) => o.value)).toEqual(["COM9", "COM4"]);
    expect(portSelect().value).toBe("COM9");
    expect(baudSelect().value).toBe("115200");
  });

  it("connects with the chosen port and baud", async () => {
    setup();
    act(() => useNovaStore.getState().ingestFasPorts([{ device: "COM3" }, { device: "COM4" }]));
    fireEvent.change(portSelect(), { target: { value: "COM4" } });
    fireEvent.change(baudSelect(), { target: { value: "9600" } });
    await act(async () => {
      fireEvent.click(button("Connect"));
    });
    expect(mocked.fasConfigurePort).toHaveBeenCalledWith("COM4", 9600, "c1");
  });

  it("starts on the FAS default baud", () => {
    setup();
    expect(baudSelect().value).toBe("460800");
  });

  it("does not connect with no port selected", () => {
    setup();
    fireEvent.click(button("Connect"));
    expect(mocked.fasConfigurePort).not.toHaveBeenCalled();
  });

  it("offers Disconnect only while connected, and Reconnect in place of Connect", async () => {
    setup();
    expect(button("Disconnect")).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(button("Disconnect"));
    expect(mocked.fasDisconnectPort).not.toHaveBeenCalled();

    act(() => useNovaStore.getState().ingestFasLink({ connected: true, port: "COM3", baud: 9600, error: null }));
    expect(button("Reconnect")).toBeInTheDocument();
    expect(screen.getByText("Connected on COM3 @ 9600.")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(button("Disconnect"));
    });
    expect(mocked.fasDisconnectPort).toHaveBeenCalledWith("c1");
  });

  it("starts and stops the frame stream, tracking it in the chip", async () => {
    setup();
    expect(screen.getByText("idle")).toBeInTheDocument();
    expect(button("Stop Stream")).toHaveAttribute("aria-disabled", "true");
    await act(async () => {
      fireEvent.click(button("Start Stream"));
    });
    expect(mocked.sendConsoleCommand).toHaveBeenCalledWith({ action: "start" }, "c1");
    expect(screen.getByText("streaming")).toBeInTheDocument();
    expect(button("Start Stream")).toHaveAttribute("aria-disabled", "true");
    await act(async () => {
      fireEvent.click(button("Stop Stream"));
    });
    expect(mocked.sendConsoleCommand).toHaveBeenLastCalledWith({ action: "stop" }, "c1");
    expect(screen.getByText("idle")).toBeInTheDocument();
  });

  it("stays idle, and logs the error, if starting the stream fails", async () => {
    mocked.sendConsoleCommand.mockRejectedValue(new Error("bridge offline"));
    setup();
    await act(async () => {
      fireEvent.click(button("Start Stream"));
    });
    expect(screen.getByText("idle")).toBeInTheDocument();
    expect((await consoleText()).at(-1)).toBe("✗ console start: bridge offline");
  });

  it("shows console lines but not telemetry passthrough in its terminal", async () => {
    setup();
    act(() => {
      useNovaStore.getState().ingestConsoleMessage({ level: "info", message: "bridge hello" });
      useNovaStore.getState().ingestConsoleMessage({ type: "engine_data", data: [] });
    });
    expect(await screen.findByText("bridge hello")).toBeInTheDocument();
    expect(within(document.body).queryByText(/engine_data/)).not.toBeInTheDocument();
  });
});

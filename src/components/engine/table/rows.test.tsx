import { Table } from "@chakra-ui/react";
import { act, fireEvent, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/hooks/queryKeys";
import { getConfig } from "@/lib/api";
import { sendCommand } from "@/lib/api/commands";
import { useNovaStore } from "@/lib/store/store";
import type { ActuatorEntry, ClientRole, SensorEntry } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { ActuatorRow, SensorRow } from "./rows";

vi.mock("@/lib/api", () => ({ getConfig: vi.fn() }));
vi.mock("@/lib/api/commands", () => ({ sendCommand: vi.fn() }));

const initial = useNovaStore.getInitialState();

const solenoid: ActuatorEntry = { name: "SVFTV", type: "solenoid", binding: { target: "GCS", relay_channel: 0 } };
const ABORT: ActuatorEntry = { name: "ABORT", type: "solenoid", binding: { target: "GCS", relay_channel: 1 } };

const CONFIG = { safetyRules: { hazardous: [{ SVFTV: "open" }], critical: [{ ABORT: "ALL" }] } };

function inTable(children: ReactNode) {
  return (
    <Table.Root>
      <Table.Body>{children}</Table.Body>
    </Table.Root>
  );
}

function renderActuator(entry: ActuatorEntry, props: Partial<{ editing: boolean; hidden: boolean }> = {}) {
  const onToggleHidden = vi.fn();
  const view = renderWithProviders(
    inTable(<ActuatorRow entry={entry} editing={props.editing ?? false} hidden={props.hidden ?? false} onToggleHidden={onToggleHidden} />),
  );
  return { ...view, onToggleHidden };
}

function connect(role: ClientRole, lockout: "locked" | "unlocked" = "unlocked") {
  const store = useNovaStore.getState();
  store.ingestSession({ type: "session", role, client_id: "c1" });
  store.ingestLockout(lockout);
}

function setActuator(name: string, position: string) {
  act(() => {
    useNovaStore.getState().ingestActuatorStates({ type: "actuator_states", actuator_states: { [name]: { position } } as never });
  });
}

/**
 * The gate blocks everything until the config (and its safety rules) has loaded,
 * so a test that expects "blocked" must first prove the config is in. React Query
 * publishes results on a macrotask, hence the timer tick.
 */
async function configLoaded(client: QueryClient) {
  await vi.waitFor(() => expect(client.getQueryData(queryKeys.config)).toBeTruthy());
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

const button = (name: RegExp | string) => screen.getByRole("button", { name });

beforeEach(() => {
  useNovaStore.setState(initial, true);
  vi.mocked(getConfig).mockResolvedValue(CONFIG);
  vi.mocked(sendCommand).mockReset().mockResolvedValue({ published_commands: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ActuatorRow: display", () => {
  it("shows the actuator's name", () => {
    renderActuator(solenoid);
    expect(screen.getByText("SVFTV")).toBeInTheDocument();
  });

  it("shows only the axis name, never OPEN or CLOSED, until the backend has reported a state", () => {
    renderActuator(solenoid);
    expect(screen.getByText("POS")).toBeInTheDocument();
    expect(screen.queryByText("OPEN")).not.toBeInTheDocument();
    expect(screen.queryByText("CLOSED")).not.toBeInTheDocument();
  });

  it("shows the reported state", async () => {
    renderActuator(solenoid);
    setActuator("SVFTV", "open");
    expect(await screen.findByText("OPEN")).toBeInTheDocument();
    setActuator("SVFTV", "closed");
    expect(await screen.findByText("CLOSED")).toBeInTheDocument();
  });

  it("shows an unrecognised reported state as it is", () => {
    renderActuator(solenoid);
    setActuator("SVFTV", "jammed");
    expect(screen.getByText("JAMMED")).toBeInTheDocument();
  });

  it("does not show one actuator's state on another's row", () => {
    renderActuator(solenoid);
    setActuator("OTHER", "open");
    expect(screen.queryByText("OPEN")).not.toBeInTheDocument();
  });

  it("renders nothing for a hidden row outside edit mode", () => {
    renderActuator(solenoid, { hidden: true });
    expect(screen.queryByText("SVFTV")).not.toBeInTheDocument();
  });
});

describe("ActuatorRow: who may command", () => {
  /** Wait for the config to load so the gate can classify the command. */
  async function ready(role: ClientRole, lockout: "locked" | "unlocked" = "unlocked") {
    connect(role, lockout);
    const view = renderActuator(solenoid);
    setActuator("SVFTV", "closed");
    await screen.findByText("CLOSED");
    await configLoaded(view.client);
    return view;
  }

  it("lets an operator command it, sending the opposite state and the client id", async () => {
    await ready("operator");
    fireEvent.click(button("CLOSED"));
    expect(sendCommand).toHaveBeenCalledWith({ type: "solenoid", name: "SVFTV", state: "open" }, "c1");
  });

  it("marks the button disabled and sends nothing when a viewer clicks it", async () => {
    await ready("viewer");
    expect(button("CLOSED")).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(button("CLOSED"));
    expect(sendCommand).not.toHaveBeenCalled();
  });

  it("sends nothing before the session exists", async () => {
    renderActuator(solenoid);
    setActuator("SVFTV", "closed");
    await screen.findByText("CLOSED");
    expect(button("CLOSED")).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(button("CLOSED"));
    expect(sendCommand).not.toHaveBeenCalled();
  });

  it("blocks a hazardous command while the lockout is engaged", async () => {
    await ready("operator", "locked");
    expect(button("CLOSED")).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(button("CLOSED"));
    expect(sendCommand).not.toHaveBeenCalled();
  });

  it("allows that same command once the lockout is open", async () => {
    await ready("operator", "locked");
    expect(button("CLOSED")).toHaveAttribute("aria-disabled", "true");
    act(() => useNovaStore.getState().ingestLockout("unlocked"));
    expect(button("CLOSED")).toHaveAttribute("aria-disabled", "false");
    fireEvent.click(button("CLOSED"));
    expect(sendCommand).toHaveBeenCalledTimes(1);
  });

  it("allows a command that is not hazardous even while the lockout is engaged", async () => {
    connect("operator", "locked");
    const view = renderActuator(ABORT);
    setActuator("ABORT", "closed");
    await screen.findByText("CLOSED");
    await configLoaded(view.client);
    expect(button("CLOSED")).toHaveAttribute("aria-disabled", "false");
    fireEvent.click(button("CLOSED"));
    expect(sendCommand).toHaveBeenCalledWith({ type: "solenoid", name: "ABORT", state: "open" }, "c1");
  });

  it("blocks a viewer even for a command that is not hazardous", async () => {
    connect("viewer");
    const view = renderActuator(ABORT);
    setActuator("ABORT", "closed");
    await screen.findByText("CLOSED");
    await configLoaded(view.client);
    expect(button("CLOSED")).toHaveAttribute("aria-disabled", "true");
  });

  it("does not send while the table is being edited", async () => {
    connect("operator");
    const view = renderActuator(solenoid);
    setActuator("SVFTV", "closed");
    await screen.findByText("CLOSED");
    await configLoaded(view.client);
    expect(button("CLOSED")).toHaveAttribute("aria-disabled", "false");
    view.rerender(inTable(<ActuatorRow entry={solenoid} editing hidden={false} onToggleHidden={() => {}} />));
    expect(button("CLOSED")).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(button("CLOSED"));
    expect(sendCommand).not.toHaveBeenCalled();
  });
});

describe("ActuatorRow: optimistic state", () => {
  async function operatorRow() {
    connect("operator");
    const view = renderActuator(solenoid);
    setActuator("SVFTV", "closed");
    await screen.findByText("CLOSED");
    await configLoaded(view.client);
    return view;
  }

  it("shows the commanded state straight away, before the backend confirms", async () => {
    await operatorRow();
    vi.mocked(sendCommand).mockReturnValue(new Promise(() => {}));
    await act(async () => {
      fireEvent.click(button("CLOSED"));
    });
    expect(screen.getByText("OPEN")).toBeInTheDocument();
  });

  it("settles on the backend's state once it confirms", async () => {
    await operatorRow();
    await act(async () => {
      fireEvent.click(button("CLOSED"));
    });
    setActuator("SVFTV", "open");
    expect(screen.getByText("OPEN")).toBeInTheDocument();
  });

  it("falls back to the real state if the backend never confirms", async () => {
    await operatorRow();
    vi.useFakeTimers();
    await act(async () => {
      fireEvent.click(button("CLOSED"));
    });
    expect(screen.getByText("OPEN")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByText("CLOSED")).toBeInTheDocument();
  });

  it("falls back to the real state straight away when the command is rejected", async () => {
    await operatorRow();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(sendCommand).mockRejectedValue(new Error("Physical lockout active"));
    await act(async () => {
      fireEvent.click(button("CLOSED"));
    });
    expect(screen.getByText("CLOSED")).toBeInTheDocument();
    expect(log).toHaveBeenCalled();
  });

  it("drops a pending command when the session changes (a reconnect)", async () => {
    await operatorRow();
    vi.mocked(sendCommand).mockReturnValue(new Promise(() => {}));
    await act(async () => {
      fireEvent.click(button("CLOSED"));
    });
    expect(screen.getByText("OPEN")).toBeInTheDocument();
    act(() => useNovaStore.getState().ingestSession({ type: "session", role: "operator", client_id: "c2" }));
    expect(screen.getByText("CLOSED")).toBeInTheDocument();
  });

  it("shows nothing confident if the state is cleared while a command is pending", async () => {
    await operatorRow();
    vi.mocked(sendCommand).mockReturnValue(new Promise(() => {}));
    await act(async () => {
      fireEvent.click(button("CLOSED"));
    });
    act(() => useNovaStore.setState({ actuatorStates: { data: null, status: "connecting", lastSeen: null } }));
    expect(screen.queryByText("OPEN")).not.toBeInTheDocument();
    expect(screen.queryByText("CLOSED")).not.toBeInTheDocument();
    expect(screen.getByText("POS")).toBeInTheDocument();
  });
});

describe("ActuatorRow: edit mode", () => {
  it("shows reorder and hide controls, and hide calls back with the row's name", () => {
    const { onToggleHidden } = renderActuator(solenoid, { editing: true });
    expect(screen.getByLabelText("Reorder SVFTV")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Hide SVFTV"));
    expect(onToggleHidden).toHaveBeenCalledWith("SVFTV");
  });

  it("shows a hidden row, with a Show control, so it can be restored", () => {
    renderActuator(solenoid, { editing: true, hidden: true });
    expect(screen.getByText("SVFTV")).toBeInTheDocument();
    expect(screen.getByLabelText("Show SVFTV")).toHaveAttribute("aria-pressed", "true");
  });

  it("freezes the displayed state while editing so rows do not change under the cursor", () => {
    const view = renderActuator(solenoid, { editing: false });
    setActuator("SVFTV", "closed");
    expect(screen.getByText("CLOSED")).toBeInTheDocument();
    view.rerender(inTable(<ActuatorRow entry={solenoid} editing hidden={false} onToggleHidden={() => {}} />));
    setActuator("SVFTV", "open");
    expect(screen.getByText("CLOSED")).toBeInTheDocument();
  });

  it("has no edit controls outside edit mode", () => {
    renderActuator(solenoid);
    expect(screen.queryByLabelText("Reorder SVFTV")).not.toBeInTheDocument();
  });
});

describe("SensorRow", () => {
  const sensor: SensorEntry = { name: "PT1", type: "PT", unit: "psi", binding: { source: "GCS", hat_id: 0, channel_id: 0 } };

  function renderSensor(props: Partial<{ isStale: boolean; editing: boolean; hidden: boolean }> = {}) {
    return renderWithProviders(
      inTable(<SensorRow sensor={sensor} isStale={props.isStale ?? false} editing={props.editing ?? false} hidden={props.hidden ?? false} onToggleHidden={() => {}} />),
    );
  }

  const reading = (value: number, avg = value) => ({ name: "PT1", value, avg, unit: "bar", timestamp: 1 });

  it("shows a dash, not zero, before any reading arrives", () => {
    renderSensor();
    expect(screen.getByText("PT1")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    expect(screen.getByText("psi")).toBeInTheDocument();
  });

  it("shows the value, the running average and the reported unit", () => {
    renderSensor();
    act(() => useNovaStore.getState().ingestEngineData([reading(101.25, 99.5)]));
    expect(screen.getByText("101.25")).toBeInTheDocument();
    expect(screen.getByText("99.50")).toBeInTheDocument();
    expect(screen.getByText("bar")).toBeInTheDocument();
  });

  it("shows a real zero reading as 0", () => {
    renderSensor();
    act(() => useNovaStore.getState().ingestEngineData([reading(0)]));
    expect(screen.getAllByText("0").length).toBeGreaterThanOrEqual(1);
  });

  it.each([
    [1234.567, "1235"],
    [123.456, "123.5"],
    [1.2345, "1.23"],
    [-123.456, "-123.5"],
  ])("formats the average %s as %s", (avg, shown) => {
    renderSensor();
    act(() => useNovaStore.getState().ingestEngineData([reading(1, avg)]));
    expect(screen.getByText(shown)).toBeInTheDocument();
  });

  it("shows a dash for a non-finite average while still showing the value", () => {
    renderSensor();
    act(() => useNovaStore.getState().ingestEngineData([reading(5, NaN)]));
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(1);
  });

  it("keeps the last value visible, and updates it, as new readings arrive", () => {
    renderSensor();
    act(() => useNovaStore.getState().ingestEngineData([reading(1)]));
    act(() => useNovaStore.getState().ingestEngineData([reading(2)]));
    expect(screen.queryByText("1")).not.toBeInTheDocument();
    expect(screen.getAllByText("2").length).toBeGreaterThanOrEqual(1);
  });

  it("ignores another sensor's reading", () => {
    renderSensor();
    act(() => useNovaStore.getState().ingestEngineData([{ name: "PT2", value: 77, avg: 77, unit: "psi", timestamp: 1 }]));
    expect(screen.queryByText("77")).not.toBeInTheDocument();
  });

  it("freezes the reading while the table is being edited", () => {
    const view = renderSensor();
    act(() => useNovaStore.getState().ingestEngineData([reading(10)]));
    view.rerender(inTable(<SensorRow sensor={sensor} isStale={false} editing hidden={false} onToggleHidden={() => {}} />));
    act(() => useNovaStore.getState().ingestEngineData([reading(20)]));
    expect(screen.getAllByText("10").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("20")).not.toBeInTheDocument();
  });
});

describe("SensorRow: thermocouple faults", () => {
  const tc: SensorEntry = { name: "TC1", type: "TC", unit: "C", binding: { source: "TCS", hat_id: 1, channel_id: 0 } };

  function renderTc() {
    return renderWithProviders(
      inTable(<SensorRow sensor={tc} isStale={false} editing={false} hidden={false} onToggleHidden={() => {}} />),
    );
  }

  it.each([
    ["open", "TC OPEN"],
    ["common_mode", "TC COMMON MODE"],
    ["overrange", "TC OVERRANGE"],
  ])("shows a %s fault by name, never as a number", (fault, shown) => {
    renderTc();
    act(() => useNovaStore.getState().ingestEngineData([{ name: "TC1", value: null, avg: null, unit: "C", timestamp: 1, fault }]));
    expect(screen.getByText(shown)).toBeInTheDocument();
    expect(screen.queryByText("-9999")).not.toBeInTheDocument();
  });

  it("goes back to the number once the fault clears", () => {
    renderTc();
    act(() => useNovaStore.getState().ingestEngineData([{ name: "TC1", value: null, avg: null, unit: "C", timestamp: 1, fault: "open" }]));
    act(() => useNovaStore.getState().ingestEngineData([{ name: "TC1", value: 21.5, avg: 21.5, unit: "C", timestamp: 2, fault: null }]));
    expect(screen.queryByText("TC OPEN")).not.toBeInTheDocument();
    expect(screen.getByText("21.5")).toBeInTheDocument();
  });
});

describe("ActuatorRow: Pi trips", () => {
  const heater: ActuatorEntry = { name: "TANK-HTR-PWR", type: "gpio_device", binding: { target: "TCS", gpio_channel: 17 } };

  it("shows the trip and its reason", () => {
    renderActuator(heater);
    act(() => {
      useNovaStore.getState().ingestActuatorStates({
        type: "actuator_states",
        actuator_states: { "TANK-HTR-PWR": { arming: "disarmed", tripped: "comms_loss", tripped_output: "gpio:17", tripped_ms: 1 } },
      });
    });
    expect(screen.getByText(/TRIPPED · comms loss/)).toBeInTheDocument();
    expect(screen.getByLabelText("Tripped: comms loss (GPIO 17)")).toBeInTheDocument();
  });

  it("shows no trip when the state has none", () => {
    renderActuator(heater);
    act(() => {
      useNovaStore.getState().ingestActuatorStates({ type: "actuator_states", actuator_states: { "TANK-HTR-PWR": { arming: "armed" } } });
    });
    expect(screen.queryByText(/TRIPPED/)).not.toBeInTheDocument();
  });
});

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fasConfigurePort, fasDisconnectPort, fasLinkStatus, fasListPorts } from "@/lib/api";
import { useNovaStore } from "@/lib/store";
import type { ClientRole } from "@/lib/types";
import { FAS_BAUD_RATES, FAS_DEFAULT_BAUD, useFasLink } from "./useFasLink";

vi.mock("@/lib/api", () => ({
  fasConfigurePort: vi.fn(),
  fasDisconnectPort: vi.fn(),
  fasLinkStatus: vi.fn(),
  fasListPorts: vi.fn(),
}));

const initial = useNovaStore.getInitialState();

function session(role: ClientRole | null, clientId: string | null = role ? "c1" : null) {
  useNovaStore.setState({ session: { clientId, role } });
}

const consoleLines = () => {
  vi.advanceTimersByTime(200); // console ingest is batched
  return useNovaStore.getState().consoleMessages;
};

beforeEach(() => {
  vi.useFakeTimers();
  useNovaStore.setState(initial, true);
  useNovaStore.getState().clearConsole();
  for (const fn of [fasConfigurePort, fasDisconnectPort, fasLinkStatus, fasListPorts]) {
    vi.mocked(fn).mockReset().mockResolvedValue({ published: true, action: "status" });
  }
});

afterEach(() => {
  useNovaStore.getState().clearConsole();
  vi.useRealTimers();
});

describe("constants", () => {
  it("offers the FAS default baud in the picker", () => {
    expect(FAS_BAUD_RATES).toContain(FAS_DEFAULT_BAUD);
    expect(FAS_DEFAULT_BAUD).toBe(460800);
  });
});

describe("useFasLink: state and gating", () => {
  it("passes through the bridge state from the store, unknown as null", () => {
    const { result } = renderHook(() => useFasLink());
    expect(result.current.link).toBeNull();
    expect(result.current.ports).toBeNull();
    expect(result.current.streaming).toBe(false);

    act(() => {
      useNovaStore.getState().ingestFasLink({ connected: true, port: "COM3", baud: 9600, error: null });
      useNovaStore.getState().ingestFasPorts([{ device: "COM3" }]);
      useNovaStore.getState().setFasStreaming(true);
    });
    expect(result.current.link?.port).toBe("COM3");
    expect(result.current.ports).toEqual([{ device: "COM3" }]);
    expect(result.current.streaming).toBe(true);
  });

  it.each([
    ["operator", true, null],
    ["admin", true, null],
    ["pad", false, "Operator or admin role required"],
    ["viewer", false, "Operator or admin role required"],
  ] as const)("role %s: canControl=%s", (role, canControl, reason) => {
    session(role);
    const { result } = renderHook(() => useFasLink());
    expect(result.current.canControl).toBe(canControl);
    expect(result.current.gateReason).toBe(reason);
  });

  it("cannot control, and says why, with no session", () => {
    const { result } = renderHook(() => useFasLink());
    expect(result.current).toMatchObject({ canControl: false, gateReason: "Not connected" });
  });

  it("cannot control with an operator role but no client id", () => {
    session("operator", null);
    const { result } = renderHook(() => useFasLink());
    expect(result.current).toMatchObject({ canControl: false, gateReason: "Not connected" });
  });
});

describe("useFasLink: commands", () => {
  beforeEach(() => session("operator"));

  it("refreshPorts, refreshStatus and disconnect call the API with the client id", async () => {
    const { result } = renderHook(() => useFasLink());
    await act(() => result.current.refreshPorts());
    await act(() => result.current.refreshStatus());
    await act(() => result.current.disconnect());
    expect(fasListPorts).toHaveBeenCalledWith("c1");
    expect(fasLinkStatus).toHaveBeenCalledWith("c1");
    expect(fasDisconnectPort).toHaveBeenCalledWith("c1");
  });

  it("connect passes the port, the baud and the client id", async () => {
    const { result } = renderHook(() => useFasLink());
    await act(() => result.current.connect("COM3", 115200));
    expect(fasConfigurePort).toHaveBeenCalledWith("COM3", 115200, "c1");
  });

  it("echoes each attempt to the console log", async () => {
    const { result } = renderHook(() => useFasLink());
    await act(() => result.current.connect("COM3", 115200));
    expect(consoleLines().map((l) => l.text)).toEqual(["» console configure COM3 @ 115200"]);
  });

  it("reports a failed command on the console log and does not throw", async () => {
    vi.mocked(fasListPorts).mockRejectedValue(new Error("Viewer cannot command"));
    const { result } = renderHook(() => useFasLink());
    await act(() => result.current.refreshPorts());
    const lines = consoleLines();
    expect(lines.map((l) => l.text)).toEqual(["» console list_ports", "✗ console list_ports: Viewer cannot command"]);
    expect(lines[1]).toMatchObject({ status: "error", kind: "error" });
  });

  it("describes a non-Error rejection", async () => {
    vi.mocked(fasLinkStatus).mockRejectedValue("plain string");
    const { result } = renderHook(() => useFasLink());
    await act(() => result.current.refreshStatus());
    expect(consoleLines().at(-1)?.text).toBe("✗ console status: plain string");
  });

  it("is busy while a command is in flight and clears afterwards, even on failure", async () => {
    let finish!: () => void;
    vi.mocked(fasListPorts).mockReturnValue(new Promise((r) => (finish = () => r({ published: true, action: "list_ports" }))));
    const { result } = renderHook(() => useFasLink());
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.refreshPorts();
    });
    expect(result.current.busy).toBe(true);
    await act(async () => {
      finish();
      await pending;
    });
    expect(result.current.busy).toBe(false);

    vi.mocked(fasListPorts).mockRejectedValue(new Error("x"));
    await act(() => result.current.refreshPorts());
    expect(result.current.busy).toBe(false);
  });

  it("does nothing, and logs nothing, without a client id", async () => {
    session("operator", null);
    const { result } = renderHook(() => useFasLink());
    await act(() => result.current.connect("COM3", 9600));
    expect(fasConfigurePort).not.toHaveBeenCalled();
    expect(consoleLines()).toEqual([]);
  });
});

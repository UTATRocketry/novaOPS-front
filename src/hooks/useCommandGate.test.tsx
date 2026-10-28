import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getConfig } from "@/lib/api";
import { useNovaStore } from "@/lib/store";
import type { ClientRole, SafetyRules, SystemConfig } from "@/lib/types";
import { queryWrapper } from "@/test/queryWrapper";
import { useCommandGate } from "./useCommandGate";
import type { CommandGateInput } from "./useCommandGate";

vi.mock("@/lib/api", () => ({ getConfig: vi.fn() }));

const initial = useNovaStore.getInitialState();

function setSession(role: ClientRole | null) {
  useNovaStore.setState({ session: { clientId: role ? "c1" : null, role } });
}

function setLockout(state: "locked" | "unlocked" | "stale-unlocked" | "none") {
  const store = useNovaStore.getState();
  if (state === "locked") store.ingestLockout("locked");
  else if (state === "unlocked") store.ingestLockout("unlocked");
  else if (state === "stale-unlocked")
    useNovaStore.setState({ lockout: { data: "unlocked", status: "stale", lastSeen: 0 } });
}

const RULES: SafetyRules = {
  hazardous: [{ SVFTV: "open" }, { IGNITER: "ALL" }, { MAINS: ["open", "arm"] }],
  critical: [{ ABORT: "ALL" }, { VENT: "open" }],
};

/** Render the gate with the config already loaded. */
async function gate(input: CommandGateInput, config: SystemConfig = { safetyRules: RULES }) {
  vi.mocked(getConfig).mockResolvedValue(config);
  const view = renderHook(() => useCommandGate(input), { wrapper: queryWrapper() });
  await waitFor(() => expect(view.result.current.reason).not.toBe("Configuration not loaded"));
  return view.result.current;
}

beforeEach(() => {
  useNovaStore.setState(initial, true);
  vi.mocked(getConfig).mockReset();
});

describe("useCommandGate: session and role", () => {
  it("blocks everything when there is no session", async () => {
    setSession(null);
    setLockout("unlocked");
    expect(await gate({ name: "V1", state: "open" })).toEqual({ canSend: false, reason: "Not connected" });
  });

  it("blocks a viewer from every command, even a harmless one with the lock open", async () => {
    setSession("viewer");
    setLockout("unlocked");
    expect(await gate({ name: "V1", state: "open" })).toEqual({
      canSend: false,
      reason: "Viewer role cannot send commands",
    });
  });

  it("blocks until the config has loaded, because hazard cannot be judged without it", () => {
    setSession("operator");
    setLockout("unlocked");
    vi.mocked(getConfig).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useCommandGate({ name: "V1" }), { wrapper: queryWrapper() });
    expect(result.current).toEqual({ canSend: false, reason: "Configuration not loaded" });
  });

  it("stays blocked if the config fails to load", async () => {
    setSession("operator");
    setLockout("unlocked");
    vi.mocked(getConfig).mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useCommandGate({ name: "SVFTV", state: "open" }), { wrapper: queryWrapper() });
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.canSend).toBe(false);
  });
});

describe("useCommandGate: physical lockout", () => {
  it.each(["operator", "admin"] as const)("%s may send a non-hazardous command while locked", async (role) => {
    setSession(role);
    setLockout("locked");
    expect(await gate({ name: "V1", state: "open" })).toEqual({ canSend: true, reason: null });
  });

  it.each(["operator", "admin"] as const)("%s is blocked from a hazardous command while locked", async (role) => {
    setSession(role);
    setLockout("locked");
    expect(await gate({ name: "SVFTV", state: "open" })).toEqual({ canSend: false, reason: "Physical lockout active" });
  });

  it("allows a hazardous command once the lockout is live and unlocked", async () => {
    setSession("operator");
    setLockout("unlocked");
    expect(await gate({ name: "SVFTV", state: "open" })).toEqual({ canSend: true, reason: null });
  });

  it.each(["stale-unlocked", "none"] as const)(
    "treats an unknown lock state (%s) as locked",
    async (lockout) => {
      setSession("operator");
      setLockout(lockout);
      expect((await gate({ name: "SVFTV", state: "open" })).reason).toBe("Physical lockout active");
    },
  );

  it("does not block a critical-only command on the lockout", async () => {
    setSession("operator");
    setLockout("locked");
    expect((await gate({ name: "ABORT", state: "fire" })).canSend).toBe(true);
  });
});

describe("useCommandGate: rule matching", () => {
  beforeEach(() => {
    setSession("operator");
    setLockout("locked");
  });

  it("only treats the listed state as hazardous", async () => {
    expect((await gate({ name: "SVFTV", state: "close" })).canSend).toBe(true);
    expect((await gate({ name: "SVFTV", state: "open" })).canSend).toBe(false);
  });

  it("matches name and state case-insensitively", async () => {
    expect((await gate({ name: "svftv", state: "OPEN" })).canSend).toBe(false);
  });

  it("treats a rule value of ALL as every state", async () => {
    for (const state of ["open", "close", "anything", undefined]) {
      expect((await gate({ name: "IGNITER", state })).canSend).toBe(false);
    }
  });

  it("treats ALL inside a state list as every state", async () => {
    const config = { safetyRules: { hazardous: [{ V1: ["close", "ALL"] }] } };
    expect((await gate({ name: "V1", state: "open" }, config)).canSend).toBe(false);
  });

  it("matches any state in a list", async () => {
    expect((await gate({ name: "MAINS", state: "arm" })).canSend).toBe(false);
    expect((await gate({ name: "MAINS", state: "safe" })).canSend).toBe(true);
  });

  it("treats any rule for the name as a match when no state is given", async () => {
    expect((await gate({ name: "SVFTV" })).canSend).toBe(false);
  });

  it("does not match a different actuator that shares a prefix", async () => {
    expect((await gate({ name: "SVFTV2", state: "open" })).canSend).toBe(true);
  });

  it("allows everything for an operator when no rules are configured", async () => {
    expect((await gate({ name: "SVFTV", state: "open" }, {})).canSend).toBe(true);
    expect((await gate({ name: "SVFTV", state: "open" }, { safetyRules: { hazardous: [] } })).canSend).toBe(true);
  });
});

describe("useCommandGate: pad role", () => {
  beforeEach(() => setSession("pad"));

  it("may not send an ordinary command", async () => {
    setLockout("unlocked");
    expect(await gate({ name: "V1", state: "open" })).toEqual({
      canSend: false,
      reason: "Pad role: safety-critical commands only",
    });
  });

  it("may send a critical command", async () => {
    setLockout("locked");
    expect((await gate({ name: "ABORT", state: "fire" })).canSend).toBe(true);
  });

  it("may send a hazardous command only with the lock open", async () => {
    setLockout("unlocked");
    expect((await gate({ name: "SVFTV", state: "open" })).canSend).toBe(true);
    setLockout("locked");
    expect((await gate({ name: "SVFTV", state: "open" })).reason).toBe("Physical lockout active");
  });

  it("is restricted only for the listed states of a critical command", async () => {
    setLockout("unlocked");
    expect((await gate({ name: "VENT", state: "open" })).canSend).toBe(true);
    expect((await gate({ name: "VENT", state: "close" })).canSend).toBe(false);
  });
});

describe("useCommandGate: reacts to live changes", () => {
  it("re-enables a hazardous command when the lock opens, and blocks it again when it closes", async () => {
    setSession("operator");
    setLockout("locked");
    vi.mocked(getConfig).mockResolvedValue({ safetyRules: RULES });
    const { result, rerender } = renderHook(() => useCommandGate({ name: "SVFTV", state: "open" }), {
      wrapper: queryWrapper(),
    });
    await waitFor(() => expect(result.current.reason).toBe("Physical lockout active"));

    useNovaStore.getState().ingestLockout("unlocked");
    rerender();
    await waitFor(() => expect(result.current.canSend).toBe(true));

    useNovaStore.getState().ingestLockout("locked");
    rerender();
    await waitFor(() => expect(result.current.canSend).toBe(false));
  });

  it("blocks immediately when the session is lost", async () => {
    setSession("operator");
    setLockout("unlocked");
    vi.mocked(getConfig).mockResolvedValue({ safetyRules: RULES });
    const { result, rerender } = renderHook(() => useCommandGate({ name: "V1", state: "open" }), {
      wrapper: queryWrapper(),
    });
    await waitFor(() => expect(result.current.canSend).toBe(true));

    useNovaStore.getState().markDisconnected();
    rerender();
    await waitFor(() => expect(result.current).toEqual({ canSend: false, reason: "Not connected" }));
  });
});

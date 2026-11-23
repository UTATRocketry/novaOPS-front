import { describe, expect, it } from "vitest";

import { classifyConsoleMessage, parseConsolePorts } from "./classify";
import { describeLink } from "./link";
import { TELEMETRY_MSG_TYPES, isConsoleLine } from "./types";
import type { ConsoleLogEntry } from "./types";

const classify = (raw: Record<string, unknown>) => classifyConsoleMessage(raw);

describe("parseConsolePorts", () => {
  it("keeps device, name, description and hwid", () => {
    expect(
      parseConsolePorts({ ports: [{ device: "COM3", name: "COM3", description: "USB Serial", hwid: "USB VID:PID=1" }] }),
    ).toEqual([{ device: "COM3", name: "COM3", description: "USB Serial", hwid: "USB VID:PID=1" }]);
  });

  it("drops entries without a usable device", () => {
    const ports = parseConsolePorts({ ports: [null, "x", 5, {}, { device: "" }, { device: 7 }, { device: "COM4" }] });
    expect(ports).toEqual([{ device: "COM4" }]);
  });

  it("omits optional fields that are empty or not strings", () => {
    expect(parseConsolePorts({ ports: [{ device: "COM3", name: "", description: 1 }] })).toEqual([{ device: "COM3" }]);
  });

  it("returns an empty list when ports is missing or not an array", () => {
    expect(parseConsolePorts({})).toEqual([]);
    expect(parseConsolePorts({ ports: "COM3" })).toEqual([]);
  });
});

describe("classifyConsoleMessage", () => {
  it("tags every entry with the original message type and raw payload", () => {
    const raw = { type: "console_status", active: true };
    const out = classify(raw);
    expect(out.msgType).toBe("console_status");
    expect(out.raw).toBe(raw);
  });

  describe("error frames", () => {
    it("shows the detail", () => {
      expect(classify({ type: "error", detail: "Viewer cannot command" })).toMatchObject({
        status: "error",
        kind: "error",
        text: "Viewer cannot command",
      });
    });

    it("falls back when there is no detail", () => {
      expect(classify({ type: "error" }).text).toBe("Unknown server error");
    });
  });

  describe("fas_frame", () => {
    it("names the board and formats the message id in hex", () => {
      const out = classify({ type: "fas_frame", board_kind: 2, board_id: 1, msg_type: 255, dir: "tx", decoded: { v: 1 } });
      expect(out).toMatchObject({ status: "info", kind: "frame", text: 'TX EPB:1 msg=0xff {"v":1}' });
    });

    it.each([[0, "GS"], [1, "FMC"], [2, "EPB"], [3, "IMC"], [4, "RAB"], [5, "PMB"], [9, "K9"]])("board kind %d -> %s", (kind, label) => {
      expect(classify({ type: "fas_frame", board_kind: kind }).text).toContain(` ${label}:`);
    });

    it("uses placeholders and the hex payload when fields are missing", () => {
      expect(classify({ type: "fas_frame", data_hex: "dead" }).text).toBe("RX ?:0 msg=? dead");
    });
  });

  describe("console_tx", () => {
    it("reports an accepted transmit with its frame", () => {
      expect(classify({ type: "console_tx", frame_hex: "aa55" })).toMatchObject({ status: "nominal", kind: "tx", text: "TX ok aa55" });
    });

    it("reports a failed transmit as an error", () => {
      expect(classify({ type: "console_tx", ok: false, error: "bad id" })).toMatchObject({ status: "error", text: "TX failed: bad id" });
      expect(classify({ type: "console_tx", ok: false }).text).toBe("TX failed: unencodable packet");
    });
  });

  it("lists the ports it found", () => {
    expect(classify({ type: "console_ports", ports: [{ device: "COM3" }, { device: "COM4" }, {}] }).text).toBe("Ports: COM3, COM4");
    expect(classify({ type: "console_ports" }).text).toBe("Ports: (none)");
  });

  describe("console_config", () => {
    it("reports success with the baud", () => {
      expect(classify({ type: "console_config", port: "COM3", baud: 115200 })).toMatchObject({ status: "nominal", text: "Configured COM3 @ 115200" });
    });

    it("reports a failure as an error", () => {
      expect(classify({ type: "console_config", ok: false, port: "COM3", error: "busy" })).toMatchObject({
        status: "error",
        text: "Configure COM3 failed: busy",
      });
    });
  });

  describe("console_serial", () => {
    it("reports the link coming up", () => {
      expect(classify({ type: "console_serial", connected: true, port: "COM3", baud: 9600 })).toMatchObject({
        status: "nominal",
        text: "Serial link up — COM3 @ 9600",
      });
    });

    it("reports a link down with an error as an error, without one as neutral", () => {
      expect(classify({ type: "console_serial", connected: false, port: "COM3", error: "unplugged" })).toMatchObject({
        status: "error",
        text: "Serial link down (COM3): unplugged",
      });
      expect(classify({ type: "console_serial", connected: false })).toMatchObject({ status: "neutral", text: "Serial link down" });
    });

    it("treats anything but literal true as down", () => {
      expect(classify({ type: "console_serial", connected: "true" }).text).toContain("down");
    });
  });

  it("reports stream start and stop", () => {
    expect(classify({ type: "console_status", active: true }).text).toBe("Stream started");
    expect(classify({ type: "console_status", active: false })).toMatchObject({ status: "neutral", text: "Stream stopped" });
  });

  describe("generic passthrough", () => {
    it.each([
      ["command", "nominal", "command"],
      ["CMD", "nominal", "command"],
      ["warn", "warn", "warning"],
      ["Warning", "warn", "warning"],
      ["fatal", "fault", "fatal"],
      ["critical", "fault", "fatal"],
      ["error", "error", "error"],
      ["err", "error", "error"],
      ["debug", "neutral", "activity"],
      ["whatever", "info", "activity"],
    ])("level %s -> %s / %s", (level, status, kind) => {
      expect(classify({ level, message: "hi" })).toMatchObject({ status, kind, text: "hi" });
    });

    it("treats a message with no level as informational", () => {
      expect(classify({ message: "hi" })).toMatchObject({ status: "info", kind: "activity", text: "hi" });
    });

    it("keeps an empty message rather than dumping the JSON", () => {
      expect(classify({ message: "" }).text).toBe("");
    });

    it("dumps an opaque payload as JSON", () => {
      expect(classify({ foo: 1 })).toMatchObject({ status: "info", kind: "activity", text: '{"foo":1}' });
      expect(classify({ type: "something_new", n: 2 }).text).toBe('{"type":"something_new","n":2}');
    });

    it("ignores a non-string message", () => {
      expect(classify({ message: 5 }).text).toBe('{"message":5}');
    });
  });

  it("never throws on odd field types", () => {
    const odd = [null, 0, "x", [], {}, NaN];
    for (const type of ["error", "fas_frame", "console_tx", "console_ports", "console_config", "console_serial", "console_status", undefined]) {
      for (const v of odd) {
        expect(() => classify({ type, detail: v, board_kind: v, ports: v, decoded: v, connected: v, baud: v, port: v })).not.toThrow();
      }
    }
  });
});

describe("isConsoleLine", () => {
  const entry = (msgType?: string): ConsoleLogEntry => ({ id: 1, ts: 0, status: "info", kind: "activity", text: "", msgType });

  it("shows locally-originated lines and console messages", () => {
    expect(isConsoleLine(entry(undefined))).toBe(true);
    expect(isConsoleLine(entry("console"))).toBe(true);
    expect(isConsoleLine(entry("fas_frame"))).toBe(true);
  });

  it("hides telemetry and state passthrough", () => {
    for (const t of TELEMETRY_MSG_TYPES) expect(isConsoleLine(entry(t))).toBe(false);
  });
});

describe("describeLink", () => {
  it("shows an unknown link as unknown, not as closed", () => {
    expect(describeLink(null)).toMatchObject({ status: "neutral", short: "—" });
  });

  it("shows a connected link with its port and baud", () => {
    expect(describeLink({ connected: true, port: "COM3", baud: 115200, error: null })).toEqual({
      status: "nominal",
      short: "COM3",
      detail: "Connected on COM3 @ 115200.",
    });
  });

  it("copes with a connected link that has no port or baud", () => {
    expect(describeLink({ connected: true, port: null, baud: null, error: null })).toMatchObject({
      short: "OPEN",
      detail: "Connected on ?.",
    });
  });

  it("shows an error as a fault", () => {
    expect(describeLink({ connected: false, port: "COM3", baud: null, error: "unplugged" })).toMatchObject({
      status: "error",
      short: "FAULT",
      detail: "Port COM3 is down: unplugged",
    });
  });

  it("distinguishes a closed port from no configured port", () => {
    expect(describeLink({ connected: false, port: "COM3", baud: null, error: null })).toMatchObject({ status: "warn", short: "NO PORT", detail: "Port COM3 is closed." });
    expect(describeLink({ connected: false, port: null, baud: null, error: null }).detail).toMatch(/no serial port configured/);
  });
});

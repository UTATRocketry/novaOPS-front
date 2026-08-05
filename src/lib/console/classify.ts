import type { Status } from "@/components/primitives";
import type { ConsoleKind, ConsoleLogEntry, FasSerialPort } from "./types";

/** Board-kind code → short label (mirrors FAS CAN-ID `kind` field). */
const BOARD_KINDS: Record<number, string> = {
  0: "GS",
  1: "FMC",
  2: "EPB",
  3: "IMC",
  4: "RAB",
  5: "PMB",
};

/** Map a free-text level string onto our status/kind vocabulary. */
function levelToKind(level: string): { status: Status; kind: ConsoleKind } {
  switch (level.toLowerCase()) {
    case "command":
    case "cmd":
      return { status: "nominal", kind: "command" };
    case "warn":
    case "warning":
      return { status: "warn", kind: "warning" };
    case "fatal":
    case "critical":
      return { status: "fault", kind: "fatal" };
    case "error":
    case "err":
      return { status: "error", kind: "error" };
    case "debug":
      return { status: "neutral", kind: "activity" };
    default:
      return { status: "info", kind: "activity" };
  }
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function asNumber(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}

/**
 * Extract the port list from a `console_ports` message. Entries without a
 * `device` are dropped — `device` is the only field a `configure` needs, so a
 * port we cannot address is not worth offering.
 */
export function parseConsolePorts(raw: Record<string, unknown>): FasSerialPort[] {
  const ports = Array.isArray(raw["ports"]) ? raw["ports"] : [];
  const out: FasSerialPort[] = [];
  for (const entry of ports) {
    if (!entry || typeof entry !== "object") continue;
    const o = entry as Record<string, unknown>;
    const device = asString(o["device"]);
    if (!device) continue;
    const port: FasSerialPort = { device };
    const name = asString(o["name"]);
    if (name) port.name = name;
    const description = asString(o["description"]);
    if (description) port.description = description;
    const hwid = asString(o["hwid"]);
    if (hwid) port.hwid = hwid;
    out.push(port);
  }
  return out;
}

/**
 * Classify an arbitrary inbound WebSocket message into a colour-coded console
 * line. Console messages are intentionally schema-loose (the backend rebroadcasts
 * raw MQTT `nova/console` payloads, FAS frame echoes, and acks), so every field
 * is read defensively and an unrecognised shape falls back to a JSON dump.
 */
export function classifyConsoleMessage(
  raw: Record<string, unknown>,
): Omit<ConsoleLogEntry, "id" | "ts"> {
  const type = asString(raw["type"]);
  // Tag every entry with its original WS message type so terminals can separate
  // console/log lines from structured telemetry passthrough.
  return { ...classifyBody(raw, type), msgType: type };
}

function classifyBody(
  raw: Record<string, unknown>,
  type: string | undefined,
): Omit<ConsoleLogEntry, "id" | "ts" | "msgType"> {
  switch (type) {
    // Backend `error` frame.
    case "error": {
      const detail = asString(raw["detail"]) ?? "Unknown server error";
      return { status: "error", kind: "error", text: detail, raw };
    }

    // Decoded inbound FAS frame (only while streaming is active).
    case "fas_frame": {
      const kind = asNumber(raw["board_kind"]);
      const board =
        kind !== undefined ? (BOARD_KINDS[kind] ?? `K${kind}`) : "?";
      const boardId = asNumber(raw["board_id"]) ?? 0;
      const msgType = asNumber(raw["msg_type"]);
      const dir = asString(raw["dir"]) ?? "rx";
      const decoded = raw["decoded"];
      const payload =
        decoded && typeof decoded === "object"
          ? JSON.stringify(decoded)
          : (asString(raw["data_hex"]) ?? "");
      const msgHex = msgType !== undefined ? `0x${msgType.toString(16)}` : "?";
      return {
        status: "info",
        kind: "frame",
        text: `${dir.toUpperCase()} ${board}:${boardId} msg=${msgHex} ${payload}`,
        raw,
      };
    }

    // Echo of a packet we transmitted.
    case "console_tx": {
      const ok = raw["ok"] !== false;
      if (!ok) {
        const err = asString(raw["error"]) ?? "unencodable packet";
        return { status: "error", kind: "tx", text: `TX failed: ${err}`, raw };
      }
      const frameHex = asString(raw["frame_hex"]) ?? asString(raw["data_hex"]) ?? "";
      return { status: "nominal", kind: "tx", text: `TX ok ${frameHex}`, raw };
    }

    // Result of list_ports.
    case "console_ports": {
      const ports = Array.isArray(raw["ports"]) ? raw["ports"] : [];
      const names = ports
        .map((p) => (p && typeof p === "object" ? asString((p as Record<string, unknown>)["device"]) : undefined))
        .filter(Boolean)
        .join(", ");
      return {
        status: "info",
        kind: "system",
        text: `Ports: ${names || "(none)"}`,
        raw,
      };
    }

    // Result of configure.
    case "console_config": {
      const ok = raw["ok"] !== false;
      const port = asString(raw["port"]) ?? "?";
      const baud = asNumber(raw["baud"]);
      if (!ok) {
        const err = asString(raw["error"]) ?? "could not open port";
        return { status: "error", kind: "system", text: `Configure ${port} failed: ${err}`, raw };
      }
      return {
        status: "nominal",
        kind: "system",
        text: `Configured ${port}${baud ? ` @ ${baud}` : ""}`,
        raw,
      };
    }

    // Bridge serial-link state — pushed unprompted on every link change.
    case "console_serial": {
      const connected = raw["connected"] === true;
      const port = asString(raw["port"]);
      const baud = asNumber(raw["baud"]);
      const err = asString(raw["error"]);
      if (connected) {
        return {
          status: "nominal",
          kind: "system",
          text: `Serial link up — ${port || "?"}${baud ? ` @ ${baud}` : ""}`,
          raw,
        };
      }
      return {
        status: err ? "error" : "neutral",
        kind: "system",
        text: `Serial link down${port ? ` (${port})` : ""}${err ? `: ${err}` : ""}`,
        raw,
      };
    }

    // Ack of start/stop streaming.
    case "console_status": {
      const active = raw["active"] === true;
      return {
        status: active ? "nominal" : "neutral",
        kind: "system",
        text: `Stream ${active ? "started" : "stopped"}`,
        raw,
      };
    }

    default: {
      // Generic console passthrough — may carry { level, message } or be opaque.
      const level = asString(raw["level"]);
      const message = asString(raw["message"]);
      if (message !== undefined) {
        const { status, kind } = level ? levelToKind(level) : { status: "info" as Status, kind: "activity" as ConsoleKind };
        return { status, kind, text: message, raw };
      }
      return { status: "info", kind: "activity", text: JSON.stringify(raw), raw };
    }
  }
}

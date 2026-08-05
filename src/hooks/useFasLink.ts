"use client";

import { useCallback, useState } from "react";
import { useNovaStore, sel } from "@/lib/store";
import {
  fasConfigurePort,
  fasDisconnectPort,
  fasLinkStatus,
  fasListPorts,
} from "@/lib/api";
import type { FasLink } from "@/lib/flight";
import type { FasSerialPort } from "@/lib/console";

/** Baud rates offered in the picker. The FAS bus runs at 460 800 by default. */
export const FAS_BAUD_RATES = [9600, 57600, 115200, 230400, 460800, 921600] as const;

/** Default baud for the RS-422 link, per FRONTEND_API_GUIDE.md § FAS Console. */
export const FAS_DEFAULT_BAUD = 460800;

export interface FasLinkController {
  /** Bridge link state; null = unknown (render `—`, never assume "closed"). */
  link: FasLink | null;
  /** Ports from the last `list_ports`; null = never enumerated. */
  ports: FasSerialPort[] | null;
  /** True while the bridge is streaming decoded RX frames. */
  streaming: boolean;
  /** Whether this session may issue console commands. */
  canControl: boolean;
  /** Why not, when `canControl` is false. */
  gateReason: string | null;
  /** True while a command is in flight (publish round-trip only). */
  busy: boolean;
  /** Ask the bridge to enumerate serial ports. */
  refreshPorts: () => Promise<void>;
  /** Ask the bridge to republish its link state. */
  refreshStatus: () => Promise<void>;
  /** Open `port` at `baud` on the bridge. */
  connect: (port: string, baud: number) => Promise<void>;
  /** Close the bridge's serial port. */
  disconnect: () => Promise<void>;
}

/**
 * Everything needed to drive the FAS bridge's serial link.
 *
 * The bridge starts with NO port open — it answers console commands and stays
 * on MQTT regardless — so choosing a port is an ordinary runtime action, not a
 * startup step. Commands are fire-and-acknowledge: each call resolves once the
 * command is *published*; the actual outcome arrives later over the WebSocket
 * as `console_ports` / `console_config` / `console_serial` and lands in the
 * store. Failures are surfaced on the console log, same as the Console page.
 */
export function useFasLink(): FasLinkController {
  const link = useNovaStore(sel.fasLink);
  const ports = useNovaStore(sel.fasPorts);
  const streaming = useNovaStore(sel.fasStreaming);
  const clientId = useNovaStore(sel.clientId);
  const role = useNovaStore(sel.sessionRole);
  const push = useNovaStore((s) => s.pushConsoleEntry);

  const [busy, setBusy] = useState(false);

  const canControl = (role === "operator" || role === "admin") && !!clientId;
  const gateReason = !clientId
    ? "Not connected"
    : !canControl
      ? "Operator or admin role required"
      : null;

  /** Run a console command, echoing the attempt and any failure to the console. */
  const run = useCallback(
    async (label: string, fn: (id: string) => Promise<unknown>) => {
      if (!clientId) return;
      push({ status: "info", kind: "command", text: `» ${label}` });
      setBusy(true);
      try {
        await fn(clientId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        push({ status: "error", kind: "error", text: `✗ ${label}: ${msg}` });
      } finally {
        setBusy(false);
      }
    },
    [clientId, push],
  );

  const refreshPorts = useCallback(
    () => run("console list_ports", fasListPorts),
    [run],
  );

  const refreshStatus = useCallback(
    () => run("console status", fasLinkStatus),
    [run],
  );

  const connect = useCallback(
    (port: string, baud: number) =>
      run(`console configure ${port} @ ${baud}`, (id) =>
        fasConfigurePort(port, baud, id),
      ),
    [run],
  );

  const disconnect = useCallback(
    () => run("console disconnect", fasDisconnectPort),
    [run],
  );

  return {
    link,
    ports,
    streaming,
    canControl,
    gateReason,
    busy,
    refreshPorts,
    refreshStatus,
    connect,
    disconnect,
  };
}

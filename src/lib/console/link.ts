import type { Status } from "@/components/primitives";
import type { FasLink } from "../flight/types";

/** How a FAS link state should be presented. */
export interface FasLinkDisplay {
  status: Status;
  /** Compact label for a status bar. */
  short: string;
  /** Full sentence for a panel. */
  detail: string;
}

/**
 * Map the bridge's serial-link state onto our status vocabulary.
 *
 * `link === null` is UNKNOWN, not "disconnected": nothing has been received yet
 * (or the socket dropped). It renders `—` — an unknown link must never be shown
 * as a known-closed one.
 */
export function describeLink(link: FasLink | null): FasLinkDisplay {
  if (link === null) {
    return {
      status: "neutral",
      short: "—",
      detail: "Link state unknown — no report from the bridge yet.",
    };
  }
  if (link.connected) {
    const at = link.baud !== null ? ` @ ${link.baud}` : "";
    return {
      status: "nominal",
      short: link.port ?? "OPEN",
      detail: `Connected on ${link.port ?? "?"}${at}.`,
    };
  }
  if (link.error) {
    return {
      status: "error",
      short: "FAULT",
      detail: `Port ${link.port ?? "?"} is down: ${link.error}`,
    };
  }
  return {
    status: "warn",
    short: "NO PORT",
    detail: link.port
      ? `Port ${link.port} is closed.`
      : "The bridge is running with no serial port configured.",
  };
}

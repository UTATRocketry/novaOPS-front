/**
 * Pi node runtime reports, as the backend forwards them over the WebSocket
 * (and `GET /api/nodes`). novaGround (and novaThermo, novaSim) publish three
 * messages per node; the backend keeps the latest of each and sends:
 *
 *  - `node_stats_info` `{ node, info }`  from retained `nova/stats/<node>/info`:
 *    build id, start time, stats interval, actuation (enabled | stopped), the
 *    hardware report and the configured loop periods.
 *  - `node_stats`      `{ node, stats }` from `nova/stats/<node>` (not retained,
 *    every --stats-ms): uptime, loop periods, command latencies, error counters.
 *    The backend sends `stats: null` when a node stops publishing (stale).
 *  - `node_state`      `{ node, state }` from retained `nova/state/<node>`: what
 *    the relays, servos and GPIO outputs hold, read back from the drivers.
 *
 * `null` for any of them means the node cleared it (or, for stats, went quiet).
 * All parsing of these shapes lives here.
 */

export interface NodeHardwarePart {
  expected: boolean;
  found: boolean;
  detail: string | null;
}

/** What the build expects to find on its Pi, against what it found. */
export interface NodeHardware {
  build_id: string | null;
  /** gpio | daq | relays | servo, in the order the Pi lists them. */
  parts: Record<string, NodeHardwarePart>;
  /** Expected parts that weren't found. Each is an error. */
  missing: string[];
}

export interface NodeInfo {
  build_id: string | null;
  started_ms: number | null;
  stats_interval_ms: number | null;
  /** "enabled", or "stopped" under --stop-actuate (output writes are dropped). */
  actuation: string | null;
  hardware: NodeHardware | null;
  /** Loop name -> configured period. */
  loops: Record<string, { configured_ms: number | null }>;
}

export interface StatSummary {
  count: number;
  min: number;
  p50: number;
  p99: number;
  max: number;
}

/** The same measurement since the last stats message and since start. */
export interface StatReport {
  last: StatSummary | null;
  total: StatSummary | null;
}

export interface NodeLoopStats {
  ticks: number | null;
  overruns: number | null;
  period_ms: StatReport;
}

export interface NodeCommandStats {
  count: number | null;
  received_to_handled_ms: StatReport;
  received_to_done_ms: StatReport;
}

export interface NodeStats {
  seq: number | null;
  time_ms: number | null;
  uptime_s: number | null;
  loops: Record<string, NodeLoopStats>;
  commands: Record<string, NodeCommandStats>;
  /** Every other numeric field: publish_failures, daq_read_errors, ... (since start). */
  counters: Record<string, number>;
}

export interface NodeRelayState {
  ok: boolean;
  /** Bit i is relay i (the relay command's id). Absent when the read failed. */
  mask: number | null;
}

export interface NodeServoChannel {
  id: number;
  /** off | on | pulse | unreadable */
  output: string;
  pulse_us: number | null;
}

export interface NodeGpioOutput {
  pin: number;
  level: number;
}

export interface NodeState {
  time_ms: number | null;
  /** Null when the node has no such hardware (left out of the message). */
  relays: NodeRelayState | null;
  servos: { ok: boolean; channels: NodeServoChannel[] } | null;
  gpios: { ok: boolean; outputs: NodeGpioOutput[] } | null;
}

/** Everything the backend has sent about one node. */
export interface NodeRecord {
  info: NodeInfo | null;
  stats: NodeStats | null;
  state: NodeState | null;
}

export type NodePart = keyof NodeRecord;

// ---------------------------------------------------------------------------

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function parseSummary(v: unknown): StatSummary | null {
  if (!isObj(v)) return null;
  const count = num(v.count);
  if (count == null) return null;
  return { count, min: num(v.min) ?? 0, p50: num(v.p50) ?? 0, p99: num(v.p99) ?? 0, max: num(v.max) ?? 0 };
}

function parseReport(v: unknown): StatReport {
  if (!isObj(v)) return { last: null, total: null };
  return { last: parseSummary(v.last), total: parseSummary(v.total) };
}

export function parseNodeHardware(v: unknown): NodeHardware | null {
  if (!isObj(v)) return null;
  const parts: Record<string, NodeHardwarePart> = {};
  if (isObj(v.parts)) {
    for (const [name, p] of Object.entries(v.parts)) {
      if (!isObj(p)) continue;
      parts[name] = { expected: p.expected === true, found: p.found === true, detail: str(p.detail) };
    }
  }
  const listed = Array.isArray(v.missing) ? v.missing.filter((m): m is string => typeof m === "string") : [];
  // The Pi lists them, but an expected part that wasn't found is missing either way.
  const derived = Object.entries(parts).filter(([, p]) => p.expected && !p.found).map(([n]) => n);
  return { build_id: str(v.build_id), parts, missing: Array.from(new Set([...listed, ...derived])) };
}

export function parseNodeInfo(v: unknown): NodeInfo | null {
  if (!isObj(v)) return null;
  const loops: NodeInfo["loops"] = {};
  if (isObj(v.loops)) {
    for (const [name, l] of Object.entries(v.loops)) loops[name] = { configured_ms: isObj(l) ? num(l.configured_ms) : null };
  }
  return {
    build_id: str(v.build_id),
    started_ms: num(v.started_ms),
    stats_interval_ms: num(v.stats_interval_ms),
    actuation: str(v.actuation),
    hardware: parseNodeHardware(v.hardware),
    loops,
  };
}

const STATS_FIELDS = new Set(["seq", "time_ms", "uptime_s", "loops", "commands", "schema"]);

export function parseNodeStats(v: unknown): NodeStats | null {
  if (!isObj(v)) return null;
  const loops: Record<string, NodeLoopStats> = {};
  if (isObj(v.loops)) {
    for (const [name, l] of Object.entries(v.loops)) {
      if (!isObj(l)) continue;
      loops[name] = { ticks: num(l.ticks), overruns: num(l.overruns), period_ms: parseReport(l.period_ms) };
    }
  }
  const commands: Record<string, NodeCommandStats> = {};
  if (isObj(v.commands)) {
    for (const [type, c] of Object.entries(v.commands)) {
      if (!isObj(c)) continue;
      commands[type] = {
        count: num(c.count),
        received_to_handled_ms: parseReport(c.received_to_handled_ms),
        received_to_done_ms: parseReport(c.received_to_done_ms),
      };
    }
  }
  const counters: Record<string, number> = {};
  for (const [k, val] of Object.entries(v)) {
    const n = num(val);
    if (!STATS_FIELDS.has(k) && n != null) counters[k] = n;
  }
  return { seq: num(v.seq), time_ms: num(v.time_ms), uptime_s: num(v.uptime_s), loops, commands, counters };
}

export function parseNodeState(v: unknown): NodeState | null {
  if (!isObj(v)) return null;
  const relays = isObj(v.relays) ? { ok: v.relays.ok === true, mask: num(v.relays.mask) } : null;
  const servos = isObj(v.servos)
    ? {
        ok: v.servos.ok === true,
        channels: (Array.isArray(v.servos.channels) ? v.servos.channels : []).filter(isObj).map((c) => ({
          id: num(c.id) ?? -1,
          output: str(c.output) ?? "unreadable",
          pulse_us: num(c.pulse_us),
        })),
      }
    : null;
  const gpios = isObj(v.gpios)
    ? {
        ok: v.gpios.ok === true,
        outputs: (Array.isArray(v.gpios.outputs) ? v.gpios.outputs : [])
          .filter(isObj)
          .map((g) => ({ pin: num(g.pin_id) ?? -1, level: num(g.state) ?? -1 })),
      }
    : null;
  return { time_ms: num(v.time_ms), relays, servos, gpios };
}

/**
 * Parse a `node_stats_info` / `node_stats` / `node_state` WS message into the
 * part it updates. Null when it isn't one of them or has no node name. A null
 * `value` means the part was cleared.
 */
export function parseNodeMessage(
  m: Record<string, unknown>,
): { node: string; part: NodePart; value: NodeInfo | NodeStats | NodeState | null } | null {
  const node = str(m.node);
  if (!node) return null;
  switch (m.type) {
    case "node_stats_info":
      return { node, part: "info", value: parseNodeInfo(m.info) };
    case "node_stats":
      return { node, part: "stats", value: parseNodeStats(m.stats) };
    case "node_state":
      return { node, part: "state", value: parseNodeState(m.state) };
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Derived views
// ---------------------------------------------------------------------------

export type NodeLink = "online" | "offline" | "unknown";

/**
 * Whether a node is reporting. Stats arrive every interval and the backend
 * drops them when they stop, so stats = online. The info message is retained
 * and only sent with stats on, so info without stats = it went quiet. Nothing
 * at all = unknown (never heard from, or stats off on that node).
 */
export function nodeLink(record: NodeRecord | null | undefined): NodeLink {
  if (!record) return "unknown";
  if (record.stats) return "online";
  if (record.info) return "offline";
  return "unknown";
}

/** Readable name of a stats counter: "daq_read_errors" -> "DAQ read errors". */
export function counterLabel(key: string): string {
  const text = key.replace(/_/g, " ");
  return text.replace(/\b(daq|gpio|mqtt)\b/gi, (w) => w.toUpperCase()).replace(/^./, (c) => c.toUpperCase());
}

/** Counters where any non-zero value is a problem (stopped writes are by design). */
export const ERROR_COUNTERS = new Set([
  "publish_failures",
  "daq_read_errors",
  "actuator_read_errors",
  "gpio_claim_failures",
  "gpio_write_failures",
  "refused_commands",
  "output_trips",
]);

const PART_LABELS: Record<string, string> = {
  gpio: "GPIO (gpiochip0)",
  daq: "DAQ HATs",
  relays: "relay board (TCA9535)",
  servo: "servo driver (PCA9685)",
};

export function hardwarePartLabel(name: string): string {
  return PART_LABELS[name] ?? name;
}

/** Relay bit i of the read-back mask; null when unknown. */
export function relayLevel(mask: number | null, channel: number): number | null {
  if (mask == null) return null;
  return Math.floor(mask / 2 ** channel) % 2;
}

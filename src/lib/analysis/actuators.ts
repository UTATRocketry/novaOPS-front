/**
 * Actuation events from a `*_actuators.csv` log.
 *
 * The ground station writes one row every time something is commanded, and each
 * row is a *full snapshot* of every hardware channel plus a `type_id` naming the
 * family that moved:
 *
 * ```
 * timestamp,gpio_17,…,relay_0,…,relay_15,servo_0,…,servo_15,type_id
 * 1782620865671,0,…,1,…,1,0,…,0,start_data_saving
 * 1782620878097,0,…,0,…,1,0,…,0,relay
 * 1782620878906,0,…,0,…,1,0,…,1900,servo
 * ```
 *
 * Individual events are therefore recovered by diffing consecutive rows: the
 * `type_id` says which family, the diff says exactly which channel and to what.
 * Channels are then mapped onto configured actuator names through
 * `Actuators[].binding` — matched on the log's own target, because a relay
 * channel number is only unique *within* a subsystem (GCS `relay_0` and FAS
 * `relay_0` are different hardware).
 */

import type { ActuatorEntry, SourceTarget } from "@/lib/types";
import type { ActuationEvent, ActuationKind, ActuatorLog, DataSource } from "./types";
import { CsvFormatError } from "./csv";

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const CHANNEL_RE = /^(relay|servo|gpio)_(\d+)$/i;

function splitLine(line: string): string[] {
  return line.includes('"')
    ? // Actuator logs are machine-written and never quote, but stay tolerant.
      (line.match(/("[^"]*"|[^,]*)(,|$)/g) ?? []).map((s) =>
        s.replace(/,$/, "").replace(/^"|"$/g, ""),
      )
    : line.split(",");
}

function contentLines(text: string): string[] {
  const stripped = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  return stripped.split(/\r?\n/).filter((l) => l.trim() !== "");
}

/** Parse an actuator state log into per-channel columns. */
export function parseActuatorCsv(text: string, source: DataSource): ActuatorLog {
  const lines = contentLines(text);
  if (lines.length < 2) throw new CsvFormatError("Actuator CSV has no data rows.");

  const headers = lines[0].split(",").map((h) => h.trim());
  const lower = headers.map((h) => h.toLowerCase());
  const iTs = lower.findIndex((h) => h === "timestamp" || h === "timestamp_ms");
  if (iTs < 0) {
    throw new CsvFormatError(
      `Actuator CSV has no 'timestamp' column. Found: ${headers.join(", ")}`,
    );
  }
  const iType = lower.indexOf("type_id");

  const channelIdx: number[] = [];
  headers.forEach((h, i) => {
    if (CHANNEL_RE.test(h)) channelIdx.push(i);
  });
  if (channelIdx.length === 0) {
    throw new CsvFormatError(
      "Actuator CSV has no relay_/servo_/gpio_ channel columns.",
    );
  }

  const rowCount = lines.length - 1;
  const timestamp = new Float64Array(rowCount);
  const values = channelIdx.map(() => new Float64Array(rowCount).fill(NaN));
  const typeIds: string[] = new Array(rowCount).fill("");

  for (let r = 0; r < rowCount; r++) {
    const cells = splitLine(lines[r + 1]);
    timestamp[r] = Number(cells[iTs]);
    if (iType >= 0) typeIds[r] = (cells[iType] ?? "").trim();
    channelIdx.forEach((c, k) => {
      const raw = (cells[c] ?? "").trim();
      values[k][r] = raw === "" ? NaN : Number(raw);
    });
  }

  return {
    source,
    timestamp,
    channels: channelIdx.map((c, k) => ({ key: headers[c], values: values[k] })),
    typeIds,
    rowCount,
  };
}

// ---------------------------------------------------------------------------
// Channel -> actuator mapping
// ---------------------------------------------------------------------------

/** A subsystem's log only ever describes actuators bound to that subsystem. */
function targetMatches(target: SourceTarget | undefined, source: DataSource): boolean {
  return (target ?? "GCS") === source;
}

interface ChannelOwner {
  actuator: ActuatorEntry;
  /** Whether this channel drives the actuator's position or its power relay. */
  role: "position" | "power";
}

/**
 * Index the configured actuators by the hardware channel they occupy.
 *
 * A servo-type actuator claims two channels: `servo_N` carries its commanded
 * position and `relay_M` gates its power. Both map back to the same actuator,
 * but they mean different things, so the role is recorded alongside.
 */
export function buildChannelOwners(
  actuators: ActuatorEntry[],
  source: DataSource,
): Map<string, ChannelOwner> {
  const owners = new Map<string, ChannelOwner>();
  for (const actuator of actuators) {
    const binding = actuator.binding;
    if (!targetMatches(binding?.target, source)) continue;

    const servo = binding?.servo_channel;
    if (servo != null) owners.set(`servo_${servo}`, { actuator, role: "position" });

    const relay = binding?.relay_channel;
    if (relay != null) {
      const key = `relay_${relay}`;
      // A relay is a position channel in its own right for non-servo actuators;
      // for a servo it is only the power rail. Do not let a servo's power relay
      // displace a solenoid that genuinely owns that relay channel.
      const role: ChannelOwner["role"] = servo != null ? "power" : "position";
      const existing = owners.get(key);
      if (!existing || (existing.role === "power" && role === "position")) {
        owners.set(key, { actuator, role });
      }
    }
  }
  return owners;
}

// ---------------------------------------------------------------------------
// State decoding
// ---------------------------------------------------------------------------

/**
 * Name a servo's commanded position.
 *
 * `actions.positions` and `actions.position_aliases` are parallel arrays, so an
 * exact pulse-width match resolves to its alias (900 -> "open"). A zero pulse
 * means the channel was released rather than driven to a position; anything
 * else is reported as the raw pulse width, never guessed at.
 */
function describeServo(value: number, actuator: ActuatorEntry | null): string {
  if (!Number.isFinite(value)) return "—";
  if (value === 0) return "released";
  const positions = actuator?.actions?.positions;
  const aliases = actuator?.actions?.position_aliases;
  if (positions && aliases) {
    const i = positions.findIndex((p) => p === value);
    if (i >= 0 && i < aliases.length) return aliases[i];
  }
  return `${value} µs`;
}

/**
 * Name a relay's state.
 *
 * The channel value is reported as read — `1` is "on", `0` is "off". No
 * active-low inversion is applied: the config expresses `relay_type` as a
 * resting-state convention, not a wiring polarity, so inferring one would be
 * guessing about hardware. For a solenoid the resulting flow state *is*
 * derivable from `solenoid_type` and is appended.
 */
function describeRelay(value: number, actuator: ActuatorEntry | null): string {
  if (!Number.isFinite(value)) return "—";
  const on = value !== 0;
  const base = on ? "on" : "off";
  if (actuator?.type !== "solenoid") return base;
  const solenoid = actuator.actions?.solenoid_type;
  if (solenoid === "nominally_closed") return `${base} · ${on ? "open" : "closed"}`;
  if (solenoid === "nominally_open") return `${base} · ${on ? "closed" : "open"}`;
  return base;
}

function describeGpio(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return value !== 0 ? "high" : "low";
}

function describe(
  kind: ActuationKind,
  value: number,
  actuator: ActuatorEntry | null,
  role: ChannelOwner["role"],
): string {
  if (kind === "servo") return describeServo(value, actuator);
  if (kind === "gpio") return describeGpio(value);
  const relay = describeRelay(value, actuator);
  // A servo's power relay reads as on/off regardless of the servo's own aliases.
  return role === "power" ? `power ${relay}` : relay;
}

function kindOf(channel: string): ActuationKind {
  const m = CHANNEL_RE.exec(channel);
  const family = m?.[1].toLowerCase();
  return family === "servo" ? "servo" : family === "gpio" ? "gpio" : "relay";
}

// ---------------------------------------------------------------------------
// Event derivation
// ---------------------------------------------------------------------------

export interface DeriveEventsOptions {
  /** Config actuators used to name channels. */
  actuators: ActuatorEntry[];
  /**
   * Maps an event's epoch-ms stamp onto the dataset's elapsed axis. Returns
   * null when the event falls outside the loaded capture.
   */
  toElapsed: (epochMs: number) => { elapsed: number; outside: boolean } | null;
  /** Emit events for channels that no configured actuator claims. */
  includeUnmapped?: boolean;
}

/**
 * Turn an actuator state log into discrete events by diffing consecutive rows.
 *
 * The first row establishes the baseline state and is emitted only as a
 * `recording` marker — it says what the rig was already set to, not that
 * anything was commanded at that instant.
 */
export function deriveActuationEvents(
  log: ActuatorLog,
  { actuators, toElapsed, includeUnmapped = true }: DeriveEventsOptions,
): ActuationEvent[] {
  const owners = buildChannelOwners(actuators, log.source);
  const events: ActuationEvent[] = [];
  let seq = 0;

  const place = (epochMs: number) => toElapsed(epochMs);

  for (let r = 0; r < log.rowCount; r++) {
    const epochMs = log.timestamp[r];
    if (!Number.isFinite(epochMs)) continue;
    const placed = place(epochMs);
    if (!placed) continue;
    const typeId = log.typeIds[r] ?? "";

    if (r === 0) {
      events.push({
        id: `evt-${seq++}`,
        epochMs,
        elapsed: placed.elapsed,
        kind: "recording",
        channel: "—",
        actuator: null,
        actuatorType: null,
        state: typeId || "baseline",
        previousState: null,
        value: NaN,
        previousValue: null,
        typeId,
        outsideCapture: placed.outside,
      });
      continue;
    }

    // A row with no channel change is a marker (e.g. stop_data_saving).
    let changed = false;
    for (const col of log.channels) {
      const now = col.values[r];
      const before = col.values[r - 1];
      if (now === before || (Number.isNaN(now) && Number.isNaN(before))) continue;

      const owner = owners.get(col.key) ?? null;
      if (!owner && !includeUnmapped) continue;
      changed = true;

      const kind = kindOf(col.key);
      const actuator = owner?.actuator ?? null;
      const role = owner?.role ?? "position";
      events.push({
        id: `evt-${seq++}`,
        epochMs,
        elapsed: placed.elapsed,
        kind,
        channel: col.key,
        actuator: actuator?.name ?? null,
        actuatorType: actuator?.type ?? null,
        state: describe(kind, now, actuator, role),
        previousState: describe(kind, before, actuator, role),
        value: now,
        previousValue: Number.isFinite(before) ? before : null,
        typeId,
        outsideCapture: placed.outside,
      });
    }

    if (!changed && typeId && typeId !== log.typeIds[r - 1]) {
      events.push({
        id: `evt-${seq++}`,
        epochMs,
        elapsed: placed.elapsed,
        kind: "recording",
        channel: "—",
        actuator: null,
        actuatorType: null,
        state: typeId,
        previousState: null,
        value: NaN,
        previousValue: null,
        typeId,
        outsideCapture: placed.outside,
      });
    }
  }

  events.sort((a, b) => a.elapsed - b.elapsed);
  return events;
}

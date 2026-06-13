/**
 * Actuator control model.
 *
 * `deriveControls(entry)` is the single source of truth for which control
 * segments an actuator exposes. Both the P&ID bridge (JointJS) and the Engine
 * table (React) share this function so the two surfaces always show identical
 * controls for the same actuator.
 *
 * IMPORTANT — command verb vs reported state:
 *   The backend ACCEPTS imperative command verbs ("enable", "arm", "on") but
 *   REPORTS adjective/past-tense states ("enabled", "armed", "on"). Each option
 *   therefore carries BOTH `command` (what we send) and `match[]` (the set of
 *   reported strings that mean this option is the active one). This is what lets
 *   the live face highlight correctly even though the words differ.
 *
 * Colour codes per the ops spec:
 *   position: open=nominal(green) / closed=fault(red)
 *   enable:   enabled=info(blue)  / disabled=neutral
 *   power:    on=nominal(green)   / off=fault(red)
 *   arming:   armed=nominal(green)/ disarmed=fault(red)
 */
import type { ActuatorEntry, ActuatorState } from "../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SegmentKind = "position" | "enable" | "power" | "arming";

export type SegmentColor = "nominal" | "fault" | "info" | "warn" | "neutral";

export interface ControlOption {
  /** Display text, e.g. "CLOSED". */
  label: string;
  /** Command state string sent to the backend, e.g. "closed". */
  command: string;
  /** Reported-state strings (lowercased) that mean this option is active. */
  match: string[];
  /** Colour when this option is the active state. */
  activeColor: SegmentColor;
}

export interface ControlSegment {
  kind: SegmentKind;
  options: ControlOption[];
}

/**
 * A single rendered button in a control row.
 * - Binary axes (open/closed, enable, power, arming) → ONE button showing the
 *   current state; clicking sends `command` (the opposite).
 * - Multi-position axes (3+ options, e.g. F/N/D) → one button PER option, the
 *   active one highlighted; clicking sends that option's `command`.
 */
export interface ControlButton {
  label: string;
  command: string;
  active: boolean;
  color: SegmentColor;
  kind: SegmentKind;
}

const AXIS_LABEL: Record<SegmentKind, string> = {
  position: "POS",
  enable:   "ENABLE",
  power:    "POWER",
  arming:   "ARM",
};

/** [bgFill, textFill, strokeColour] hex for a control colour (SVG-safe). */
export function segmentFaceColours(colour: SegmentColor): [string, string, string] {
  switch (colour) {
    case "nominal": return ["rgba(34,197,94,0.18)",  "#22c55e", "rgba(34,197,94,0.55)"];
    case "fault":   return ["rgba(239,68,68,0.18)",  "#ef4444", "rgba(239,68,68,0.55)"];
    case "info":    return ["rgba(59,130,246,0.18)", "#3b82f6", "rgba(59,130,246,0.55)"];
    case "warn":    return ["rgba(245,158,11,0.18)", "#f59e0b", "rgba(245,158,11,0.55)"];
    // Neutral/idle: no filled box (transparent), just a faint outline + muted text.
    default:        return ["transparent", "#94a0b3", "rgba(148,160,179,0.30)"];
  }
}

/** Build ready-to-render button faces for an actuator + state (null = idle). */
export function controlButtonFaces(
  entry: ActuatorEntry,
  state: ActuatorState | null,
): { label: string; bgFill: string; textFill: string; stroke: string }[] {
  return computeButtons(entry, state).map((b) => {
    const [bgFill, textFill, stroke] = segmentFaceColours(b.color);
    return { label: b.label, bgFill, textFill, stroke };
  });
}

/** Pixel width of a control button for a given label (shared by render + hit-test). */
export const CONTROL_GAP = 4;
export function buttonWidth(label: string): number {
  return Math.max(34, label.length * 10 + 18);
}
export function layoutButtons(labels: string[]): { x: number; w: number }[] {
  const out: { x: number; w: number }[] = [];
  let x = CONTROL_GAP;
  for (const label of labels) {
    const w = buttonWidth(label);
    out.push({ x, w });
    x += w + CONTROL_GAP;
  }
  return out;
}
export function totalButtonsWidth(labels: string[]): number {
  const boxes = layoutButtons(labels);
  if (boxes.length === 0) return CONTROL_GAP * 2 + 60;
  const last = boxes[boxes.length - 1];
  return last.x + last.w + CONTROL_GAP;
}
/** Which button index contains a local x-coordinate (−1 if none). */
export function buttonIndexAtX(labels: string[], localX: number): number {
  const boxes = layoutButtons(labels);
  for (let i = 0; i < boxes.length; i++) {
    if (localX >= boxes[i].x && localX <= boxes[i].x + boxes[i].w) return i;
  }
  // Past the right edge → clamp to the last button.
  return boxes.length > 0 ? boxes.length - 1 : -1;
}

/**
 * Flatten an actuator's control axes into a row of renderable/clickable buttons.
 * `state` null → idle faces (axis names, neutral colour).
 */
export function computeButtons(entry: ActuatorEntry, state: ActuatorState | null): ControlButton[] {
  const buttons: ControlButton[] = [];
  for (const seg of deriveControls(entry)) {
    if (seg.options.length <= 2) {
      const current = activeOption(seg, state);
      if (current) {
        const target = nextOption(seg, current);
        buttons.push({ label: current.label, command: target.command, active: true, color: current.activeColor, kind: seg.kind });
      } else {
        buttons.push({ label: AXIS_LABEL[seg.kind], command: seg.options[0].command, active: false, color: "neutral", kind: seg.kind });
      }
    } else {
      const current = activeOption(seg, state);
      for (const opt of seg.options) {
        const isActive = current?.command === opt.command;
        buttons.push({
          label: opt.label,
          command: opt.command,
          active: isActive,
          color: isActive ? opt.activeColor : "neutral",
          kind: seg.kind,
        });
      }
    }
  }
  return buttons;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Derive the ordered list of control segments for an actuator.
 * Segment order: enable → power → position → arming.
 */
export function deriveControls(entry: ActuatorEntry): ControlSegment[] {
  const segments: ControlSegment[] = [];
  const actions = entry.actions;

  switch (entry.type) {
    case "solenoid":
      segments.push(positionSegment(actions?.position_aliases));
      break;

    case "servo":
      segments.push(positionSegment(actions?.position_aliases));
      segments.push(enableSegment());
      if (entry.binding.relay_channel != null) segments.push(powerSegment());
      break;

    case "powered_device":
      segments.push(powerSegment());
      break;

    case "powered_gpio_device":
      segments.push(armingSegment());
      segments.push(powerSegment());
      break;

    case "gpio_device":
      segments.push(armingSegment());
      break;

    default:
      if (actions?.gpio_commands && actions.gpio_commands.length > 0) {
        segments.push(armingSegment());
      } else {
        segments.push(positionSegment(actions?.position_aliases));
      }
      break;
  }

  return segments;
}

/** Read the raw reported value for a segment kind from an actuator state. */
export function rawValueForKind(kind: SegmentKind, state: ActuatorState | null): string | undefined {
  if (!state) return undefined;
  switch (kind) {
    case "position": return state.position ?? state.state;
    case "enable":   return state.enable;
    case "power":    return state.power;
    case "arming":   return state.arming;
  }
}

/**
 * Given a segment and the live actuator state, return whichever option is
 * currently active, or null if unknown.
 */
export function activeOption(
  segment: ControlSegment,
  state: ActuatorState | null,
): ControlOption | null {
  const rawValue = rawValueForKind(segment.kind, state);
  if (!rawValue) return null;

  const lower = rawValue.toLowerCase();
  const matched = segment.options.find((o) => o.match.includes(lower));
  if (matched) return matched;

  // Recognised value not in our option set — synthesise a neutral option so the
  // live face still shows the real reported state rather than hiding it.
  return { label: rawValue.toUpperCase(), command: rawValue, match: [lower], activeColor: "neutral" };
}

/**
 * Given a segment and a current active option, return the next option to send
 * when the user clicks to toggle. For 2-option segments this cycles.
 */
export function nextOption(
  segment: ControlSegment,
  current: ControlOption | null,
): ControlOption {
  if (!current) return segment.options[0];
  const idx = segment.options.findIndex((o) => o.command === current.command);
  if (idx === -1) return segment.options[0];
  return segment.options[(idx + 1) % segment.options.length];
}

// ---------------------------------------------------------------------------
// Segment builders
// ---------------------------------------------------------------------------

function positionSegment(aliases?: string[]): ControlSegment {
  if (aliases && aliases.length > 2) {
    return {
      kind: "position",
      options: aliases.map((alias, i) => ({
        label: alias.toUpperCase(),
        command: alias,
        match: [alias.toLowerCase()],
        activeColor: "nominal", //i === 0 ? "nominal" : i === 1 ? "fault" : "neutral",
      })),
    };
  }
  return {
    kind: "position",
    options: [
      { label: "OPEN",   command: "open",   match: ["open", "opened", "1", "true"],   activeColor: "nominal" },
      { label: "CLOSED", command: "closed", match: ["closed", "close", "0", "false"], activeColor: "fault"   },
    ],
  };
}

function enableSegment(): ControlSegment {
  return {
    kind: "enable",
    options: [
      { label: "ENABLED",  command: "enable",  match: ["enable", "enabled", "on", "true", "1"],     activeColor: "info"    },
      { label: "DISABLED", command: "disable", match: ["disable", "disabled", "off", "false", "0"], activeColor: "neutral" },
    ],
  };
}

function powerSegment(): ControlSegment {
  return {
    kind: "power",
    options: [
      { label: "ON",  command: "on",  match: ["on", "enabled", "powered", "true", "1"],     activeColor: "nominal" },
      { label: "OFF", command: "off", match: ["off", "disabled", "unpowered", "false", "0"], activeColor: "fault"  },
    ],
  };
}

function armingSegment(): ControlSegment {
  return {
    kind: "arming",
    options: [
      { label: "ARMED",    command: "arm",    match: ["arm", "armed", "true", "1"],      activeColor: "nominal" },
      { label: "DISARMED", command: "disarm", match: ["disarm", "disarmed", "false", "0"], activeColor: "fault" },
    ],
  };
}

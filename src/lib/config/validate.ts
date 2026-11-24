import type {
  ActuatorEntry,
  ActuatorType,
  SensorEntry,
  SensorType,
  SourceTarget,
  SystemConfig,
} from "../types";
import {
  DEFAULT_ON_COMMS_LOSS,
  HEARTBEAT_TIMEOUT_MAX_MS,
  HEARTBEAT_TIMEOUT_MIN_MS,
  ON_COMMS_LOSS,
  TC_TYPES,
  isPiGpioActuator,
  isPiTarget,
  piPinProblem,
  supportsOutputLimits,
} from "./piIo";

/**
 * Manual schema validation for SystemConfig, mirroring the shapes in
 * `src/lib/types.ts`. The Config page is the only writer to backend config, so
 * everything is checked here before a PUT/PATCH to avoid pushing a malformed
 * config to the control surface. Returns a list of human-readable errors; an
 * empty list means the config is safe to send.
 */

const SENSOR_TYPES: SensorType[] = ["PT", "LC", "TC", "DI"];
const ACTUATOR_TYPES: ActuatorType[] = [
  "servo",
  "solenoid",
  "powered_device",
  "powered_gpio_device",
  "gpio_device",
  "motor",
];
const SOURCES: SourceTarget[] = ["GCS", "FAS", "TCS", "OPS"];
const SOURCE_LIST = SOURCES.join(", ");
/** Actuator targets with a command path. `OPS` has none, so the backend rejects it. */
const ACTUATOR_TARGETS: SourceTarget[] = ["GCS", "FAS", "TCS"];

/** One GPIO pin claimed by a config entry, for the per-Pi duplicate check. */
interface PinClaim {
  target: "GCS" | "TCS";
  pin: number;
  what: string;
  /** Outputs may share a pin (the backend merges their limits); inputs may not. */
  kind: "input" | "output";
}

function isNonEmpty(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function validateSensor(s: SensorEntry, i: number, errors: string[], seen: Set<string>, pins?: PinClaim[]) {
  const tag = `Sensor #${i + 1}`;
  if (!isNonEmpty(s.name)) errors.push(`${tag}: name is required.`);
  else if (seen.has(s.name)) errors.push(`${tag}: duplicate name "${s.name}".`);
  else seen.add(s.name);

  if (!SENSOR_TYPES.includes(s.type)) {
    errors.push(`${tag} (${s.name || "?"}): type must be one of ${SENSOR_TYPES.join(", ")}.`);
  }

  const b = s.binding;
  if (!b || typeof b !== "object") {
    errors.push(`${tag} (${s.name || "?"}): binding is required.`);
    return;
  }
  // Loosely typed view: the checks below must hold even for a config that
  // doesn't match the TypeScript union (it came off the wire).
  const raw = b as unknown as Record<string, unknown>;
  if (s.type === "DI") {
    // A digital input is a Pi GPIO pin, not a DAQ channel.
    if (b.source !== "GCS" && b.source !== "TCS") {
      errors.push(`${tag} (${s.name}): DI binding.source must be GCS or TCS.`);
    } else if (typeof raw.gpio_channel !== "number") {
      errors.push(`${tag} (${s.name}): DI sensor needs a GPIO pin (binding.gpio_channel).`);
    } else {
      const problem = piPinProblem(raw.gpio_channel);
      if (problem) errors.push(`${tag} (${s.name}): gpio_channel ${problem}.`);
      else pins?.push({ target: b.source, pin: raw.gpio_channel, what: `sensor "${s.name}"`, kind: "input" });
    }
  } else if (raw.gpio_channel != null) {
    errors.push(`${tag} (${s.name}): only DI sensors take binding.gpio_channel.`);
  } else if (b.source === "FAS") {
    if (!isNonEmpty(b.node)) errors.push(`${tag} (${s.name}): FAS binding requires node.`);
    if (typeof b.channel !== "number") errors.push(`${tag} (${s.name}): FAS binding requires numeric channel.`);
  } else if (b.source === "GCS" || b.source === "TCS") {
    if (typeof raw.hat_id !== "number") errors.push(`${tag} (${s.name}): ${b.source} binding requires numeric hat_id.`);
    if (typeof raw.channel_id !== "number") errors.push(`${tag} (${s.name}): ${b.source} binding requires numeric channel_id.`);
  } else {
    errors.push(`${tag} (${s.name}): binding.source must be GCS, TCS, or FAS.`);
  }

  // Thermocouple type: only the Pi's MCC 134 takes one; the FAS firmware sets its own.
  if (s.tc_type != null) {
    if (!TC_TYPES.includes(s.tc_type)) {
      errors.push(`${tag} (${s.name}): tc_type must be one of ${TC_TYPES.join(", ")}.`);
    } else if (s.type !== "TC" || !isPiTarget(b.source)) {
      errors.push(`${tag} (${s.name}): tc_type is only allowed on TC sensors bound to GCS or TCS.`);
    }
  }

  if (s.convert?.calibration) {
    const cal = s.convert.calibration;
    if (!Array.isArray(cal) || cal.some((p) => !Array.isArray(p) || p.length !== 2 || p.some((n) => typeof n !== "number"))) {
      errors.push(`${tag} (${s.name}): calibration must be a list of [measured, real] number pairs.`);
    }
  }
}

function validateActuator(a: ActuatorEntry, i: number, errors: string[], seen: Set<string>, pins?: PinClaim[]) {
  const tag = `Actuator #${i + 1}`;
  if (!isNonEmpty(a.name)) errors.push(`${tag}: name is required.`);
  else if (seen.has(a.name)) errors.push(`${tag}: duplicate name "${a.name}".`);
  else seen.add(a.name);

  if (!ACTUATOR_TYPES.includes(a.type)) {
    errors.push(`${tag} (${a.name || "?"}): type must be one of ${ACTUATOR_TYPES.join(", ")}.`);
  }

  const b = a.binding;
  if (!b || typeof b !== "object" || !SOURCES.includes(b.target)) {
    errors.push(`${tag} (${a.name || "?"}): binding.target must be one of ${SOURCE_LIST}.`);
  } else if (!ACTUATOR_TARGETS.includes(b.target)) {
    errors.push(`${tag} (${a.name || "?"}): target ${b.target} has no command path; use ${ACTUATOR_TARGETS.join(", ")}.`);
  }
  // Note: binding.node is optional in types.ts (node?: string | null), so a
  // missing FAS node is not a schema error here — the backend rejects it on PUT
  // if it genuinely requires one, and that error is surfaced to the operator.

  const act = a.actions;

  // Pi GPIO outputs: the pin must be set explicitly (the relay_channel
  // fallback is FAS-only) and must be one the Pi can claim.
  if (b && typeof b === "object" && isPiGpioActuator(a)) {
    const pin = b.gpio_channel;
    if (typeof pin !== "number") {
      errors.push(`${tag} (${a.name}): ${b.target} ${a.type} requires binding.gpio_channel.`);
    } else {
      const problem = piPinProblem(pin);
      if (problem) errors.push(`${tag} (${a.name}): gpio_channel ${problem}.`);
      else pins?.push({ target: b.target as "GCS" | "TCS", pin, what: `actuator "${a.name}"`, kind: "output" });
    }
  }

  // Output limits: Pi relay/GPIO outputs only, including a servo's power
  // relay (never its PWM output), and never the FAS.
  // `on_comms_loss: hold` is the default and the backend returns it on every
  // actuator, so only a limit that does something counts as set.
  const maxOn = act?.max_on_s;
  const commsLoss = act?.on_comms_loss;
  const setsLimit = maxOn != null || (commsLoss != null && commsLoss !== DEFAULT_ON_COMMS_LOSS);
  if (setsLimit && b && typeof b === "object" && !supportsOutputLimits(a)) {
    errors.push(
      `${tag} (${a.name}): max_on_s and on_comms_loss are only allowed on GCS/TCS solenoid, powered_device, powered_gpio_device, gpio_device and motor actuators, and servos with a power relay (relay_channel).`,
    );
  } else {
    if (maxOn != null && !(typeof maxOn === "number" && Number.isFinite(maxOn) && maxOn > 0)) {
      errors.push(`${tag} (${a.name}): max_on_s must be a positive number of seconds.`);
    }
    if (commsLoss != null && !ON_COMMS_LOSS.includes(commsLoss)) {
      errors.push(`${tag} (${a.name}): on_comms_loss must be one of ${ON_COMMS_LOSS.join(", ")}.`);
    }
  }

  // Servo position aliases/positions must align when both are present.
  if (act?.position_aliases && act.positions && act.position_aliases.length !== act.positions.length) {
    errors.push(`${tag} (${a.name}): position_aliases and positions must be the same length.`);
  }

  // Motor wiring — a reversible motor drives two relays, and its state labels
  // are the ONLY accepted command states, so a wrong count makes the actuator
  // uncommandable. Both are backend-rejected; catching them here keeps a bad
  // config off the control surface entirely.
  if (a.type === "motor" && b && typeof b === "object") {
    if (typeof b.relay_channel !== "number") {
      errors.push(`${tag} (${a.name}): motor requires binding.relay_channel.`);
    }
    if (act?.reversible && typeof b.reverse_relay_channel !== "number") {
      errors.push(`${tag} (${a.name}): reversible motor requires binding.reverse_relay_channel.`);
    }
    if (act?.reversible && b.relay_channel === b.reverse_relay_channel && typeof b.relay_channel === "number") {
      errors.push(`${tag} (${a.name}): relay_channel and reverse_relay_channel must differ.`);
    }
    const labels = act?.state_labels;
    if (labels && labels.length > 0) {
      const expected = act?.reversible ? 3 : 2;
      if (labels.length !== expected) {
        errors.push(
          `${tag} (${a.name}): state_labels must have exactly ${expected} entries when reversible is ${act?.reversible ? "true" : "false"}.`,
        );
      }
      if (new Set(labels.map((l) => l.toLowerCase())).size !== labels.length) {
        errors.push(`${tag} (${a.name}): state_labels must be unique.`);
      }
    }
  }
}

export function validateConfig(config: SystemConfig): string[] {
  const errors: string[] = [];

  const pins: PinClaim[] = [];

  const sensors = config.Sensors ?? [];
  const sensorNames = new Set<string>();
  sensors.forEach((s, i) => validateSensor(s, i, errors, sensorNames, pins));

  const actuators = config.Actuators ?? [];
  const actuatorNames = new Set<string>();
  actuators.forEach((a, i) => validateActuator(a, i, errors, actuatorNames, pins));

  // A Pi pin is an output or an input, not both, and one DI per pin. Two
  // actuators may share an output (the backend merges their limits).
  const claimed = new Map<string, PinClaim>();
  for (const c of pins) {
    const key = `${c.target}:${c.pin}`;
    const first = claimed.get(key);
    if (!first) claimed.set(key, c);
    else if (first.kind === "input" || c.kind === "input") {
      errors.push(`${c.target} GPIO ${c.pin} is used by both ${first.what} and ${c.what}.`);
    }
  }

  // Heartbeat: the Pis' comms-loss timeout.
  const hb = config.Heartbeat as unknown;
  if (hb != null) {
    const timeout = typeof hb === "object" && !Array.isArray(hb) ? (hb as Record<string, unknown>).timeout_ms : undefined;
    if (typeof hb !== "object" || Array.isArray(hb)) {
      errors.push("Heartbeat must be a mapping.");
    } else if (
      timeout != null &&
      !(typeof timeout === "number" && Number.isInteger(timeout) && timeout >= HEARTBEAT_TIMEOUT_MIN_MS && timeout <= HEARTBEAT_TIMEOUT_MAX_MS)
    ) {
      errors.push(`Heartbeat.timeout_ms must be a whole number from ${HEARTBEAT_TIMEOUT_MIN_MS} to ${HEARTBEAT_TIMEOUT_MAX_MS}.`);
    }
  }

  // Commands: each entry needs a binding.target.
  for (const [name, cmd] of Object.entries(config.Commands ?? {})) {
    if (!cmd.binding || !SOURCES.includes(cmd.binding.target)) {
      errors.push(`Command "${name}": binding.target must be one of ${SOURCE_LIST}.`);
    }
  }

  // safetyRules: each rule is an object mapping a name to a state / state list / "ALL".
  const rules = config.safetyRules;
  if (rules) {
    for (const key of ["critical", "hazardous"] as const) {
      const arr = rules[key];
      if (arr && !Array.isArray(arr)) {
        errors.push(`safetyRules.${key} must be a list.`);
      }
    }
  }

  return errors;
}

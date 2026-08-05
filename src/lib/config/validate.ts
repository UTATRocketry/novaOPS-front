import type {
  ActuatorEntry,
  ActuatorType,
  SensorEntry,
  SensorType,
  SourceTarget,
  SystemConfig,
} from "../types";

/**
 * Manual schema validation for SystemConfig, mirroring the shapes in
 * `src/lib/types.ts`. The Config page is the only writer to backend config, so
 * everything is checked here before a PUT/PATCH to avoid pushing a malformed
 * config to the control surface. Returns a list of human-readable errors; an
 * empty list means the config is safe to send.
 */

const SENSOR_TYPES: SensorType[] = ["PT", "LC", "TC"];
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

function isNonEmpty(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function validateSensor(s: SensorEntry, i: number, errors: string[], seen: Set<string>) {
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
  if (b.source === "FAS") {
    if (!isNonEmpty(b.node)) errors.push(`${tag} (${s.name}): FAS binding requires node.`);
    if (typeof b.channel !== "number") errors.push(`${tag} (${s.name}): FAS binding requires numeric channel.`);
  } else if (b.source === "GCS" || b.source === "TCS") {
    if (typeof b.hat_id !== "number") errors.push(`${tag} (${s.name}): ${b.source} binding requires numeric hat_id.`);
    if (typeof b.channel_id !== "number") errors.push(`${tag} (${s.name}): ${b.source} binding requires numeric channel_id.`);
  } else {
    errors.push(`${tag} (${s.name}): binding.source must be GCS, TCS, or FAS.`);
  }

  if (s.convert?.calibration) {
    const cal = s.convert.calibration;
    if (!Array.isArray(cal) || cal.some((p) => !Array.isArray(p) || p.length !== 2 || p.some((n) => typeof n !== "number"))) {
      errors.push(`${tag} (${s.name}): calibration must be a list of [measured, real] number pairs.`);
    }
  }
}

function validateActuator(a: ActuatorEntry, i: number, errors: string[], seen: Set<string>) {
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
  }
  // Note: binding.node is optional in types.ts (node?: string | null), so a
  // missing FAS node is not a schema error here — the backend rejects it on PUT
  // if it genuinely requires one, and that error is surfaced to the operator.

  // Servo position aliases/positions must align when both are present.
  const act = a.actions;
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

  const sensors = config.Sensors ?? [];
  const sensorNames = new Set<string>();
  sensors.forEach((s, i) => validateSensor(s, i, errors, sensorNames));

  const actuators = config.Actuators ?? [];
  const actuatorNames = new Set<string>();
  actuators.forEach((a, i) => validateActuator(a, i, errors, actuatorNames));

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

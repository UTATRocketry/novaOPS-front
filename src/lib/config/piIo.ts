import type {
  ActuatorEntry,
  ActuatorType,
  OnCommsLoss,
  SourceTarget,
  TcType,
} from "../types";

/**
 * Pi I/O rules for the config editor and validator (docs/design/pi-io-config.md
 * in Nova-Collected). novaGround's own reserved-pin list is the authority; this
 * copy only lets the editor refuse a reserved pin before saving. A mismatch
 * shows up as a `rejected` entry in the Pi's config status.
 */

/** Highest BCM pin on the Pi header. */
export const BCM_MAX = 27;

/**
 * BCM pins the Pi never claims: HAT ID EEPROM (0, 1), I2C1 (2, 3), SPI0
 * (7-11), HAT address select (12, 13, 26), MCC 128 reset/IRQ (16, 20) and the
 * daqhats shared interrupt (21).
 */
export const RESERVED_PINS: readonly number[] = [0, 1, 2, 3, 7, 8, 9, 10, 11, 12, 13, 16, 20, 21, 26];

/** BCM pins a GCS/TCS GPIO actuator or DI sensor may use, ascending. */
export const PI_GPIO_PINS: readonly number[] = Array.from({ length: BCM_MAX + 1 }, (_, i) => i).filter(
  (p) => !RESERVED_PINS.includes(p),
);

/** FAS `gpio_device` channels keep the editor's old 0-15 range (the bridge ignores them). */
export const FAS_GPIO_MAX = 15;

/** MCC 134 thermocouple types. */
export const TC_TYPES: readonly TcType[] = ["J", "K", "T", "E", "R", "S", "B", "N"];
export const DEFAULT_TC_TYPE: TcType = "K";

export const ON_COMMS_LOSS: readonly OnCommsLoss[] = ["hold", "safe"];
export const DEFAULT_ON_COMMS_LOSS: OnCommsLoss = "hold";

/** Default `Heartbeat.timeout_ms` when the config has no Heartbeat section. */
export const DEFAULT_HEARTBEAT_TIMEOUT_MS = 2000;
/** Range the backend accepts for `Heartbeat.timeout_ms`. */
export const HEARTBEAT_TIMEOUT_MIN_MS = 500;
export const HEARTBEAT_TIMEOUT_MAX_MS = 60000;

/** Actuator types whose relay/GPIO outputs can carry `max_on_s` / `on_comms_loss`. */
export const LIMITED_OUTPUT_TYPES: readonly ActuatorType[] = [
  "solenoid",
  "powered_device",
  "powered_gpio_device",
  "gpio_device",
  "motor",
];

/** Actuator types that drive a GPIO pin through `binding.gpio_channel`. */
export const GPIO_ACTUATOR_TYPES: readonly ActuatorType[] = ["gpio_device", "powered_gpio_device"];

export function isPiTarget(target: SourceTarget | string | undefined | null): target is "GCS" | "TCS" {
  return target === "GCS" || target === "TCS";
}

export function isReservedPin(pin: number): boolean {
  return RESERVED_PINS.includes(pin);
}

/** True when `pin` is an integer BCM pin a Pi may claim. */
export function isUsablePiPin(pin: unknown): pin is number {
  return typeof pin === "number" && Number.isInteger(pin) && pin >= 0 && pin <= BCM_MAX && !isReservedPin(pin);
}

/** Why `pin` can't be used on a Pi, or null when it can. */
export function piPinProblem(pin: number): string | null {
  if (!Number.isInteger(pin) || pin < 0 || pin > BCM_MAX) return `must be a BCM pin 0-${BCM_MAX}`;
  if (isReservedPin(pin)) return `BCM ${pin} is reserved`;
  return null;
}

/** GPIO channels the editor offers for an actuator bound to `target`. */
export function gpioChannelOptions(target: SourceTarget): readonly number[] {
  if (isPiTarget(target)) return PI_GPIO_PINS;
  return Array.from({ length: FAS_GPIO_MAX + 1 }, (_, i) => i);
}

/**
 * Whether `max_on_s` / `on_comms_loss` apply to this actuator: a relay or GPIO
 * output on a Pi. A servo qualifies only when it's wired through a power relay
 * (`binding.relay_channel`); the limits switch that relay off, never the PWM.
 */
export function supportsOutputLimits(a: Pick<ActuatorEntry, "type" | "binding">): boolean {
  if (!isPiTarget(a.binding?.target)) return false;
  if (a.type === "servo") return typeof a.binding.relay_channel === "number";
  return LIMITED_OUTPUT_TYPES.includes(a.type);
}

/**
 * What "safe" leaves this actuator at, in its own command states. The Pi's
 * safe level is fixed (docs/design/pi-io-config.md, "Output limits"): GPIO 0
 * and every relay de-energized. Which state that is follows the same
 * relay_type / solenoid_type rules the backend uses for commands
 * (`CommandParser._resolve_relay_state`): a de-energized `nominally_on` relay
 * powers its load. Null for actuators without output limits.
 */
export function safeStateDescription(a: Pick<ActuatorEntry, "type" | "binding" | "actions">): string | null {
  if (!supportsOutputLimits(a)) return null;
  const act = a.actions ?? {};
  const relayOn = (act.relay_type ?? "nominally_off").toLowerCase() === "nominally_on";
  const power = relayOn ? "on" : "off";
  switch (a.type) {
    case "gpio_device":
      return "GPIO low (disarm)";
    case "powered_gpio_device":
      return `GPIO low (disarm), relay de-energized (power ${power})`;
    case "powered_device":
      return `relay de-energized (${power})`;
    case "servo":
      return `power relay de-energized (power ${power}); the servo PWM is not changed`;
    case "solenoid": {
      const normallyClosed = (act.solenoid_type ?? "nominally_open").toLowerCase() === "nominally_closed";
      // Valve de-energized: its normal state. A nominally_on relay energizes it.
      const valve = relayOn ? (normallyClosed ? "open" : "closed") : normallyClosed ? "closed" : "open";
      return `relay de-energized (valve ${valve})`;
    }
    case "motor":
      return "every relay de-energized";
    default:
      return null;
  }
}

/** Whether this actuator drives a Pi GPIO pin (and so needs `gpio_channel`). */
export function isPiGpioActuator(a: Pick<ActuatorEntry, "type" | "binding">): boolean {
  return isPiTarget(a.binding?.target) && GPIO_ACTUATOR_TYPES.includes(a.type);
}

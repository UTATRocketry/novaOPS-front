/**
 * Custom JointJS shape definitions for the Nova P&ID canvas.
 *
 * Each shape class:
 *  - Defines SVG markup (structure) as a static prototype property.
 *  - Sets safe no-data defaults (— for values, UNKNOWN for valve badges).
 *  - Exposes typed helper methods that the bridge calls to push live values.
 *
 * COLOUR STRATEGY: All colours use hardcoded dark-theme hex values.
 * CSS custom properties (var(--chakra-colors-*)) do NOT reliably resolve
 * inside SVG presentation attributes when Chakra scopes its vars to
 * [data-theme="dark"] on the body rather than :root. GCS is always dark,
 * so we pin the dark palette directly.
 */
import { dia } from "@joint/core";
import { layoutButtons, totalButtonsWidth } from "./actuatorControls";
import { TOKEN_HEX } from "./registry";
import { trace } from "console";

function resolveToken(token: string): string | null {
  return TOKEN_HEX[token] ?? null;
}

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type ValveVariant =
  | "ball2"      // 2-way ball valve (default bowtie)
  | "ball3"      // 3-way T-valve
  | "solenoid";  // solenoid (bowtie + actuator cap)

export type ValueState = "ok" | "stale" | "none";
export type BadgeState = "open" | "closed" | "unknown" | "custom";

// ---------------------------------------------------------------------------
// Dark-theme colour palette (always used — GCS is dark-only)
// ---------------------------------------------------------------------------

const C = {
  transparent: "transparent",
  canvas:   "var(--chakra-colors-bg\\.canvas)",   // bg.canvas dark
  surface:   "var(--chakra-colors-bg\\.surface)",   // bg.surface dark
  raised:    "var(--chakra-colors-bg\\.surfaceRaised)",   // bg.surfaceRaised dark
  border:    "var(--chakra-colors-border\\.default)",   // border.default dark
  textPrim:  "var(--chakra-colors-text\\.primary)",   // text.primary dark
  textMuted: "var(--chakra-colors-text\\.muted)",   // text.muted dark
  nominal:   "var(--chakra-colors-nominal)",
  fault:     "var(--chakra-colors-fault)",
  warn:      "var(--chakra-colors-warn)",
  info:      "var(--chakra-colors-info)",
  accent:    "var(--chakra-colors-accent)",   // accent.400 dark
} as const;

const FONT_SANS = "var(--font-inter), Inter, sans-serif";
const FONT_MONO = "var(--font-jetbrains-mono), 'JetBrains Mono', monospace";

// ---------------------------------------------------------------------------
// SVG path helpers
// ---------------------------------------------------------------------------

/** Returns the ISA bowtie path for ball/solenoid valves, centred in 80 × 52. */
function bowtiePath(): string {
  return "M 8,4 L 8,48 L 40,26 Z M 72,4 L 72,48 L 40,26 Z";
}

/**
 * 3-way T-valve: horizontal bowtie + vertical stub from top-center to midpoint.
 */
function ball3Path(): string {
  return "M 8,20 L 8,48 L 40,34 Z M 72,20 L 72,48 L 40,34 Z M 40,4 L 40,34";
}

function variantPath(v: ValveVariant): string {
  switch (v) {
    case "ball3":    return ball3Path();
    case "solenoid": return bowtiePath();
    default:         return bowtiePath();
  }
}

// ---------------------------------------------------------------------------
// Shared port group factory
// ---------------------------------------------------------------------------

type PortsDef = {
  groups: Record<string, dia.Element.PortGroup>;
  items: dia.Element.Port[];
};

/**
 * Build a JointJS port-group definition with cardinal ports.
 * Ports show as small circles with magnet:true so JointJS handles
 * drag-to-connect automatically.
 */
function makePortsAbsolute(
  items: Array<{ id: string; x: string | number; y: string | number }>,
): PortsDef {
  return {
    groups: {
      flow: {
        position: { name: "absolute" },
        markup: [{ tagName: "circle", selector: "portBody" }],
        attrs: {
          portBody: {
            r: 4,
            fill: C.surface,
            stroke: C.border,
            strokeWidth: 1.5,
            magnet: true,
            cursor: "crosshair",
          },
        },
      },
    },
    items: items.map(({ id, x, y }) => ({
      id,
      group: "flow",
      args: { x, y },
    })),
  };
}

// ---------------------------------------------------------------------------
// nova.Instrument  (188 × 76)
// ---------------------------------------------------------------------------

const INSTRUMENT_MARKUP: dia.MarkupJSON = [
  { tagName: "rect",   selector: "body" },
  { tagName: "circle", selector: "bubble" },
  { tagName: "text",   selector: "typeCode" },
  { tagName: "text",   selector: "sensorName" },
  { tagName: "line",   selector: "tapLine" },
  { tagName: "rect",   selector: "readoutBox" },
  { tagName: "text",   selector: "readoutValue" },
  { tagName: "text",   selector: "readoutUnit" },
];

export class NovaInstrument extends dia.Element {
  preinitialize(): void {
    this.markup = INSTRUMENT_MARKUP;
  }

  defaults() {
    return {

      type: "nova.Instrument",
      size: { width: 188, height: 76 },
      binding: { name: "" } as { name: string },
      instrumentType: "PT" as string,
      label: "" as string,
      hint: { unit: "", range: [0, 100] } as { unit: string; range: [number, number] },
      colorToken: "" as string,
      // Four ports around the instrument bubble (centred at 38,38 r=30).
      ports: makePortsAbsolute([
        { id: "left",   x: 8,  y: 38 },
        { id: "right",  x: 68, y: 38 },
        { id: "top",    x: 38, y: 8  },
        { id: "bottom", x: 38, y: 68 },
      ]),
      attrs: {
        body: {
          width: "calc(w)", height: "calc(h)",
          fill: "transparent", stroke: "none",
        },
        bubble: {
          cx: 38, cy: 38, r: 30,
          strokeWidth: 1.5,
          fill: C.transparent,
          stroke: C.border,
        },
        typeCode: {
          x: 38, y: 30,
          textAnchor: "middle", dominantBaseline: "middle",
          fontSize: 11, fontWeight: "700",
          text: "PT",
          fill: C.textPrim,
          fontFamily: FONT_SANS,
        },
        sensorName: {
          x: 38, y: 49,
          textAnchor: "middle", dominantBaseline: "middle",
          fontSize: 9,
          text: "",
          fill: C.textMuted,
          fontFamily: FONT_MONO,
        },
        tapLine: {
          x1: 68, y1: 38, x2: 80, y2: 38,
          strokeWidth: 1,
          stroke: C.border,
        },
        readoutBox: {
          x: 80, y: 6, width: 100, height: 64,
          rx: 6, strokeWidth: 1,
          fill: C.transparent,
          stroke: C.border,
        },
        readoutValue: {
          x: 130, y: 30,
          textAnchor: "middle", dominantBaseline: "middle",
          fontSize: 18, fontWeight: "600",
          text: "—",
          fill: C.textPrim,
          fontFamily: FONT_MONO,
        },
        readoutUnit: {
          x: 130, y: 52,
          textAnchor: "middle", dominantBaseline: "middle",
          fontSize: 10,
          text: "",
          fill: C.textMuted,
          fontFamily: FONT_MONO,
        },
      },
    };
  }

  // ---- Colour support -------------------------------------------------------

  applyColour(): void {
    const hex = resolveToken((this.get("colorToken") as string) ?? "");
    if (hex) {
      this.attr("bubble/stroke", hex);
      this.attr("tapLine/stroke", hex);
      this.attr("readoutBox/stroke", hex);
      this.attr("typeCode/fill", hex);
    } else {
      this.attr("bubble/stroke", C.border);
      this.attr("tapLine/stroke", C.border);
      this.attr("readoutBox/stroke", C.border);
      this.attr("typeCode/fill", C.textPrim);
    }
  }

  // ---- Live-mode helpers (called by bridge) --------------------------------

  setReadout(value: string, unit: string): void {
    this.attr("readoutValue/text", value);
    this.attr("readoutUnit/text", unit);
  }

  clearReadout(): void {
    this.attr("readoutValue/text", "—");
    this.attr("readoutUnit/text", "");
  }

  setStale(stale: boolean): void {
    this.attr("body/opacity", stale ? 0.45 : 1);
  }

  setMissing(missing: boolean): void {
    this.attr("bubble/stroke", missing ? C.warn : C.border);
  }

  applyLabels(): void {
    const it = this.get("instrumentType") as string | undefined;
    const lb = this.get("label") as string | undefined;
    this.attr("typeCode/text",   it ?? "?");
    this.attr("sensorName/text", lb ?? "");
    this.applyColour();
  }
}

// ---------------------------------------------------------------------------
// nova.Valve  (80 × 96)
// ---------------------------------------------------------------------------

const VALVE_MARKUP: dia.MarkupJSON = [
  { tagName: "rect",   selector: "body" },
  { tagName: "text",   selector: "valveLabel" },
  { tagName: "path",   selector: "symbol" },
  { tagName: "rect",   selector: "actuatorCap" },
  { tagName: "line",   selector: "capLine" },
  { tagName: "rect",   selector: "badgeBg" },
  { tagName: "text",   selector: "badgeText" },
];

export class NovaValve extends dia.Element {
  preinitialize(): void {
    this.markup = VALVE_MARKUP;
  }

  defaults() {
    return {

      type: "nova.Valve",
      size: { width: 80, height: 96 },
      binding: null as { name: string } | null,
      symbolVariant: "ball2" as ValveVariant,
      controllable: false as boolean,
      label: "" as string,
      colorToken: "" as string,
      // Ports: left/right for flow, top for actuator control line
      ports: makePortsAbsolute([
        { id: "left",  x: 0,      y: "50%" },
        { id: "right", x: "100%", y: "50%" },
        { id: "top",   x: "50%",  y: 0     },
      ]),
      attrs: {
        body: {
          width: "calc(w)", height: "calc(h)",
          fill: "transparent", stroke: "none",
        },
        valveLabel: {
          x: 40, y: 12,
          textAnchor: "middle", dominantBaseline: "middle",
          fontSize: 9, fontWeight: "600",
          text: "",
          fill: C.textMuted,
          fontFamily: FONT_MONO,
        },
        symbol: {
          d: bowtiePath(),
          strokeWidth: 1.8,
          strokeLinejoin: "round",
          transform: "translate(0, 18)",
          fill: C.transparent,
          stroke: C.textPrim,
        },
        actuatorCap: {
          x: 30, y: 14, width: 20, height: 8,
          rx: 2, strokeWidth: 1,
          fill: C.transparent,
          stroke: C.border,
          // Hidden by default — shown for solenoid variant
          opacity: 0,
          pointerEvents: "none",
        },
        capLine: {
          x1: 30, y1: 18, x2: 50, y2: 18,
          stroke: C.border,
          strokeWidth: 1,
          opacity: 0,
        },
        badgeBg: {
          x: 8, y: 70, width: 64, height: 20,
          rx: 10, strokeWidth: 1,
          fill: C.transparent,
          stroke: C.border,
        },
        badgeText: {
          x: 40, y: 80,
          textAnchor: "middle", dominantBaseline: "middle",
          fontSize: 9, fontWeight: "700",
          text: "UNKNOWN",
          fill: C.textMuted,
          fontFamily: FONT_MONO,
        },
      },
    };
  }

  // ---- Colour support -------------------------------------------------------

  applyColour(): void {
    const hex = resolveToken((this.get("colorToken") as string) ?? "");
    if (hex) {
      this.attr("symbol/stroke", hex);
      this.attr("valveLabel/fill", hex);
      this.attr("actuatorCap/stroke", hex);
      this.attr("capLine/stroke", hex);
    } else {
      this.attr("symbol/stroke", C.textPrim);
      this.attr("valveLabel/fill", C.textMuted);
      this.attr("actuatorCap/stroke", C.border);
      this.attr("capLine/stroke", C.border);
    }
  }

  // ---- Live-mode helpers ---------------------------------------------------

  setBadge(state: BadgeState, label?: string): void {
    let text: string;
    let bgFill: string;
    let textFill: string;
    let stroke: string;

    switch (state) {
      case "open":
        text = label ?? "OPEN";
        bgFill    = "rgba(34, 197, 94, 0.18)";
        textFill  = C.nominal;
        stroke    = "rgba(34, 197, 94, 0.40)";
        break;
      case "closed":
        text = label ?? "CLOSED";
        bgFill    = "rgba(239, 68, 68, 0.18)";
        textFill  = C.fault;
        stroke    = "rgba(239, 68, 68, 0.40)";
        break;
      default:
        text      = label ?? "UNKNOWN";
        bgFill    = C.raised;
        textFill  = C.textMuted;
        stroke    = C.border;
    }

    this.attr("badgeText/text",   text);
    this.attr("badgeText/fill",   textFill);
    this.attr("badgeBg/fill",     bgFill);
    this.attr("badgeBg/stroke",   stroke);
  }

  clearBadge(): void {
    this.setBadge("unknown");
  }

  setStale(stale: boolean): void {
    this.attr("body/opacity", stale ? 0.45 : 1);
  }

  setMissing(missing: boolean): void {
    this.attr("badgeBg/stroke", missing ? C.warn : C.border);
  }

  applyLabels(): void {
    const lb      = this.get("label") as string | undefined;
    const variant = this.get("symbolVariant") as ValveVariant;
    this.attr("valveLabel/text", lb ?? "");
    this.attr("symbol/d",        variantPath(variant));
    // Show actuator cap for solenoid variant using opacity
    this.attr("actuatorCap/opacity",       variant === "solenoid" ? 1 : 0);
    this.attr("actuatorCap/pointerEvents", variant === "solenoid" ? "auto" : "none");
    // Controllable valves delegate state display to their separate control row,
    // so the passive badge is hidden for them (image 1 look).
    const controllable = this.get("controllable") === true;
    this.attr("badgeBg/opacity",   controllable ? 0 : 1);
    this.attr("badgeText/opacity", controllable ? 0 : 1);
    this.applyColour();
  }

  isControllable(): boolean {
    return this.get("controllable") === true;
  }

  bindingName(): string | null {
    const b = this.get("binding") as { name: string } | null;
    return b?.name ?? null;
  }
}

// ---------------------------------------------------------------------------
// nova.Vessel  (96 × 140)
// ---------------------------------------------------------------------------

const VESSEL_MARKUP: dia.MarkupJSON = [
  { tagName: "rect",    selector: "body" },
  { tagName: "rect",    selector: "tank" },
  { tagName: "ellipse", selector: "capTop" },
  { tagName: "ellipse", selector: "capBottom" },
  { tagName: "text",    selector: "vesselName" },
  { tagName: "text",    selector: "contents" },
];

export class NovaVessel extends dia.Element {
  preinitialize(): void {
    this.markup = VESSEL_MARKUP;
  }

  defaults() {
    return {

      type: "nova.Vessel",
      size: { width: 96, height: 140 },
      label: "" as string,
      contentsLabel: "" as string,
      colorToken: "" as string,
      fillBinding: null as { name: string } | null,
      // Ports: top/bottom for fill/drain, sides for lines
      ports: makePortsAbsolute([
        { id: "top",    x: "50%",  y: 0      },
        { id: "bottom", x: "50%",  y: "100%" },
        { id: "left",   x: 0,      y: "50%"  },
        { id: "right",  x: "100%", y: "50%"  },
      ]),
      attrs: {
        body: {
          width: "calc(w)", height: "calc(h)",
          fill: "transparent", stroke: "none",
        },
        // calc()-based geometry so the vessel scales when the element resizes.
        tank: {
          x: 10, y: 16, width: "calc(w-20)", height: "calc(h-32)",
          strokeWidth: 1.5,
          fill: C.canvas,
          stroke: C.border,
        },
        capTop: {
          cx: "calc(0.5*w)", cy: 16, rx: "calc(0.5*w-10)", ry: 12,
          strokeWidth: 1.5,
          fill: C.canvas,
          stroke: C.border,
        },
        capBottom: {
          cx: "calc(0.5*w)", cy: "calc(h-16)", rx: "calc(0.5*w-10)", ry: 12,
          strokeWidth: 1.5,
          fill: C.canvas,
          stroke: C.border,
        },
        vesselName: {
          x: "calc(0.5*w)", y: "calc(0.44*h)",
          textAnchor: "middle", dominantBaseline: "middle",
          fontSize: 11, fontWeight: "600",
          text: "",
          fill: C.textPrim,
          fontFamily: FONT_MONO,
        },
        contents: {
          x: "calc(0.5*w)", y: "calc(0.57*h)",
          textAnchor: "middle", dominantBaseline: "middle",
          fontSize: 9,
          text: "",
          fill: C.textMuted,
          fontFamily: FONT_SANS,
        },
      },
    };
  }

  // ---- Colour support -------------------------------------------------------

  applyColour(): void {
    const hex = resolveToken((this.get("colorToken") as string) ?? "");
    if (hex) {
      this.attr("tank/stroke", hex);
      this.attr("capTop/stroke", hex);
      this.attr("capBottom/stroke", hex);
      this.attr("vesselName/fill", hex);
    } else {
      this.attr("tank/stroke", C.border);
      this.attr("capTop/stroke", C.border);
      this.attr("capBottom/stroke", C.border);
      this.attr("vesselName/fill", C.textPrim);
    }
  }

  applyLabels(): void {
    this.attr("vesselName/text", (this.get("label") as string | undefined) ?? "");
    this.attr("contents/text",   (this.get("contentsLabel") as string | undefined) ?? "");
    this.applyColour();
  }
}

// ---------------------------------------------------------------------------
// nova.TextLabel  (auto)
// ---------------------------------------------------------------------------

const TEXT_LABEL_MARKUP: dia.MarkupJSON = [
  { tagName: "text", selector: "label" },
];

export class NovaTextLabel extends dia.Element {
  preinitialize(): void {
    this.markup = TEXT_LABEL_MARKUP;
  }

  defaults() {
    return {

      type: "nova.TextLabel",
      size: { width: 100, height: 24 },
      colorToken: "" as string,
      attrs: {
        label: {
          x: 0, y: 12,
          fontSize: 10,
          text: "",
          fill: C.textMuted,
          fontFamily: FONT_SANS,
        },
      },
    };
  }

  // ---- Colour support -------------------------------------------------------

  applyColour(): void {
    const hex = resolveToken((this.get("colorToken") as string) ?? "");
    this.attr("label/fill", hex ?? C.textMuted);
  }

  applyTextSize(size: number): void {
    this.attr("label/fontSize", size);
  }

  applyLabels(): void {
    this.applyColour();
  }
  
}

// ---------------------------------------------------------------------------
// nova.SystemLink  (extends dia.Link)
// ---------------------------------------------------------------------------

export class NovaSystemLink extends dia.Link {
  preinitialize(): void {
    this.markup = [
      {
        tagName: "path",
        selector: "line",
        attributes: { fill: "none", pointerEvents: "none" },
      },
      {
        tagName: "path",
        selector: "wrapper",
        attributes: { fill: "none", stroke: "transparent", strokeWidth: 10, cursor: "default" },
      },
    ];
  }

  defaults() {
    return {

      type: "nova.SystemLink",
      systemId: "" as string,
      // Direct colour override from the central palette. When set it wins over
      // the systemId-derived colour, letting a pipe be any PID_COLORS token.
      colorToken: "" as string,
      attrs: {
        line: {
          // `connection: true` tells JointJS to write the routed path `d` here.
          connection: true,
          strokeWidth: 2.5,
          strokeLinecap: "round",
          strokeLinejoin: "round",
          stroke: C.border,
          fill: "none",
          targetMarker: { type: "none" },
        },
        wrapper: {
          connection: true,
          strokeWidth: 10,
          fill: "none",
        },
      },
      router: { name: "orthogonal" },
      connector: { name: "rounded", args: { radius: 8 } },
    };
  }

  setSystemColour(cssColour: string): void {
    this.attr("line/stroke", cssColour);
  }

  /** Apply the direct colorToken if set; returns true if it applied. */
  applyColour(): boolean {
    const hex = resolveToken((this.get("colorToken") as string) ?? "");
    if (hex) {
      this.attr("line/stroke", hex);
      return true;
    }
    return false;
  }
}

// ---------------------------------------------------------------------------
// nova.ActuatorControl  (width dynamic, height ~30/44)
//
// A separate, bindable control ROW that sits with an actuator shape. It renders
// a row of buttons computed from the actuator's control axes:
//   • binary axis  → ONE button showing the current state (click toggles)
//   • 3+ position  → one button PER option, active highlighted (F | N | D)
// Decoupled from the symbol — independently movable / rotatable.
// ---------------------------------------------------------------------------

export const CONTROL_MAX_BTN = 8;
const CONTROL_NAME_H = 13;
const CONTROL_BTN_H  = 26;

export interface ButtonFace {
  label: string;
  bgFill: string;
  textFill: string;
  stroke: string;
}

const CONTROL_MARKUP: dia.MarkupJSON = [
  { tagName: "rect", selector: "body" },
  { tagName: "text", selector: "nameLabel" },
  ...Array.from({ length: CONTROL_MAX_BTN }, (_, i) => [
    { tagName: "rect", selector: `btn${i}bg` },
    { tagName: "text", selector: `btn${i}txt` },
  ]).flat(),
];

function btnDefaults(): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (let i = 0; i < CONTROL_MAX_BTN; i++) {
    out[`btn${i}bg`]  = { x: 4, y: 4, width: 60, height: CONTROL_BTN_H, rx: 5, fill: C.surface, stroke: C.border, strokeWidth: 1.5, opacity: 0 };
    out[`btn${i}txt`] = { x: 34, y: 17, textAnchor: "middle", dominantBaseline: "middle", fontSize: 11, fontWeight: "700", text: "", fill: C.textMuted, fontFamily: FONT_MONO, opacity: 0 };
  }
  return out;
}

export class NovaActuatorControl extends dia.Element {
  preinitialize(): void {
    this.markup = CONTROL_MARKUP;
  }

  defaults() {
    return {
      type: "nova.ActuatorControl",
      size: { width: 80, height: CONTROL_NAME_H + CONTROL_BTN_H + 4 },
      binding: null as { name: string } | null,
      showName: true as boolean,
      buttonCount: 0 as number,
      attrs: {
        body: { width: "calc(w)", height: "calc(h)", fill: "transparent", stroke: "none" },
        nameLabel: {
          x: 2, y: 7,
          textAnchor: "start", dominantBaseline: "middle",
          fontSize: 8, fontWeight: "700",
          text: "",
          fill: C.textMuted,
          fontFamily: FONT_MONO,
          opacity: 0,
        },
        ...btnDefaults(),
      },
    };
  }

  bindingName(): string | null {
    const b = this.get("binding") as { name: string } | null;
    return b?.name ?? null;
  }

  buttonCount(): number {
    return (this.get("buttonCount") as number | undefined) ?? 0;
  }

  private nameH(): number {
    return this.get("showName") === false ? 0 : CONTROL_NAME_H;
  }

  setName(name: string | null): void {
    const show = this.get("showName") !== false && !!name;
    this.attr("nameLabel/text", name ?? "");
    this.attr("nameLabel/opacity", show ? 1 : 0);
  }

  /**
   * Render a row of buttons. Resizes the widget to fit. Each face carries its
   * own label + colours; geometry is derived from the labels (shared with the
   * bridge's click hit-testing via layoutButtons()).
   */
  applyButtons(faces: ButtonFace[]): void {
    const n = Math.min(faces.length, CONTROL_MAX_BTN);
    this.set("buttonCount", n);

    const labels = faces.slice(0, n).map((f) => f.label);
    const boxes  = layoutButtons(labels);
    const nameH  = this.nameH();
    const totalW = n > 0 ? totalButtonsWidth(labels) : 80;
    this.resize(totalW, nameH + CONTROL_BTN_H + 4);

    for (let i = 0; i < CONTROL_MAX_BTN; i++) {
      const visible = i < n;
      this.attr(`btn${i}bg/opacity`,  visible ? 1 : 0);
      this.attr(`btn${i}txt/opacity`, visible ? 1 : 0);
      if (!visible) continue;
      const box = boxes[i];
      const face = faces[i];
      this.attr(`btn${i}bg/x`,      box.x);
      this.attr(`btn${i}bg/y`,      nameH + 2);
      this.attr(`btn${i}bg/width`,  box.w);
      this.attr(`btn${i}bg/fill`,   face.bgFill);
      this.attr(`btn${i}bg/stroke`, face.stroke);
      this.attr(`btn${i}txt/x`,     box.x + box.w / 2);
      this.attr(`btn${i}txt/y`,     nameH + 2 + CONTROL_BTN_H / 2);
      this.attr(`btn${i}txt/text`,  face.label);
      this.attr(`btn${i}txt/fill`,  face.textFill);
    }
  }

  clearButtons(): void {
    this.set("buttonCount", 0);
    for (let i = 0; i < CONTROL_MAX_BTN; i++) {
      this.attr(`btn${i}bg/opacity`,  0);
      this.attr(`btn${i}txt/opacity`, 0);
    }
  }

  setMissing(missing: boolean): void {
    this.attr("nameLabel/fill", missing ? C.warn : C.textMuted);
  }

  setStale(stale: boolean): void {
    this.attr("body/opacity", stale ? 0.45 : 1);
  }
}

// ---------------------------------------------------------------------------
// nova.Bottle  (gas cylinder — 56 × 130)
// ---------------------------------------------------------------------------

/** Gas-bottle outline: rounded-top neck + rounded-shoulder cylindrical body. */
function bottlePath(): string {
  return (
    "M 16,28 L 16,10 C 16,4 21,0 28,0 C 35,0 40,4 40,10 L 40,28 Z " +
    "M 0,34 C 0,26 12,20 28,20 C 44,20 56,26 56,34 L 56,130 L 0,130 Z"
  );
}

const BOTTLE_MARKUP: dia.MarkupJSON = [
  { tagName: "rect", selector: "body" },
  { tagName: "path", selector: "symbol" },
  { tagName: "text", selector: "vesselName" },
  { tagName: "text", selector: "contents" },
];

export class NovaBottle extends dia.Element {
  preinitialize(): void {
    this.markup = BOTTLE_MARKUP;
  }

  defaults() {
    return {
      type: "nova.Bottle",
      size: { width: 56, height: 130 },
      label: "" as string,
      contentsLabel: "" as string,
      colorToken: "" as string,
      ports: makePortsAbsolute([
        { id: "top",    x: "50%", y: 0      },
        { id: "bottom", x: "50%", y: "100%" },
        { id: "left",   x: 0,     y: "70%"  },
        { id: "right",  x: "100%", y: "70%" },
      ]),
      attrs: {
        body: { width: "calc(w)", height: "calc(h)", fill: "transparent", stroke: "none" },
        symbol: {
          d: bottlePath(),
          fill: C.canvas,
          stroke: C.border,
          strokeWidth: 1.5,
          strokeLinejoin: "round",
        },
        vesselName: {
          x: "calc(0.5*w)", y: "calc(0.62*h)",
          textAnchor: "middle", dominantBaseline: "middle",
          fontSize: 10, fontWeight: "600",
          text: "", fill: C.textPrim, fontFamily: FONT_MONO,
        },
        contents: {
          x: "calc(0.5*w)", y: "calc(0.74*h)",
          textAnchor: "middle", dominantBaseline: "middle",
          fontSize: 8, text: "", fill: C.textMuted, fontFamily: FONT_SANS,
        },
      },
    };
  }

  /** Scale the fixed symbol path to the element's current size (base 56×130). */
  applyScale(): void {
    const { width, height } = this.size();
    this.attr("symbol/transform", `scale(${width / 56},${height / 130})`);
  }

  applyColour(): void {
    const hex = resolveToken((this.get("colorToken") as string) ?? "");
    this.attr("symbol/stroke", hex ?? C.border);
    this.attr("vesselName/fill", hex ?? C.textPrim);
  }

  applyLabels(): void {
    this.attr("vesselName/text", (this.get("label") as string | undefined) ?? "");
    this.attr("contents/text",   (this.get("contentsLabel") as string | undefined) ?? "");
    this.applyScale();
    this.applyColour();
  }
}

// ---------------------------------------------------------------------------
// nova.Chamber  (combustion chamber — 80 × 124)
// ---------------------------------------------------------------------------

/** Domed-top combustion chamber with a flared converging-diverging nozzle. */
function chamberPath(): string {
  return (
    "M 14,22 C 30,6 50,6 66,22 L 66,74 " +
    "C 56,86 60,104 72,120 L 8,120 " +
    "C 20,104 24,86 14,74 Z"
  );
}

const CHAMBER_MARKUP: dia.MarkupJSON = [
  { tagName: "rect", selector: "body" },
  { tagName: "path", selector: "symbol" },
  { tagName: "text", selector: "vesselName" },
  { tagName: "text", selector: "contents" },
];

export class NovaChamber extends dia.Element {
  preinitialize(): void {
    this.markup = CHAMBER_MARKUP;
  }

  defaults() {
    return {
      type: "nova.Chamber",
      size: { width: 80, height: 124 },
      label: "" as string,
      contentsLabel: "" as string,
      colorToken: "" as string,
      ports: makePortsAbsolute([
        { id: "top",    x: "50%", y: 0      },
        { id: "left",   x: "17%", y: "30%"  },
        { id: "right",  x: "83%", y: "30%"  },
        { id: "bottom", x: "50%", y: "100%" },
      ]),
      attrs: {
        body: { width: "calc(w)", height: "calc(h)", fill: "transparent", stroke: "none" },
        symbol: {
          d: chamberPath(),
          fill: C.transparent,
          stroke: C.border,
          strokeWidth: 1.5,
          strokeLinejoin: "round",
        },
        vesselName: {
          x: "calc(0.5*w)", y: "calc(0.39*h)",
          textAnchor: "middle", dominantBaseline: "middle",
          fontSize: 10, fontWeight: "600",
          text: "", fill: C.textPrim, fontFamily: FONT_MONO,
        },
        contents: {
          x: "calc(0.5*w)", y: "calc(0.52*h)",
          textAnchor: "middle", dominantBaseline: "middle",
          fontSize: 8, text: "", fill: C.textMuted, fontFamily: FONT_SANS,
        },
      },
    };
  }

  /** Scale the fixed symbol path to the element's current size (base 80×124). */
  applyScale(): void {
    const { width, height } = this.size();
    this.attr("symbol/transform", `scale(${width / 80},${height / 124})`);
  }

  applyColour(): void {
    const hex = resolveToken((this.get("colorToken") as string) ?? "");
    this.attr("symbol/stroke", hex ?? C.border);
    this.attr("vesselName/fill", hex ?? C.textPrim);
  }

  applyLabels(): void {
    this.attr("vesselName/text", (this.get("label") as string | undefined) ?? "");
    this.attr("contents/text",   (this.get("contentsLabel") as string | undefined) ?? "");
    this.applyScale();
    this.applyColour();
  }
}

// ---------------------------------------------------------------------------
// nova.Device  (generic actuator symbol — 60 × 60 square)
//
// A minimal placeholder symbol for actuators with no standard P&ID glyph
// (e.g. IMCs). Bindable + controllable; shows a label and a live state badge.
// ---------------------------------------------------------------------------

const DEVICE_MARKUP: dia.MarkupJSON = [
  { tagName: "rect", selector: "body" },
  { tagName: "rect", selector: "box" },
  { tagName: "text", selector: "deviceLabel" },
  { tagName: "text", selector: "badgeText" },
];

export class NovaDevice extends dia.Element {
  preinitialize(): void {
    this.markup = DEVICE_MARKUP;
  }

  defaults() {
    return {
      type: "nova.Device",
      size: { width: 64, height: 64 },
      binding: null as { name: string } | null,
      controllable: false as boolean,
      label: "" as string,
      colorToken: "" as string,
      ports: makePortsAbsolute([
        { id: "left",   x: 0,      y: "50%" },
        { id: "right",  x: "100%", y: "50%" },
        { id: "top",    x: "50%",  y: 0     },
        { id: "bottom", x: "50%",  y: "100%" },
      ]),
      attrs: {
        body: { width: "calc(w)", height: "calc(h)", fill: "transparent", stroke: "none" },
        box: {
          x: 4, y: 16, width: 56, height: 44,
          rx: 4, strokeWidth: 1.5,
          fill: C.surface, stroke: C.textPrim,
        },
        deviceLabel: {
          x: 32, y: 9,
          textAnchor: "middle", dominantBaseline: "middle",
          fontSize: 9, fontWeight: "600",
          text: "", fill: C.textMuted, fontFamily: FONT_MONO,
        },
        badgeText: {
          x: 32, y: 38,
          textAnchor: "middle", dominantBaseline: "middle",
          fontSize: 9, fontWeight: "700",
          text: "UNKNOWN", fill: C.textMuted, fontFamily: FONT_MONO,
        },
      },
    };
  }

  applyColour(): void {
    const hex = resolveToken((this.get("colorToken") as string) ?? "");
    this.attr("box/stroke", hex ?? C.textPrim);
    this.attr("deviceLabel/fill", hex ?? C.textMuted);
  }

  applyLabels(): void {
    this.attr("deviceLabel/text", (this.get("label") as string | undefined) ?? "");
    this.applyColour();
  }

  setBadge(state: BadgeState, label?: string): void {
    let text: string;
    let fill: string;
    switch (state) {
      case "open":   text = label ?? "OPEN";   fill = C.nominal; break;
      case "closed": text = label ?? "CLOSED"; fill = C.fault;   break;
      default:       text = label ?? "UNKNOWN"; fill = C.textMuted;
    }
    this.attr("badgeText/text", text);
    this.attr("badgeText/fill", fill);
  }

  clearBadge(): void { this.setBadge("unknown"); }
  setStale(stale: boolean): void { this.attr("body/opacity", stale ? 0.45 : 1); }
  setMissing(missing: boolean): void { this.attr("box/stroke", missing ? C.warn : C.textPrim); }
  isControllable(): boolean { return this.get("controllable") === true; }
  bindingName(): string | null {
    const b = this.get("binding") as { name: string } | null;
    return b?.name ?? null;
  }
}

// ---------------------------------------------------------------------------
// nova.Zone  (dashed annotation rectangle — resizable)
//
// Transparent fill, coloured dashed stroke. Used to group/annotate regions of
// the diagram. Resizable via a drag handle (bridge) or the properties panel.
// Rendered behind other cells (z = -1 set by the bridge on add).
// ---------------------------------------------------------------------------

const ZONE_MARKUP: dia.MarkupJSON = [
  { tagName: "rect", selector: "box" },
  { tagName: "text", selector: "zoneLabel" },
];

export class NovaZone extends dia.Element {
  preinitialize(): void {
    this.markup = ZONE_MARKUP;
  }

  defaults() {
    return {
      type: "nova.Zone",
      size: { width: 200, height: 140 },
      label: "" as string,
      colorToken: "accent" as string,
      attrs: {
        box: {
          width: "calc(w)", height: "calc(h)",
          rx: 6,
          fill: "transparent",
          stroke: C.accent,
          strokeWidth: 1.5,
          strokeDasharray: "6 4",
        },
        zoneLabel: {
          x: 8, y: 14,
          textAnchor: "start", dominantBaseline: "middle",
          fontSize: 10, fontWeight: "600",
          text: "",
          fill: C.accent,
          fontFamily: FONT_MONO,
        },
      },
    };
  }

  applyColour(): void {
    const hex = resolveToken((this.get("colorToken") as string) ?? "") ?? C.accent;
    this.attr("box/stroke", hex);
    this.attr("zoneLabel/fill", hex);
  }

  applyLabels(): void {
    this.attr("zoneLabel/text", (this.get("label") as string | undefined) ?? "");
    this.applyColour();
  }
}

// ---------------------------------------------------------------------------
// Colour export (used by bridge for selection/highlight colours)
// ---------------------------------------------------------------------------

export { C as SHAPE_COLOURS };

// ---------------------------------------------------------------------------
// Cell namespace (pass to dia.Graph as cellNamespace)
// ---------------------------------------------------------------------------

export const NOVA_NAMESPACE = {
  nova: {
    Instrument:       NovaInstrument,
    Valve:            NovaValve,
    Vessel:           NovaVessel,
    Bottle:           NovaBottle,
    Chamber:          NovaChamber,
    Device:           NovaDevice,
    TextLabel:        NovaTextLabel,
    SystemLink:       NovaSystemLink,
    ActuatorControl:  NovaActuatorControl,
    Zone:             NovaZone,
  },
};

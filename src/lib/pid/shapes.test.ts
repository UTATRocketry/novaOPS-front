import { dia, shapes } from "@joint/core";
import { describe, expect, it } from "vitest";

import {
  CONTROL_MAX_BTN,
  NOVA_NAMESPACE,
  NovaActuatorControl,
  NovaBottle,
  NovaChamber,
  NovaDevice,
  NovaInstrument,
  NovaSystemLink,
  NovaTextLabel,
  NovaValve,
  NovaVessel,
  NovaZone,
  SHAPE_COLOURS,
  type ButtonFace,
} from "./shapes";

const face = (label: string): ButtonFace => ({ label, bgFill: "bg", textFill: "tx", stroke: "st" });

describe("NOVA_NAMESPACE", () => {
  it("maps every shape type so a saved layout can be revived", () => {
    const graph = new dia.Graph({}, { cellNamespace: { ...shapes, ...NOVA_NAMESPACE } });
    graph.fromJSON({
      cells: [
        { type: "nova.Instrument", id: "a", position: { x: 0, y: 0 } },
        { type: "nova.Valve", id: "b", position: { x: 0, y: 0 } },
        { type: "nova.Vessel", id: "c", position: { x: 0, y: 0 } },
        { type: "nova.Bottle", id: "d", position: { x: 0, y: 0 } },
        { type: "nova.Chamber", id: "e", position: { x: 0, y: 0 } },
        { type: "nova.Device", id: "f", position: { x: 0, y: 0 } },
        { type: "nova.TextLabel", id: "g", position: { x: 0, y: 0 } },
        { type: "nova.ActuatorControl", id: "h", position: { x: 0, y: 0 } },
        { type: "nova.Zone", id: "i", position: { x: 0, y: 0 } },
        { type: "nova.SystemLink", id: "j", source: { x: 0, y: 0 }, target: { x: 5, y: 5 } },
      ],
    });
    const classes = graph.getCells().map((c) => c.constructor);
    expect(classes).toEqual([
      NovaInstrument, NovaValve, NovaVessel, NovaBottle, NovaChamber,
      NovaDevice, NovaTextLabel, NovaActuatorControl, NovaZone, NovaSystemLink,
    ]);
  });

  it("exports the palette the bridge uses for selection", () => {
    expect(SHAPE_COLOURS.accent).toContain("accent");
  });
});

describe("NovaInstrument", () => {
  it("starts with no reading", () => {
    const i = new NovaInstrument();
    expect(i.attr("readoutValue/text")).toBe("—");
    expect(i.attr("readoutUnit/text")).toBe("");
    expect(i.get("binding")).toEqual({ name: "" });
  });

  it("shows and clears a reading", () => {
    const i = new NovaInstrument();
    i.setReadout("12.50", "psi");
    expect(i.attr("readoutValue/text")).toBe("12.50");
    expect(i.attr("readoutUnit/text")).toBe("psi");
    i.clearReadout();
    expect(i.attr("readoutValue/text")).toBe("—");
  });

  it("dims when stale and restores", () => {
    const i = new NovaInstrument();
    i.setStale(true);
    expect(i.attr("body/opacity")).toBe(0.45);
    i.setStale(false);
    expect(i.attr("body/opacity")).toBe(1);
  });

  it("outlines in the warning colour when missing and back when not", () => {
    const i = new NovaInstrument();
    i.setMissing(true);
    expect(i.attr("bubble/stroke")).toContain("warn");
    i.setMissing(false);
    expect(i.attr("bubble/stroke")).toContain("border");
  });

  it("applies its type code, label and colour token", () => {
    const i = new NovaInstrument({ instrumentType: "TC", label: "TC-3", colorToken: "fault" });
    i.applyLabels();
    expect(i.attr("typeCode/text")).toBe("TC");
    expect(i.attr("sensorName/text")).toBe("TC-3");
    expect(i.attr("bubble/stroke")).toBe("#ef4444");
    expect(i.attr("typeCode/fill")).toBe("#ef4444");
    i.set("colorToken", "");
    i.applyColour();
    expect(i.attr("bubble/stroke")).toContain("border");
    i.set("colorToken", "not-a-token");
    i.applyColour();
    expect(i.attr("bubble/stroke")).toContain("border");
  });
});

describe("NovaValve", () => {
  it("starts unbound, uncontrollable and showing UNKNOWN", () => {
    const v = new NovaValve();
    expect(v.bindingName()).toBeNull();
    expect(v.isControllable()).toBe(false);
    expect(v.attr("badgeText/text")).toBe("UNKNOWN");
  });

  it("reports its binding and controllability", () => {
    const v = new NovaValve({ binding: { name: "SV1" }, controllable: true });
    expect(v.bindingName()).toBe("SV1");
    expect(v.isControllable()).toBe(true);
    expect(new NovaValve({ controllable: "yes" }).isControllable()).toBe(false);
  });

  it("badges open as green, closed as red, anything else neutral, and takes a label override", () => {
    const v = new NovaValve();
    v.setBadge("open");
    expect(v.attr("badgeText/text")).toBe("OPEN");
    expect(v.attr("badgeText/fill")).toContain("nominal");
    v.setBadge("closed");
    expect(v.attr("badgeText/text")).toBe("CLOSED");
    expect(v.attr("badgeText/fill")).toContain("fault");
    v.setBadge("custom", "HALF");
    expect(v.attr("badgeText/text")).toBe("HALF");
    expect(v.attr("badgeText/fill")).toContain("muted");
    v.setBadge("open", "ON");
    expect(v.attr("badgeText/text")).toBe("ON");
    v.clearBadge();
    expect(v.attr("badgeText/text")).toBe("UNKNOWN");
  });

  it("draws the variant path, with the actuator cap only for a solenoid", () => {
    const v = new NovaValve({ symbolVariant: "ball3" });
    v.applyLabels();
    const ball3 = v.attr("symbol/d");
    expect(v.attr("actuatorCap/opacity")).toBe(0);
    expect(v.attr("actuatorCap/pointerEvents")).toBe("none");
    v.set("symbolVariant", "solenoid");
    v.applyLabels();
    expect(v.attr("actuatorCap/opacity")).toBe(1);
    expect(v.attr("actuatorCap/pointerEvents")).toBe("auto");
    expect(v.attr("symbol/d")).not.toBe(ball3);
    v.set("symbolVariant", "ball2");
    v.applyLabels();
    expect(v.attr("symbol/d")).toBe(new NovaValve().attr("symbol/d"));
  });

  it("hides the passive badge when a control row shows the state", () => {
    const v = new NovaValve({ controllable: true });
    v.applyLabels();
    expect(v.attr("badgeBg/opacity")).toBe(0);
    expect(v.attr("badgeText/opacity")).toBe(0);
  });

  it("dims, flags missing, and colours", () => {
    const v = new NovaValve({ colorToken: "info", label: "SV1" });
    v.setStale(true);
    expect(v.attr("body/opacity")).toBe(0.45);
    v.setMissing(true);
    expect(v.attr("badgeBg/stroke")).toContain("warn");
    v.applyLabels();
    expect(v.attr("valveLabel/text")).toBe("SV1");
    expect(v.attr("symbol/stroke")).toBe("#3b82f6");
    v.set("colorToken", "");
    v.applyColour();
    expect(v.attr("symbol/stroke")).toContain("primary");
  });
});

describe("NovaVessel, NovaBottle, NovaChamber", () => {
  it("set their name, contents and colour", () => {
    for (const Shape of [NovaVessel, NovaBottle, NovaChamber]) {
      const s = new Shape({ label: "T1", contentsLabel: "LOX", colorToken: "nominal" });
      s.applyLabels();
      expect(s.attr("vesselName/text")).toBe("T1");
      expect(s.attr("contents/text")).toBe("LOX");
      expect(s.attr("vesselName/fill")).toBe("#22c55e");
      (s as dia.Element).set("colorToken", "");
      s.applyColour();
      expect(s.attr("vesselName/fill")).toContain("primary");
    }
  });

  it("colours every outline of a vessel", () => {
    const v = new NovaVessel({ colorToken: "warn" });
    v.applyLabels();
    for (const p of ["tank", "capTop", "capBottom"]) expect(v.attr(`${p}/stroke`)).toBe("#f59e0b");
  });

  it("scales a bottle and a chamber symbol to their size", () => {
    const b = new NovaBottle();
    b.resize(112, 130);
    b.applyScale();
    expect(b.attr("symbol/transform")).toBe("scale(2,1)");
    const c = new NovaChamber();
    c.resize(80, 248);
    c.applyScale();
    expect(c.attr("symbol/transform")).toBe("scale(1,2)");
    b.applyLabels();
    c.applyLabels();
    expect(b.attr("symbol/transform")).toBe("scale(2,1)");
  });

  it("start at their natural size, and a vessel has no symbol scale", () => {
    expect(new NovaBottle().size()).toEqual({ width: 56, height: 130 });
    expect(new NovaChamber().size()).toEqual({ width: 80, height: 124 });
    expect(new NovaVessel().size()).toEqual({ width: 96, height: 140 });
  });
});

describe("NovaTextLabel", () => {
  it("takes its colour from the token, falling back to muted", () => {
    const t = new NovaTextLabel({ colorToken: "accent" });
    t.applyLabels();
    expect(t.attr("label/fill")).toBe("#4d8bff");
    t.set("colorToken", "");
    t.applyColour();
    expect(t.attr("label/fill")).toContain("muted");
  });

  it("changes its font size", () => {
    const t = new NovaTextLabel();
    t.applyTextSize(18);
    expect(t.attr("label/fontSize")).toBe(18);
  });
});

describe("NovaSystemLink", () => {
  it("applies a colour token and reports whether it did", () => {
    const l = new NovaSystemLink({ colorToken: "fault" });
    expect(l.applyColour()).toBe(true);
    expect(l.attr("line/stroke")).toBe("#ef4444");
    const none = new NovaSystemLink();
    expect(none.applyColour()).toBe(false);
    expect(new NovaSystemLink({ colorToken: "bogus" }).applyColour()).toBe(false);
  });

  it("takes a system colour directly", () => {
    const l = new NovaSystemLink();
    l.setSystemColour("#123456");
    expect(l.attr("line/stroke")).toBe("#123456");
  });

  it("routes orthogonally with rounded corners", () => {
    const l = new NovaSystemLink();
    expect(l.get("router")).toEqual({ name: "orthogonal" });
    expect(l.get("connector")).toEqual({ name: "rounded", args: { radius: 8 } });
  });
});

describe("NovaDevice", () => {
  it("badges by state: green, red, neutral, with an override label", () => {
    const d = new NovaDevice({ binding: { name: "IMC1" }, controllable: true });
    expect(d.bindingName()).toBe("IMC1");
    expect(d.isControllable()).toBe(true);
    d.setBadge("open");
    expect(d.attr("badgeText/fill")).toContain("nominal");
    d.setBadge("closed", "OFF");
    expect(d.attr("badgeText/text")).toBe("OFF");
    expect(d.attr("badgeText/fill")).toContain("fault");
    d.setBadge("custom", "ARMED");
    expect(d.attr("badgeText/text")).toBe("ARMED");
    expect(d.attr("badgeText/fill")).toContain("muted");
    d.clearBadge();
    expect(d.attr("badgeText/text")).toBe("UNKNOWN");
  });

  it("starts unbound and uncontrollable", () => {
    const d = new NovaDevice();
    expect(d.bindingName()).toBeNull();
    expect(d.isControllable()).toBe(false);
  });

  it("dims, flags missing, labels and colours", () => {
    const d = new NovaDevice({ label: "IMC", colorToken: "info" });
    d.setStale(true);
    expect(d.attr("body/opacity")).toBe(0.45);
    d.setMissing(true);
    expect(d.attr("box/stroke")).toContain("warn");
    d.setMissing(false);
    expect(d.attr("box/stroke")).toContain("primary");
    d.applyLabels();
    expect(d.attr("deviceLabel/text")).toBe("IMC");
    expect(d.attr("box/stroke")).toBe("#3b82f6");
  });
});

describe("NovaZone", () => {
  it("defaults to the accent colour and labels itself", () => {
    const z = new NovaZone({ label: "PAD" });
    z.applyLabels();
    expect(z.attr("zoneLabel/text")).toBe("PAD");
    expect(z.attr("box/stroke")).toBe("#4d8bff");
  });

  it("takes another token, and falls back to accent for an unknown one", () => {
    const z = new NovaZone({ colorToken: "fault" });
    z.applyColour();
    expect(z.attr("box/stroke")).toBe("#ef4444");
    z.set("colorToken", "bogus");
    z.applyColour();
    expect(z.attr("box/stroke")).toContain("accent");
  });
});

describe("NovaActuatorControl", () => {
  it("starts empty", () => {
    const c = new NovaActuatorControl();
    expect(c.buttonCount()).toBe(0);
    expect(c.bindingName()).toBeNull();
    expect(c.size()).toEqual({ width: 80, height: 43 });
  });

  it("shows its actuator's name unless told to hide it or unnamed", () => {
    const c = new NovaActuatorControl();
    c.setName("SV1");
    expect(c.attr("nameLabel/text")).toBe("SV1");
    expect(c.attr("nameLabel/opacity")).toBe(1);
    c.setName(null);
    expect(c.attr("nameLabel/text")).toBe("");
    expect(c.attr("nameLabel/opacity")).toBe(0);
    c.set("showName", false);
    c.setName("SV1");
    expect(c.attr("nameLabel/opacity")).toBe(0);
  });

  it("lays out a row of buttons, sized to its labels", () => {
    const c = new NovaActuatorControl();
    c.applyButtons([face("OPEN"), face("CLOSED")]);
    expect(c.buttonCount()).toBe(2);
    expect(c.attr("btn0txt/text")).toBe("OPEN");
    expect(c.attr("btn1txt/text")).toBe("CLOSED");
    expect(c.attr("btn0bg/opacity")).toBe(1);
    expect(c.attr("btn2bg/opacity")).toBe(0);
    expect(c.attr("btn1bg/x")).toBeGreaterThan(c.attr("btn0bg/x") as number);
    expect(c.attr("btn0bg/fill")).toBe("bg");
    expect(c.attr("btn0txt/fill")).toBe("tx");
    expect(c.size().width).toBeGreaterThan(80);
  });

  it("moves the buttons up when the name is hidden", () => {
    const shown = new NovaActuatorControl();
    const hidden = new NovaActuatorControl({ showName: false });
    shown.applyButtons([face("ON")]);
    hidden.applyButtons([face("ON")]);
    expect(hidden.attr("btn0bg/y")).toBeLessThan(shown.attr("btn0bg/y") as number);
    expect(hidden.size().height).toBe(shown.size().height - 13);
  });

  it("shows at most the maximum number of buttons", () => {
    const c = new NovaActuatorControl();
    c.applyButtons(Array.from({ length: CONTROL_MAX_BTN + 3 }, (_, i) => face(`B${i}`)));
    expect(c.buttonCount()).toBe(CONTROL_MAX_BTN);
    expect(c.attr(`btn${CONTROL_MAX_BTN - 1}bg/opacity`)).toBe(1);
  });

  it("hides surplus buttons when it shrinks, and clears fully", () => {
    const c = new NovaActuatorControl();
    c.applyButtons([face("A"), face("B"), face("C")]);
    c.applyButtons([face("A")]);
    expect(c.attr("btn1bg/opacity")).toBe(0);
    expect(c.attr("btn2txt/opacity")).toBe(0);
    c.clearButtons();
    expect(c.buttonCount()).toBe(0);
    expect(c.attr("btn0bg/opacity")).toBe(0);
  });

  it("returns to its default width with no buttons", () => {
    const c = new NovaActuatorControl();
    c.applyButtons([face("A")]);
    c.applyButtons([]);
    expect(c.size().width).toBe(80);
  });

  it("flags missing and dims", () => {
    const c = new NovaActuatorControl();
    c.setMissing(true);
    expect(c.attr("nameLabel/fill")).toContain("warn");
    c.setMissing(false);
    expect(c.attr("nameLabel/fill")).toContain("muted");
    c.setStale(true);
    expect(c.attr("body/opacity")).toBe(0.45);
  });
});

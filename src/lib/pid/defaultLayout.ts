/**
 * Default P&ID layout shipped with the Engine page.
 *
 * Vocabulary: Tank/Vessel, Ball2/Solenoid valves, PT/TC/LC instruments only.
 * (§1 compliance — no check/relief/manual valves, no TT/FT instruments.)
 *
 * Binds to common Nova config names.  Missing bindings render with a warning
 * ring but do not crash.
 *
 * Layout: pressurant → fuel/oxidizer propulsion schematic.
 *   Pressurant (blue) → FUEL tank (red) + OX tank (green) → ENGINE
 */
import type { NovaPidLayout } from "./serializer";
import type { dia } from "@joint/core";

function el(
  id: string,
  type: string,
  x: number,
  y: number,
  extra: Record<string, unknown> = {},
): dia.Cell.JSON {
  return { id, type, position: { x, y }, ...extra } as dia.Cell.JSON;
}

function link(
  id: string,
  sourceId: string,
  targetId: string,
  systemId: string,
  sourcePort?: string,
  targetPort?: string,
): dia.Cell.JSON {
  return {
    id,
    type: "nova.SystemLink",
    systemId,
    source: sourcePort ? { id: sourceId, port: sourcePort } : { id: sourceId },
    target: targetPort ? { id: targetId, port: targetPort } : { id: targetId },
  } as unknown as dia.Cell.JSON;
}

export const DEFAULT_LAYOUT: NovaPidLayout = {
  schemaVersion: 1,
  meta: { name: "Default", savedAt: "2026-06-01T00:00:00.000Z", app: "novaops" },
  systems: {
    pressurant: { label: "Pressurant", colorToken: "info" },
    fuel:       { label: "Fuel",       colorToken: "fault" },
    oxidizer:   { label: "Oxidizer",   colorToken: "nominal" },
  },
  graph: {
    cells: [
      // ---- Vessels ----
      el("vessel-pressurant", "nova.Bottle", 60, 160, {
        size: { width: 56, height: 130 },
        label: "PRESS", contentsLabel: "N₂",
        colorToken: "info",
      }),
      el("vessel-fuel", "nova.Vessel", 300, 60, {
        size: { width: 96, height: 130 },
        label: "FUEL", contentsLabel: "IPA",
        colorToken: "fault",
      }),
      el("vessel-oxidizer", "nova.Vessel", 300, 290, {
        size: { width: 96, height: 130 },
        label: "OX", contentsLabel: "N₂O",
        colorToken: "nominal",
      }),

      // ---- Instruments ----
      el("instr-pgso", "nova.Instrument", 180, 185, {
        size: { width: 188, height: 76 },
        binding: { name: "PGSO" },
        instrumentType: "PT",
        label: "PGSO",
        hint: { unit: "psi", range: [0, 800] },
        colorToken: "info",
      }),
      el("instr-pft", "nova.Instrument", 440, 80, {
        size: { width: 188, height: 76 },
        binding: { name: "PFT" },
        instrumentType: "PT",
        label: "PFT",
        hint: { unit: "psi", range: [0, 500] },
        colorToken: "fault",
      }),
      el("instr-pox", "nova.Instrument", 440, 300, {
        size: { width: 188, height: 76 },
        binding: { name: "POX" },
        instrumentType: "PT",
        label: "POX",
        hint: { unit: "psi", range: [0, 500] },
        colorToken: "nominal",
      }),

      // ---- Valves ----
      // 2-way ball valve: pressurant line isolation
      el("valve-bvpress", "nova.Valve", 170, 185, {
        size: { width: 80, height: 96 },
        binding: { name: "BVPRESS" },
        symbolVariant: "ball2",
        controllable: true,
        label: "BV-PRESS",
        colorToken: "info",
        controlId: "ctrl-bvpress",
      }),
      // Solenoid: fuel tank outlet
      el("valve-svftv", "nova.Valve", 650, 80, {
        size: { width: 80, height: 96 },
        binding: { name: "SVFTV" },
        symbolVariant: "solenoid",
        controllable: true,
        label: "SVFTV",
        colorToken: "fault",
        controlId: "ctrl-svftv",
      }),
      // Solenoid: oxidizer tank outlet
      el("valve-bvftp", "nova.Valve", 650, 300, {
        size: { width: 80, height: 96 },
        binding: { name: "BVFTP" },
        symbolVariant: "solenoid",
        controllable: true,
        label: "BVFTP",
        colorToken: "nominal",
        controlId: "ctrl-bvftp",
      }),

      // ---- Control rows (separate, movable cells beneath each valve) ----
      el("ctrl-bvpress", "nova.ActuatorControl", 150, 285, {
        binding: { name: "BVPRESS" }, showName: false,
      }),
      el("ctrl-svftv", "nova.ActuatorControl", 630, 180, {
        binding: { name: "SVFTV" }, showName: false,
      }),
      el("ctrl-bvftp", "nova.ActuatorControl", 630, 400, {
        binding: { name: "BVFTP" }, showName: false,
      }),

      // ---- Combustion chamber ----
      el("chamber-engine", "nova.Chamber", 770, 150, {
        size: { width: 80, height: 124 },
        label: "ENGINE", contentsLabel: "",
        colorToken: "warn",
      }),

      // ---- System links ----
      // Pressurant vessel → pressurant ball valve
      link("lnk-press-bv",   "vessel-pressurant", "valve-bvpress",  "pressurant"),
      // Pressurant ball valve → pressurant instrument
      link("lnk-bv-pgso",    "valve-bvpress",     "instr-pgso",     "pressurant"),
      // Pressurant → fuel tank
      link("lnk-press-fuel", "instr-pgso",        "vessel-fuel",    "pressurant"),
      // Pressurant → oxidizer tank
      link("lnk-press-ox",   "instr-pgso",        "vessel-oxidizer","pressurant"),
      // Fuel tank → fuel PT
      link("lnk-fuel-pft",   "vessel-fuel",       "instr-pft",      "fuel"),
      // Fuel PT → fuel solenoid
      link("lnk-pft-svftv",  "instr-pft",         "valve-svftv",    "fuel"),
      // Oxidizer tank → oxidizer PT
      link("lnk-ox-pox",     "vessel-oxidizer",   "instr-pox",      "oxidizer"),
      // Oxidizer PT → oxidizer solenoid
      link("lnk-pox-bvftp",  "instr-pox",         "valve-bvftp",    "oxidizer"),
      // Fuel solenoid → engine
      link("lnk-svftv-eng",  "valve-svftv",       "chamber-engine", "fuel"),
      // Oxidizer solenoid → engine
      link("lnk-bvftp-eng",  "valve-bvftp",       "chamber-engine", "oxidizer"),
    ],
  },
};

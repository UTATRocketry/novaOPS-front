import { dia, shapes } from "@joint/core";
import { describe, expect, it } from "vitest";

import { DEFAULT_LAYOUT } from "./defaultLayout";
import { DEFAULT_SYSTEMS } from "./registry";
import { NOVA_NAMESPACE } from "./shapes";
import {
  deserializeLayout,
  parseLayout,
  serializeLayout,
  validateLayout,
} from "./serializer";
import type { NovaPidLayout } from "./serializer";
import defaultJson from "./defaultLayout.json";
import testJson from "./testLayout.json";

const newGraph = () => new dia.Graph({}, { cellNamespace: { ...shapes, ...NOVA_NAMESPACE } });
const names = (...n: string[]) => new Set(n);

function cellsOfType(layout: NovaPidLayout, type: string) {
  return layout.graph.cells.filter((c) => c.type === type) as Array<Record<string, any>>;
}

describe("validateLayout / parseLayout", () => {
  it("accepts a layout marked as a novaops layout", () => {
    expect(validateLayout(testJson)).not.toBeNull();
    expect(validateLayout(defaultJson)).not.toBeNull();
  });

  it.each([null, undefined, 42, "layout", true])("rejects %j", (value) => {
    expect(validateLayout(value)).toBeNull();
  });

  it("rejects an object that is not marked as a novaops layout", () => {
    expect(validateLayout({})).toBeNull();
    expect(validateLayout({ meta: { app: "other" } })).toBeNull();
    expect(validateLayout({ meta: null })).toBeNull();
  });

  it("parses JSON text and returns null for invalid JSON", () => {
    expect(parseLayout(JSON.stringify(testJson))?.meta.name).toBe("P&ID Layout");
    expect(parseLayout("{not json")).toBeNull();
    expect(parseLayout("")).toBeNull();
    expect(parseLayout("null")).toBeNull();
  });

  // Known gap: validateLayout only checks the "novaops" marker, so a file with no
  // graph passes and then makes deserializeLayout throw on layout.graph.cells.
  it.fails("rejects a novaops layout that has no graph cells", () => {
    expect(validateLayout({ schemaVersion: 1, meta: { app: "novaops" }, systems: {} })).toBeNull();
  });
});

describe("shipped layouts", () => {
  it("DEFAULT_LAYOUT is a valid layout", () => {
    expect(validateLayout(DEFAULT_LAYOUT)).not.toBeNull();
    expect(DEFAULT_LAYOUT.schemaVersion).toBe(1);
  });

  it.each([
    ["defaultLayout.json", defaultJson],
    ["testLayout.json", testJson],
  ])("%s loads with every cell id unique and links pointing at real cells", (_name, json) => {
    const layout = json as unknown as NovaPidLayout;
    const ids = layout.graph.cells.map((c) => c.id as string);
    expect(new Set(ids).size).toBe(ids.length);
    for (const link of layout.graph.cells.filter((c) => c.type === "nova.SystemLink") as Array<Record<string, any>>) {
      for (const end of [link.source, link.target]) {
        if (end?.id) expect(ids).toContain(end.id);
      }
      if (link.systemId) expect(layout.systems).toHaveProperty(link.systemId);
    }
  });

  it("DEFAULT_LAYOUT is built from the same file the code comment names", () => {
    // defaultLayout.ts says the layout "lives in defaultLayout.json" but imports
    // testLayout.json; this records which one is really shipped.
    expect(DEFAULT_LAYOUT.graph.cells.length).toBe(testJson.graph.cells.length);
  });
});

describe("deserializeLayout", () => {
  it("loads every cell of the shipped layout into the graph", () => {
    const graph = newGraph();
    deserializeLayout(DEFAULT_LAYOUT, graph, names(), names());
    expect(graph.getCells()).toHaveLength(DEFAULT_LAYOUT.graph.cells.length);
  });

  it("reports every instrument and valve whose binding is not in the config", () => {
    const layout = DEFAULT_LAYOUT;
    const instruments = cellsOfType(layout, "nova.Instrument").filter((c) => c.binding?.name);
    const valves = cellsOfType(layout, "nova.Valve").filter((c) => c.binding?.name);
    const report = deserializeLayout(layout, newGraph(), names(), names());
    expect(report.missingBindings.filter((m) => m.kind === "sensor")).toHaveLength(instruments.length);
    expect(report.missingBindings.filter((m) => m.kind === "actuator")).toHaveLength(valves.length);
  });

  it("reports nothing missing when the config has every bound name", () => {
    const layout = DEFAULT_LAYOUT;
    const sensors = new Set(cellsOfType(layout, "nova.Instrument").map((c) => c.binding?.name).filter(Boolean));
    const actuators = new Set(cellsOfType(layout, "nova.Valve").map((c) => c.binding?.name).filter(Boolean));
    const report = deserializeLayout(layout, newGraph(), sensors, actuators);
    expect(report.missingBindings).toEqual([]);
  });

  it("still loads the whole layout when bindings are missing", () => {
    const graph = newGraph();
    const report = deserializeLayout(DEFAULT_LAYOUT, graph, names(), names());
    expect(report.missingBindings.length).toBeGreaterThan(0);
    expect(graph.getCells()).toHaveLength(DEFAULT_LAYOUT.graph.cells.length);
  });

  it("does not report an unbound instrument", () => {
    const layout: NovaPidLayout = {
      ...DEFAULT_LAYOUT,
      graph: { cells: [{ id: "i", type: "nova.Instrument", position: { x: 0, y: 0 }, size: { width: 10, height: 10 }, binding: null } as never] },
    };
    expect(deserializeLayout(layout, newGraph(), names(), names()).missingBindings).toEqual([]);
  });

  it("reports a link whose system is not in the registry", () => {
    const base = DEFAULT_LAYOUT;
    const link = cellsOfType(base, "nova.SystemLink")[0];
    const layout: NovaPidLayout = { ...base, systems: {}, graph: { cells: base.graph.cells } };
    const report = deserializeLayout(layout, newGraph(), names(), names());
    expect(report.unknownSystems.length).toBeGreaterThan(0);
    expect(report.unknownSystems.map((u) => u.systemId)).toContain(link.systemId);
  });

  it("reports no unknown systems for the shipped layout and its own registry", () => {
    const report = deserializeLayout(DEFAULT_LAYOUT, newGraph(), names(), names());
    expect(report.unknownSystems).toEqual([]);
  });
});

describe("serializeLayout", () => {
  it("round-trips the shipped layout: same cells, same geometry", () => {
    const graph = newGraph();
    deserializeLayout(DEFAULT_LAYOUT, graph, names(), names());
    const out = serializeLayout(graph, DEFAULT_LAYOUT.systems, "Round trip");

    expect(out.schemaVersion).toBe(1);
    expect(out.meta).toMatchObject({ name: "Round trip", app: "novaops" });
    expect(out.systems).toBe(DEFAULT_LAYOUT.systems);
    expect(out.graph.cells).toHaveLength(DEFAULT_LAYOUT.graph.cells.length);

    const byId = new Map(out.graph.cells.map((c) => [c.id, c as Record<string, any>]));
    for (const cell of DEFAULT_LAYOUT.graph.cells as Array<Record<string, any>>) {
      const saved = byId.get(cell.id);
      expect(saved, `cell ${cell.id}`).toBeDefined();
      expect(saved!.type).toBe(cell.type);
      if (cell.position) expect(saved!.position).toEqual(cell.position);
      if (cell.size) expect(saved!.size).toEqual(cell.size);
      if (cell.binding) expect(saved!.binding).toEqual(cell.binding);
    }
  });

  it("is stable: serialising a reloaded layout gives the same cells again", () => {
    const g1 = newGraph();
    deserializeLayout(DEFAULT_LAYOUT, g1, names(), names());
    const first = serializeLayout(g1, DEFAULT_SYSTEMS);
    const g2 = newGraph();
    deserializeLayout(first, g2, names(), names());
    const second = serializeLayout(g2, DEFAULT_SYSTEMS);
    expect(second.graph.cells).toEqual(first.graph.cells);
  });

  it("strips the runtime body opacity from every cell", () => {
    const graph = newGraph();
    graph.addCell(
      new shapes.standard.Rectangle({ id: "r", position: { x: 1, y: 2 }, size: { width: 3, height: 4 }, attrs: { body: { opacity: 0.4, fill: "red" } } }),
    );
    const cell = serializeLayout(graph, {}).graph.cells[0] as Record<string, any>;
    expect(cell.attrs.body.opacity).toBeUndefined();
    expect(cell.attrs.body.fill).toBe("red");
  });

  it("leaves the live graph's opacity alone", () => {
    const graph = newGraph();
    graph.addCell(
      new shapes.standard.Rectangle({ id: "r", position: { x: 0, y: 0 }, size: { width: 1, height: 1 }, attrs: { body: { opacity: 0.4 } } }),
    );
    serializeLayout(graph, {});
    expect(graph.getCell("r").attr("body/opacity")).toBe(0.4);
  });

  it("names an unnamed layout 'Untitled' and stamps an ISO date", () => {
    const out = serializeLayout(newGraph(), {});
    expect(out.meta.name).toBe("Untitled");
    expect(new Date(out.meta.savedAt).toISOString()).toBe(out.meta.savedAt);
    expect(out.graph.cells).toEqual([]);
  });

  it("survives a JSON round trip through parseLayout", () => {
    const graph = newGraph();
    deserializeLayout(DEFAULT_LAYOUT, graph, names(), names());
    const text = JSON.stringify(serializeLayout(graph, DEFAULT_SYSTEMS));
    expect(parseLayout(text)?.graph.cells).toHaveLength(DEFAULT_LAYOUT.graph.cells.length);
  });
});

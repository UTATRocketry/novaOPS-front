import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  LAYOUT_VERSION,
  clearLayout,
  defaultLayout,
  loadLayout,
  newTableId,
  nextTableTitle,
  reconcileLayout,
  saveLayout,
} from "./tableLayout";
import type { TableLayout } from "./tableLayout";

const layout = (tables: Array<[string, string, string[]]>, hidden: string[] = []): TableLayout => ({
  version: 1,
  tables: tables.map(([id, title, names]) => ({ id, title, names })),
  hidden,
});

describe("newTableId / defaultLayout / nextTableTitle", () => {
  it("mints unique table ids", () => {
    const ids = Array.from({ length: 50 }, () => newTableId());
    expect(new Set(ids).size).toBe(50);
  });

  it("starts with one table holding every row, nothing hidden", () => {
    const l = defaultLayout("Sensors", ["a", "b"]);
    expect(l).toMatchObject({ version: LAYOUT_VERSION, hidden: [] });
    expect(l.tables).toHaveLength(1);
    expect(l.tables[0]).toMatchObject({ title: "Sensors", names: ["a", "b"] });
  });

  it("copies the names rather than sharing the caller's array", () => {
    const names = ["a"];
    defaultLayout("S", names).tables[0].names.push("b");
    expect(names).toEqual(["a"]);
  });

  it("titles added tables 'Base', 'Base 2', 'Base 3'", () => {
    expect(nextTableTitle("Actuators", [])).toBe("Actuators");
    const one = layout([["1", "Actuators", []]]).tables;
    expect(nextTableTitle("Actuators", one)).toBe("Actuators 2");
    expect(nextTableTitle("Actuators", [...one, ...one])).toBe("Actuators 3");
  });
});

describe("reconcileLayout", () => {
  it("builds a default layout when nothing is stored", () => {
    expect(reconcileLayout(null, ["a", "b"], "T").tables[0].names).toEqual(["a", "b"]);
  });

  it("builds a default layout when the stored one has no tables", () => {
    expect(reconcileLayout(layout([]), ["a"], "T").tables[0].names).toEqual(["a"]);
  });

  it("keeps the operator's order and table split", () => {
    const out = reconcileLayout(layout([["1", "A", ["c", "a"]], ["2", "B", ["b"]]]), ["a", "b", "c"], "T");
    expect(out.tables.map((t) => t.names)).toEqual([["c", "a"], ["b"]]);
  });

  it("drops names that left the config, from tables and from hidden", () => {
    const out = reconcileLayout(layout([["1", "A", ["a", "gone"]]], ["gone", "a"]), ["a"], "T");
    expect(out.tables[0].names).toEqual(["a"]);
    expect(out.hidden).toEqual(["a"]);
  });

  it("appends a newly added channel to the first table so it is always visible", () => {
    const out = reconcileLayout(layout([["1", "A", ["a"]], ["2", "B", ["b"]]]), ["a", "b", "new"], "T");
    expect(out.tables[0].names).toEqual(["a", "new"]);
    expect(out.tables[1].names).toEqual(["b"]);
  });

  it("collapses a name that appears in two tables, keeping the first", () => {
    const out = reconcileLayout(layout([["1", "A", ["a"]], ["2", "B", ["a", "b"]]]), ["a", "b"], "T");
    expect(out.tables.map((t) => t.names)).toEqual([["a"], ["b"]]);
  });

  it("puts every config name in exactly one table, whatever was stored", () => {
    const names = ["a", "b", "c", "d"];
    const out = reconcileLayout(layout([["1", "A", ["d", "x", "d"]], ["2", "B", ["y", "a"]]]), names, "T");
    expect(out.tables.flatMap((t) => t.names).sort()).toEqual(names);
  });

  it("does not modify the stored layout", () => {
    const stored = layout([["1", "A", ["a", "gone"]]], ["gone"]);
    reconcileLayout(stored, ["a", "new"], "T");
    expect(stored.tables[0].names).toEqual(["a", "gone"]);
    expect(stored.hidden).toEqual(["gone"]);
  });

  it("keeps hidden names that are still in the config", () => {
    expect(reconcileLayout(layout([["1", "A", ["a", "b"]]], ["b"]), ["a", "b"], "T").hidden).toEqual(["b"]);
  });
});

describe("storage", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("round-trips a layout", () => {
    const l = layout([["1", "A", ["a", "b"]]], ["b"]);
    saveLayout("k", l);
    expect(loadLayout("k")).toEqual(l);
  });

  it("returns null when nothing is stored", () => {
    expect(loadLayout("missing")).toBeNull();
  });

  it("keeps different keys separate", () => {
    saveLayout("sensors", layout([["1", "S", ["a"]]]));
    saveLayout("actuators", layout([["1", "A", ["v"]]]));
    expect(loadLayout("sensors")?.tables[0].names).toEqual(["a"]);
    expect(loadLayout("actuators")?.tables[0].names).toEqual(["v"]);
  });

  it("clearLayout removes only that key", () => {
    saveLayout("a", layout([["1", "A", []]]));
    saveLayout("b", layout([["1", "B", []]]));
    clearLayout("a");
    expect(loadLayout("a")).toBeNull();
    expect(loadLayout("b")).not.toBeNull();
  });

  it.each([
    ["invalid JSON", "{nope"],
    ["a non-object", "5"],
    ["null", "null"],
    ["another version", JSON.stringify({ version: 2, tables: [{ id: "1", title: "A", names: [] }], hidden: [] })],
    ["no tables", JSON.stringify({ version: 1, tables: [], hidden: [] })],
    ["tables that are not a list", JSON.stringify({ version: 1, tables: "x", hidden: [] })],
    ["a table with no id", JSON.stringify({ version: 1, tables: [{ title: "A", names: [] }], hidden: [] })],
    ["a table with no title", JSON.stringify({ version: 1, tables: [{ id: "1", names: [] }], hidden: [] })],
    ["a table whose names are not a list", JSON.stringify({ version: 1, tables: [{ id: "1", title: "A", names: "a" }], hidden: [] })],
  ])("falls back to defaults for %s", (_n, raw) => {
    localStorage.setItem("k", raw);
    expect(loadLayout("k")).toBeNull();
  });

  it("drops non-string names and tolerates a missing hidden list", () => {
    localStorage.setItem("k", JSON.stringify({ version: 1, tables: [{ id: "1", title: "A", names: ["a", 5, null] }] }));
    expect(loadLayout("k")).toEqual(layout([["1", "A", ["a"]]], []));
  });

  it("survives storage that throws (private mode, quota)", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(loadLayout("k")).toBeNull();
    expect(() => saveLayout("k", layout([["1", "A", []]]))).not.toThrow();
    expect(() => clearLayout("k")).not.toThrow();
  });
});

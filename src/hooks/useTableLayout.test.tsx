import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { loadLayout, saveLayout } from "@/lib/engine/tableLayout";
import { useTableLayout } from "./useTableLayout";

const KEY = "test.layout";
const NAMES = ["a", "b", "c"];

function setup(names = NAMES, key = KEY) {
  return renderHook(({ names, key }) => useTableLayout(key, names, "Sensors"), { initialProps: { names, key } });
}

const rows = (view: ReturnType<typeof setup>) => view.result.current.tables.map((t) => t.names);

beforeEach(() => localStorage.clear());

describe("useTableLayout", () => {
  it("starts as one table with every row, then reports hydrated once storage is read", async () => {
    const view = setup();
    expect(rows(view)).toEqual([NAMES]);
    await waitFor(() => expect(view.result.current.hydrated).toBe(true));
    expect(view.result.current.hiddenCount).toBe(0);
  });

  it("restores a saved layout after hydrating", async () => {
    saveLayout(KEY, { version: 1, tables: [{ id: "t1", title: "Mine", names: ["c", "a"] }, { id: "t2", title: "Other", names: ["b"] }], hidden: ["b"] });
    const view = setup();
    await waitFor(() => expect(view.result.current.hydrated).toBe(true));
    expect(rows(view)).toEqual([["c", "a"], ["b"]]);
    expect([...view.result.current.hidden]).toEqual(["b"]);
    expect(view.result.current.hiddenCount).toBe(1);
  });

  it("never loses a channel the config still has, even if the saved layout predates it", async () => {
    saveLayout(KEY, { version: 1, tables: [{ id: "t1", title: "T", names: ["a"] }], hidden: [] });
    const view = setup(["a", "b", "c"]);
    await waitFor(() => expect(view.result.current.hydrated).toBe(true));
    expect(rows(view)).toEqual([["a", "b", "c"]]);
  });

  it("reconciles when the config's names change", async () => {
    const view = setup(["a", "b"]);
    await waitFor(() => expect(view.result.current.hydrated).toBe(true));
    view.rerender({ names: ["a", "b", "z"], key: KEY });
    expect(rows(view)).toEqual([["a", "b", "z"]]);
    view.rerender({ names: ["z"], key: KEY });
    expect(rows(view)).toEqual([["z"]]);
  });

  it("keeps the same tables when only the identity of the names array changes", async () => {
    const view = setup(["a", "b"]);
    await waitFor(() => expect(view.result.current.hydrated).toBe(true));
    const before = view.result.current.tables;
    view.rerender({ names: ["a", "b"], key: KEY });
    expect(view.result.current.tables).toBe(before);
  });

  describe("hiding rows", () => {
    it("toggles a row hidden and visible again, saving each change", async () => {
      const view = setup();
      await waitFor(() => expect(view.result.current.hydrated).toBe(true));
      act(() => view.result.current.toggleHidden("b"));
      expect(view.result.current.hidden.has("b")).toBe(true);
      expect(loadLayout(KEY)?.hidden).toEqual(["b"]);
      act(() => view.result.current.toggleHidden("b"));
      expect(view.result.current.hiddenCount).toBe(0);
      expect(loadLayout(KEY)?.hidden).toEqual([]);
    });

    it("unhideAll clears every hidden row", async () => {
      const view = setup();
      await waitFor(() => expect(view.result.current.hydrated).toBe(true));
      act(() => view.result.current.toggleHidden("a"));
      act(() => view.result.current.toggleHidden("b"));
      expect(view.result.current.hiddenCount).toBe(2);
      act(() => view.result.current.unhideAll());
      expect(view.result.current.hiddenCount).toBe(0);
    });

    it("does not hide anything the config no longer has", async () => {
      saveLayout(KEY, { version: 1, tables: [{ id: "t1", title: "T", names: ["a", "b"] }], hidden: ["b"] });
      const view = setup(["a", "b"]);
      await waitFor(() => expect(view.result.current.hiddenCount).toBe(1));
      view.rerender({ names: ["a"], key: KEY });
      expect(view.result.current.hiddenCount).toBe(0);
    });
  });

  describe("tables", () => {
    it("adds an empty, titled table and saves it", async () => {
      const view = setup();
      await waitFor(() => expect(view.result.current.hydrated).toBe(true));
      act(() => view.result.current.addTable());
      expect(view.result.current.tables.map((t) => t.title)).toEqual(["Sensors", "Sensors 2"]);
      expect(rows(view)).toEqual([NAMES, []]);
      expect(loadLayout(KEY)?.tables).toHaveLength(2);
    });

    it("folds a removed table's rows into the first remaining one, losing nothing", async () => {
      const view = setup();
      await waitFor(() => expect(view.result.current.hydrated).toBe(true));
      act(() => view.result.current.addTable());
      const [first, second] = view.result.current.tables;
      act(() => view.result.current.setTables([{ ...first, names: ["a"] }, { ...second, names: ["b", "c"] }]));
      act(() => view.result.current.removeTable(second.id));
      expect(rows(view)).toEqual([["a", "b", "c"]]);
    });

    it("never removes the last table", async () => {
      const view = setup();
      await waitFor(() => expect(view.result.current.hydrated).toBe(true));
      act(() => view.result.current.removeTable(view.result.current.tables[0].id));
      expect(view.result.current.tables).toHaveLength(1);
    });

    it("ignores removal of an unknown table", async () => {
      const view = setup();
      await waitFor(() => expect(view.result.current.hydrated).toBe(true));
      act(() => view.result.current.addTable());
      act(() => view.result.current.removeTable("nope"));
      expect(view.result.current.tables).toHaveLength(2);
    });
  });

  describe("setTables (drag and drop)", () => {
    it("replaces the tables and saves them", async () => {
      const view = setup();
      await waitFor(() => expect(view.result.current.hydrated).toBe(true));
      const [t] = view.result.current.tables;
      act(() => view.result.current.setTables([{ ...t, names: ["c", "b", "a"] }]));
      expect(rows(view)).toEqual([["c", "b", "a"]]);
      expect(loadLayout(KEY)?.tables[0].names).toEqual(["c", "b", "a"]);
    });

    it("keeps the same objects for a no-op drop", async () => {
      const view = setup();
      await waitFor(() => expect(view.result.current.hydrated).toBe(true));
      const before = view.result.current.tables;
      act(() => view.result.current.setTables(before.map((t) => ({ ...t, names: [...t.names] }))));
      expect(view.result.current.tables).toBe(before);
    });

    it("can update without saving", async () => {
      const view = setup();
      await waitFor(() => expect(view.result.current.hydrated).toBe(true));
      const [t] = view.result.current.tables;
      act(() => view.result.current.setTables([{ ...t, names: ["b", "a", "c"] }], false));
      expect(rows(view)).toEqual([["b", "a", "c"]]);
      expect(loadLayout(KEY)).toBeNull();
    });
  });

  it("reset discards the saved layout and returns to one table in config order", async () => {
    const view = setup();
    await waitFor(() => expect(view.result.current.hydrated).toBe(true));
    act(() => view.result.current.toggleHidden("a"));
    act(() => view.result.current.addTable());
    act(() => view.result.current.reset());
    expect(rows(view)).toEqual([NAMES]);
    expect(view.result.current.hiddenCount).toBe(0);
    expect(loadLayout(KEY)).toBeNull();
  });

  it("keeps separate sections independent through their storage keys", async () => {
    const sensors = setup(NAMES, "sensors");
    const actuators = setup(["v1"], "actuators");
    await waitFor(() => expect(sensors.result.current.hydrated).toBe(true));
    act(() => sensors.result.current.toggleHidden("a"));
    expect(loadLayout("sensors")?.hidden).toEqual(["a"]);
    expect(loadLayout("actuators")).toBeNull();
    expect(actuators.result.current.hiddenCount).toBe(0);
  });
});

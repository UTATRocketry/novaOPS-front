import { Table } from "@chakra-ui/react";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { DragEndEvent } from "@dnd-kit/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { uploadConfig } from "@/lib/api";
import { useNovaStore } from "@/lib/store/store";
import type { ActuatorEntry, SensorEntry } from "@/lib/types";
import { loadLayout, saveLayout } from "@/lib/engine/tableLayout";
import { renderWithProviders } from "@/test/render";
import { EngineTable } from "./EngineTable";
import { UploadConfigModal } from "./UploadConfigModal";
import { TableSection } from "./table/TableSection";

vi.mock("@/lib/api", () => ({ uploadConfig: vi.fn(), getConfig: vi.fn(() => new Promise(() => {})) }));
vi.mock("@/lib/api/commands", () => ({ sendCommand: vi.fn() }));

// Capture the drag handlers so drops can be simulated without a pointer.
const dnd: { onDragEnd?: (e: DragEndEvent) => void; onDragStart?: (e: { active: { id: string } }) => void } = {};
vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>();
  return {
    ...actual,
    DndContext: ({ onDragEnd, onDragStart, children }: { onDragEnd: (e: DragEndEvent) => void; onDragStart: (e: never) => void; children: React.ReactNode }) => {
      dnd.onDragEnd = onDragEnd;
      dnd.onDragStart = onDragStart as never;
      return <>{children}</>;
    },
    DragOverlay: () => null,
  };
});

const initial = useNovaStore.getInitialState();
const flush = () => act(async () => {});

beforeEach(() => {
  useNovaStore.setState(initial, true);
  localStorage.clear();
  vi.mocked(uploadConfig).mockReset();
});

// ---------------------------------------------------------------------------

describe("UploadConfigModal", () => {
  const yaml = (name = "flight.yaml", body = "Sensors: []") => new File([body], name, { type: "text/yaml" });
  const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;
  const pick = (f: File) => fireEvent.change(fileInput(), { target: { files: [f] } });
  const upload = () => screen.getByText(/^Upload$|^Uploading/);

  function open(onClose = vi.fn()) {
    const view = renderWithProviders(<UploadConfigModal onClose={onClose} />);
    return { ...view, onClose };
  }

  it("asks for a YAML file and only accepts .yaml or .yml", () => {
    open();
    expect(screen.getByText("Click to choose a YAML config file")).toBeInTheDocument();
    expect(fileInput()).toHaveAttribute("accept", ".yaml,.yml");
    expect(upload()).toHaveAttribute("aria-disabled", "true");
  });

  it("shows the chosen file's name and size", () => {
    open();
    pick(yaml("flight.yaml", "x".repeat(2048)));
    expect(screen.getByText("flight.yaml")).toBeInTheDocument();
    expect(screen.getByText("2.0 KB")).toBeInTheDocument();
    expect(upload()).toHaveAttribute("aria-disabled", "false");
  });

  it("uploads the chosen file and says it worked", async () => {
    vi.mocked(uploadConfig).mockResolvedValue({});
    open();
    const file = yaml();
    pick(file);
    fireEvent.click(upload());
    await waitFor(() => expect(screen.getByText(/Config uploaded/)).toBeInTheDocument());
    expect(uploadConfig).toHaveBeenCalledWith(file);
    expect(screen.getByText("Close")).toBeInTheDocument();
    expect(screen.queryByText("Upload")).not.toBeInTheDocument();
  });

  it("sends nothing until a file is chosen", () => {
    open();
    fireEvent.click(upload());
    expect(uploadConfig).not.toHaveBeenCalled();
  });

  it("shows the backend's reason when the upload is rejected, and allows another try", async () => {
    vi.mocked(uploadConfig).mockRejectedValue(new Error("Invalid config: duplicate sensor name"));
    open();
    pick(yaml());
    fireEvent.click(upload());
    expect(await screen.findByText("Invalid config: duplicate sensor name")).toBeInTheDocument();
    expect(upload()).toHaveAttribute("aria-disabled", "false");
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("clears an earlier error when a new file is chosen", async () => {
    vi.mocked(uploadConfig).mockRejectedValue(new Error("bad"));
    open();
    pick(yaml("a.yaml"));
    fireEvent.click(upload());
    await screen.findByText("bad");
    pick(yaml("b.yaml"));
    expect(screen.queryByText("bad")).not.toBeInTheDocument();
  });

  it("shows progress and ignores a second click while uploading", async () => {
    vi.mocked(uploadConfig).mockReturnValue(new Promise(() => {}));
    open();
    pick(yaml());
    fireEvent.click(upload());
    await flush();
    expect(screen.getByText("Uploading…")).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(screen.getByText("Uploading…"));
    expect(uploadConfig).toHaveBeenCalledTimes(1);
  });

  it("closes from Cancel, and from a click on the overlay but not on the dialog itself", () => {
    const { onClose, container } = open();
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("Upload Config"));
    expect(onClose).toHaveBeenCalledTimes(1);
    // next-themes puts a <script> first, so take the first <div> as the overlay.
    fireEvent.click(container.querySelector("div")!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------

describe("TableSection", () => {
  interface Item {
    name: string;
  }
  const items = (...names: string[]): Item[] => names.map((name) => ({ name }));

  function section(opts: { items?: Item[]; editing?: boolean; storageKey?: string } = {}) {
    const onEditingChange = vi.fn();
    const props = {
      storageKey: opts.storageKey ?? "t.layout",
      baseTitle: "Things",
      items: opts.items ?? items("a", "b", "c"),
      getName: (i: Item) => i.name,
      header: <Table.ColumnHeader>Name</Table.ColumnHeader>,
      emptyMessage: "Nothing here.",
      editing: opts.editing ?? false,
      onEditingChange,
      renderRow: (item: Item, row: { editing: boolean; hidden: boolean; onToggleHidden: (n: string) => void }) => (
        <Table.Row key={item.name} data-testid={`row-${item.name}`}>
          <Table.Cell>
            {item.name}
            {row.hidden ? " (hidden)" : ""}
            {row.editing && <button onClick={() => row.onToggleHidden(item.name)}>toggle {item.name}</button>}
          </Table.Cell>
        </Table.Row>
      ),
    };
    const view = renderWithProviders(<TableSection<Item> {...props} />);
    const again = (over: Partial<typeof props> = {}) =>
      view.rerender(<TableSection<Item> {...props} {...over} />);
    return { ...view, again, onEditingChange };
  }

  const rowNames = () => screen.queryAllByTestId(/^row-/).map((r) => r.getAttribute("data-testid")!.slice(4));
  const drop = (active: string, over: string | null) =>
    act(() => dnd.onDragEnd!({ active: { id: active }, over: over === null ? null : { id: over } } as DragEndEvent));

  it("shows an empty message and no toolbar when the config has no entries", () => {
    section({ items: [] });
    expect(screen.getByText("Nothing here.")).toBeInTheDocument();
    expect(screen.queryByText("Edit")).not.toBeInTheDocument();
  });

  it("shows every config entry in config order, in one titled table", () => {
    section();
    expect(screen.getByText("Things")).toBeInTheDocument();
    expect(rowNames()).toEqual(["a", "b", "c"]);
  });

  it("toggles edit mode through its callback", () => {
    const { onEditingChange } = section();
    fireEvent.click(screen.getByText("Edit"));
    expect(onEditingChange).toHaveBeenCalledWith(true);
  });

  it("offers Add table and Clear only while editing, plus a notice that values are frozen", () => {
    const view = section();
    expect(screen.queryByText("Add table")).not.toBeInTheDocument();
    view.again({ editing: true });
    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(screen.getByText("Add table")).toBeInTheDocument();
    expect(screen.getByText("Clear")).toBeInTheDocument();
    expect(screen.getByText(/Values frozen while editing — commands disabled/)).toBeInTheDocument();
  });

  describe("tables", () => {
    it("adds an empty table that invites rows to be dragged in, and saves it", () => {
      section({ editing: true });
      fireEvent.click(screen.getByText("Add table"));
      expect(screen.getByText("Things 2")).toBeInTheDocument();
      expect(screen.getByText("Drag rows here")).toBeInTheDocument();
      expect(loadLayout("t.layout")?.tables).toHaveLength(2);
    });

    it("removes a table, folding its rows into the first so none disappear", () => {
      section({ editing: true });
      fireEvent.click(screen.getByText("Add table"));
      drop("c", "table:" + loadLayout("t.layout")!.tables[1].id);
      fireEvent.click(screen.getAllByText("Remove")[1]);
      expect(rowNames().sort()).toEqual(["a", "b", "c"]);
      expect(screen.queryByText("Things 2")).not.toBeInTheDocument();
    });

    it("never offers to remove the last table", () => {
      section({ editing: true });
      expect(screen.queryByText("Remove")).not.toBeInTheDocument();
    });

    it("Clear discards the saved layout and returns to one table in config order", () => {
      section({ editing: true });
      fireEvent.click(screen.getByText("Add table"));
      fireEvent.click(screen.getByText("Clear"));
      expect(screen.queryByText("Things 2")).not.toBeInTheDocument();
      expect(loadLayout("t.layout")).toBeNull();
    });

    it("restores a saved layout", async () => {
      saveLayout("t.layout", { version: 1, tables: [{ id: "x", title: "Mine", names: ["c", "a"] }, { id: "y", title: "Other", names: ["b"] }], hidden: [] });
      section();
      await screen.findByText("Mine");
      expect(rowNames()).toEqual(["c", "a", "b"]);
    });
  });

  describe("hiding rows", () => {
    it("hides a row outside edit mode and counts it", async () => {
      saveLayout("t.layout", { version: 1, tables: [{ id: "x", title: "T", names: ["a", "b", "c"] }], hidden: ["b"] });
      section();
      await screen.findByText("1 hidden");
      expect(rowNames()).toContain("b"); // the test row renderer always renders; the count is what the section owns
    });

    it("jumps into edit mode from the hidden count, and shows everything to undo from there", async () => {
      saveLayout("t.layout", { version: 1, tables: [{ id: "x", title: "T", names: ["a", "b"] }], hidden: ["b"] });
      const { onEditingChange, again } = section({ items: items("a", "b") });
      fireEvent.click(await screen.findByTitle("Rows are hidden — click to edit"));
      expect(onEditingChange).toHaveBeenCalledWith(true);
      again({ editing: true });
      fireEvent.click(screen.getByTitle("Show all hidden rows"));
      expect(screen.queryByText(/hidden$/)).not.toBeInTheDocument();
    });

    it("toggles a row's hidden state through the row callback", () => {
      section({ editing: true });
      fireEvent.click(screen.getByText("toggle b"));
      expect(screen.getByText("1 hidden")).toBeInTheDocument();
      expect(loadLayout("t.layout")?.hidden).toEqual(["b"]);
    });

    it("drops a hidden count for rows that left the config", async () => {
      saveLayout("t.layout", { version: 1, tables: [{ id: "x", title: "T", names: ["a", "b"] }], hidden: ["b"] });
      const { again } = section({ items: items("a", "b") });
      await screen.findByText("1 hidden");
      again({ items: items("a") });
      expect(screen.queryByText("1 hidden")).not.toBeInTheDocument();
    });
  });

  describe("drag and drop", () => {
    it("reorders within a table", () => {
      section({ editing: true });
      drop("a", "c");
      expect(rowNames()).toEqual(["b", "c", "a"]);
      expect(loadLayout("t.layout")?.tables[0].names).toEqual(["b", "c", "a"]);
    });

    it("moves a row to the end of its own table when dropped on the table itself", () => {
      section({ editing: true });
      fireEvent.click(screen.getByText("Add table")); // persists the layout so ids are readable
      const firstId = loadLayout("t.layout")!.tables[0].id;
      drop("a", `table:${firstId}`);
      expect(loadLayout("t.layout")!.tables[0].names).toEqual(["b", "c", "a"]);
    });

    it("moves a row between tables, at the position it was dropped", () => {
      section({ editing: true });
      fireEvent.click(screen.getByText("Add table"));
      const [first, second] = loadLayout("t.layout")!.tables;
      drop("c", `table:${second.id}`);
      drop("a", "c");
      const saved = loadLayout("t.layout")!.tables;
      expect(saved.find((t) => t.id === first.id)!.names).toEqual(["b"]);
      expect(saved.find((t) => t.id === second.id)!.names).toEqual(["a", "c"]);
    });

    it("keeps every row in exactly one table after any drop", () => {
      section({ editing: true });
      fireEvent.click(screen.getByText("Add table"));
      const [, second] = loadLayout("t.layout")!.tables;
      drop("a", `table:${second.id}`);
      drop("b", "a");
      drop("c", `table:${second.id}`);
      const all = loadLayout("t.layout")!.tables.flatMap((t) => t.names);
      expect(all.sort()).toEqual(["a", "b", "c"]);
    });

    it("leaves the layout alone for a drop outside every table, on itself, or on something unknown", () => {
      section({ editing: true });
      drop("a", null);
      drop("a", "a");
      drop("a", "nope");
      drop("nope", "b");
      expect(rowNames()).toEqual(["a", "b", "c"]);
      expect(loadLayout("t.layout")).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------

describe("EngineTable", () => {
  const sensors: SensorEntry[] = [
    { name: "PT1", type: "PT", unit: "psi", binding: { source: "GCS", hat_id: 0, channel_id: 0 } },
    { name: "PT2", type: "PT", unit: "psi", binding: { source: "GCS", hat_id: 0, channel_id: 1 } },
  ];
  const actuators: ActuatorEntry[] = [{ name: "SVFTV", type: "solenoid", binding: { target: "GCS", relay_channel: 0 } }];

  it("lists every sensor and actuator from the config", () => {
    renderWithProviders(<EngineTable sensors={sensors} actuators={actuators} />);
    for (const name of ["PT1", "PT2", "SVFTV"]) expect(screen.getByText(name)).toBeInTheDocument();
    expect(screen.getByText("Sensors")).toBeInTheDocument();
    expect(screen.getByText("Actuators")).toBeInTheDocument();
  });

  it("shows a section-specific message when a section is empty", () => {
    renderWithProviders(<EngineTable sensors={[]} actuators={[]} />);
    expect(screen.getByText("No sensors in config.")).toBeInTheDocument();
    expect(screen.getByText("No actuators in config.")).toBeInTheDocument();
  });

  it("customises sensors and actuators independently", () => {
    renderWithProviders(<EngineTable sensors={sensors} actuators={actuators} />);
    const [sensorEdit] = screen.getAllByText("Edit");
    fireEvent.click(sensorEdit);
    expect(screen.getAllByText("Done")).toHaveLength(1);
    expect(screen.getAllByText("Edit")).toHaveLength(1);
  });

  it("leaves edit mode on a fresh render, so a control surface never comes back frozen", () => {
    const view = renderWithProviders(<EngineTable sensors={sensors} actuators={actuators} />);
    fireEvent.click(screen.getAllByText("Edit")[0]);
    view.unmount();
    renderWithProviders(<EngineTable sensors={sensors} actuators={actuators} />);
    expect(screen.queryByText("Done")).not.toBeInTheDocument();
  });

  it("keeps showing the last value after a disconnect rather than blanking it", () => {
    act(() => useNovaStore.getState().ingestEngineData([{ name: "PT1", value: 7.5, avg: 7.5, unit: "psi", timestamp: 1 }]));
    renderWithProviders(<EngineTable sensors={sensors} actuators={[]} />);
    expect(screen.getAllByText("7.5").length).toBeGreaterThan(0);
    act(() => useNovaStore.getState().markDisconnected());
    expect(screen.getAllByText("7.5").length).toBeGreaterThan(0);
  });
});

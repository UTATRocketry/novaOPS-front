import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getDataFiles } from "@/lib/api";
import type { LoadedFile } from "@/hooks/useAnalysisSession";
import { useNovaStore } from "@/lib/store";
import { renderWithProviders } from "@/test/render";
import { SourceCard } from "./SourceCard";
import type { SourceCardProps } from "./SourceCard";

vi.mock("@/lib/api", () => ({ getDataFiles: vi.fn() }));

const initial = useNovaStore.getInitialState();

const file = (over: Partial<LoadedFile> = {}): LoadedFile => ({
  id: "f0",
  name: "novaGround_run1_sensors.csv",
  origin: "local",
  slot: "sensors",
  source: "GCS",
  sourceInferred: false,
  rowCount: 12_345,
  columnCount: 8,
  ...over,
});

function card(over: Partial<SourceCardProps> = {}) {
  const props: SourceCardProps = {
    files: [],
    loading: false,
    error: null,
    onLoadBackendFile: vi.fn(),
    onLoadLocalFile: vi.fn(),
    onSetFileSource: vi.fn(),
    onRemoveFile: vi.fn(),
    onClear: vi.fn(),
    ...over,
  };
  const view = renderWithProviders(<SourceCard {...props} />);
  return { ...view, props };
}

const select = () => screen.getByRole("combobox") as HTMLSelectElement;
const csv = (name: string) => new File(["a,b\n1,2"], name, { type: "text/csv" });

beforeEach(() => {
  useNovaStore.setState(initial, true);
  vi.mocked(getDataFiles).mockReset().mockResolvedValue([]);
});

describe("SourceCard: backend files", () => {
  it("says there are none when the list is empty", async () => {
    card();
    expect(await screen.findByText("No data files")).toBeInTheDocument();
    expect(screen.getByText("Load")).toHaveAttribute("aria-disabled", "true");
  });

  it("says the backend is unreachable when the list cannot be read", async () => {
    vi.mocked(getDataFiles).mockRejectedValue(new Error("down"));
    card();
    expect(await screen.findByText("Backend unreachable")).toBeInTheDocument();
  });

  it("lists the files and selects the newest by default", async () => {
    vi.mocked(getDataFiles).mockResolvedValue(["novaGround_old.csv", "novaGround_new.csv"]);
    card();
    await waitFor(() => expect(select().value).toBe("novaGround_new.csv"));
    expect(Array.from(select().options).map((o) => o.value)).toEqual(["novaGround_old.csv", "novaGround_new.csv"]);
  });

  it("loads the selected file", async () => {
    vi.mocked(getDataFiles).mockResolvedValue(["novaGround_a.csv", "novaThermo_b.csv"]);
    const { props } = card();
    await waitFor(() => expect(select().value).toBe("novaThermo_b.csv"));
    fireEvent.change(select(), { target: { value: "novaGround_a.csv" } });
    fireEvent.click(screen.getByText("Load"));
    expect(props.onLoadBackendFile).toHaveBeenCalledWith("novaGround_a.csv");
  });

  it("previews the subsystem the file name implies, before loading", async () => {
    vi.mocked(getDataFiles).mockResolvedValue(["novaThermo_run.csv"]);
    card();
    expect(await screen.findByText("novaThermo (TCS)")).toBeInTheDocument();
  });

  it("warns when the name does not say which subsystem it is", async () => {
    vi.mocked(getDataFiles).mockResolvedValue(["run.csv"]);
    card();
    expect(await screen.findByText("Subsystem not in the filename — set it after loading.")).toBeInTheDocument();
  });

  it("will not load while a load is already running", async () => {
    vi.mocked(getDataFiles).mockResolvedValue(["a.csv"]);
    const { props } = card({ loading: true });
    await waitFor(() => expect(select().value).toBe("a.csv"));
    expect(screen.getByText("Loading…")).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(screen.getByText("Loading…"));
    expect(props.onLoadBackendFile).not.toHaveBeenCalled();
  });

  it("refreshes the list when the picker is focused, so new recordings appear", async () => {
    card();
    await screen.findByText("No data files");
    const calls = vi.mocked(getDataFiles).mock.calls.length;
    fireEvent.focus(select());
    await waitFor(() => expect(vi.mocked(getDataFiles).mock.calls.length).toBeGreaterThan(calls));
  });

  it("passes the client id when listing", async () => {
    act(() => useNovaStore.getState().ingestSession({ type: "session", role: "operator", client_id: "c1" }));
    card();
    await waitFor(() => expect(getDataFiles).toHaveBeenCalledWith("c1"));
  });
});

describe("SourceCard: local files", () => {
  const input = () => document.querySelector('input[type="file"]') as HTMLInputElement;

  it("says nothing is uploaded", () => {
    card();
    expect(screen.getByText("Parsed in your browser — nothing is uploaded.")).toBeInTheDocument();
  });

  it("accepts several CSVs from the file picker", () => {
    const { props } = card();
    expect(input()).toHaveAttribute("accept", ".csv,text/csv");
    expect(input()).toHaveAttribute("multiple");
    const a = csv("a.csv");
    const b = csv("b.csv");
    fireEvent.change(input(), { target: { files: [a, b] } });
    expect(props.onLoadLocalFile).toHaveBeenCalledTimes(2);
    expect(props.onLoadLocalFile).toHaveBeenNthCalledWith(1, a);
    expect(props.onLoadLocalFile).toHaveBeenNthCalledWith(2, b);
  });

  it("loads dropped files, and does not navigate away", () => {
    const { props } = card();
    const zone = screen.getByText("Drop CSVs here, or click to browse").closest('[role="button"]')!;
    const dropped = csv("dropped.csv");
    const event = new Event("drop", { bubbles: true, cancelable: true }) as Event & { dataTransfer: unknown };
    event.dataTransfer = { files: [dropped] };
    zone.dispatchEvent(event);
    expect(props.onLoadLocalFile).toHaveBeenCalledWith(dropped);
    expect(event.defaultPrevented).toBe(true);
  });

  it("opens the file picker from the keyboard", () => {
    card();
    const clickSpy = vi.spyOn(input(), "click").mockImplementation(() => {});
    const zone = screen.getByText("Drop CSVs here, or click to browse").closest('[role="button"]')!;
    fireEvent.keyDown(zone, { key: "Enter" });
    fireEvent.keyDown(zone, { key: " " });
    fireEvent.keyDown(zone, { key: "a" });
    expect(clickSpy).toHaveBeenCalledTimes(2);
  });
});

describe("SourceCard: loaded files", () => {
  it("shows nothing about files when none are loaded", () => {
    card();
    expect(screen.queryByText("Clear all")).not.toBeInTheDocument();
  });

  it("shows each file's name, size, origin and slot", () => {
    card({ files: [file(), file({ id: "f1", name: "novaGround_run1_actuators.csv", slot: "actuators", origin: "backend", rowCount: 40, columnCount: 6 })] });
    expect(screen.getByText("novaGround_run1_sensors.csv")).toBeInTheDocument();
    expect(screen.getByText("12,345 × 8")).toBeInTheDocument();
    expect(screen.getByText("· local")).toBeInTheDocument();
    expect(screen.getByText("· backend")).toBeInTheDocument();
    expect(screen.getByText("sensors")).toBeInTheDocument();
    expect(screen.getByText("toggle_on")).toBeInTheDocument();
  });

  it("keeps the full name on hover", () => {
    card({ files: [file({ name: "a-very-long-file-name.csv" })] });
    expect(screen.getByTitle("a-very-long-file-name.csv")).toBeInTheDocument();
  });

  it("marks a guessed subsystem so it is not mistaken for a known one", () => {
    const view = card({ files: [file({ sourceInferred: true })] });
    expect(screen.getByText("guessed")).toBeInTheDocument();
    view.unmount();
    card({ files: [file({ sourceInferred: false })] });
    expect(screen.queryByText("guessed")).not.toBeInTheDocument();
  });

  it("lets the subsystem be corrected, highlighting the current one", () => {
    const { props } = card({ files: [file({ source: "GCS" })] });
    const row = screen.getByText("novaGround_run1_sensors.csv").closest("div[class]")!.parentElement!.parentElement!;
    fireEvent.click(within(row).getByText("TCS"));
    expect(props.onSetFileSource).toHaveBeenCalledWith("f0", "TCS");
    expect(within(row).getByText("GCS")).toBeInTheDocument();
    expect(within(row).getByText("FAS")).toBeInTheDocument();
  });

  it("offers an actuator log only GCS and FAS, since novaThermo has no actuators", () => {
    card({ files: [file({ slot: "actuators" })] });
    const row = screen.getByText("novaGround_run1_sensors.csv").closest("div[class]")!.parentElement!.parentElement!;
    expect(within(row).queryByText("TCS")).not.toBeInTheDocument();
    expect(within(row).getByText("GCS")).toBeInTheDocument();
    expect(within(row).getByText("FAS")).toBeInTheDocument();
  });

  it("removes one file or clears them all", () => {
    const { props } = card({ files: [file(), file({ id: "f1", name: "b.csv" })] });
    fireEvent.click(screen.getByLabelText("Remove b.csv"));
    expect(props.onRemoveFile).toHaveBeenCalledWith("f1");
    fireEvent.click(screen.getByText("Clear all"));
    expect(props.onClear).toHaveBeenCalled();
  });

  it("shows a load error", () => {
    card({ error: "CSV has no data rows." });
    expect(screen.getByText("CSV has no data rows.")).toBeInTheDocument();
  });
});

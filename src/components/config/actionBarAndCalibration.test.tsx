import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "@/lib/api";
import { useNovaStore } from "@/lib/store";
import type { SensorEntry } from "@/lib/types";
import { queryKeys } from "@/hooks/queryKeys";
import { renderWithProviders } from "@/test/render";
import { CalibrationModal } from "./CalibrationModal";
import { ConfigActionBar } from "./ConfigActionBar";
import type { ConfigActionBarProps } from "./ConfigActionBar";

vi.mock("@/lib/api");
const mocked = vi.mocked(api);
const initial = useNovaStore.getInitialState();
const flush = () => act(async () => {});

// ---------------------------------------------------------------------------

describe("ConfigActionBar", () => {
  function bar(over: Partial<ConfigActionBarProps> = {}) {
    const props: ConfigActionBarProps = {
      onUpdate: vi.fn(),
      isDirty: false,
      isSaving: false,
      saveError: null,
      saveOk: false,
      validationErrorCount: 0,
      creatingName: null,
      onNew: vi.fn(),
      onCreateNameChange: vi.fn(),
      onCancelNew: vi.fn(),
      ...over,
    };
    const view = renderWithProviders(<ConfigActionBar {...props} />);
    return { ...view, props };
  }
  const select = () => screen.getByRole("combobox") as HTMLSelectElement;
  const action = (label: string) => screen.getByText(label);
  const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;

  beforeEach(() => {
    vi.resetAllMocks();
    mocked.listConfigFiles.mockResolvedValue(["flight.yaml", "bench.yaml"]);
    mocked.loadConfigFile.mockResolvedValue({});
    mocked.uploadConfig.mockResolvedValue({});
    mocked.downloadConfigFile.mockResolvedValue(new Blob(["Sensors: []"]));
  });

  afterEach(() => {
    Reflect.deleteProperty(URL, "createObjectURL");
    Reflect.deleteProperty(URL, "revokeObjectURL");
  });

  async function chooseFile(name = "flight.yaml") {
    await screen.findByRole("option", { name });
    fireEvent.change(select(), { target: { value: name } });
  }

  describe("file list", () => {
    it("lists the config files on the backend", async () => {
      bar();
      expect(await screen.findByRole("option", { name: "flight.yaml" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "bench.yaml" })).toBeInTheDocument();
    });

    it("refreshes when the picker is focused", async () => {
      bar();
      await screen.findByRole("option", { name: "flight.yaml" });
      const calls = mocked.listConfigFiles.mock.calls.length;
      fireEvent.focus(select());
      await waitFor(() => expect(mocked.listConfigFiles.mock.calls.length).toBeGreaterThan(calls));
    });

    it("needs a file chosen before Load or Download do anything", async () => {
      bar();
      await flush();
      expect(action("Load")).toHaveAttribute("aria-disabled", "true");
      fireEvent.click(action("Load"));
      fireEvent.click(action("Download"));
      expect(mocked.loadConfigFile).not.toHaveBeenCalled();
      expect(mocked.downloadConfigFile).not.toHaveBeenCalled();
    });
  });

  describe("load", () => {
    it("loads the chosen file and says so", async () => {
      bar();
      await chooseFile();
      fireEvent.click(action("Load"));
      expect(await screen.findByText("Config loaded.")).toBeInTheDocument();
      expect(mocked.loadConfigFile).toHaveBeenCalledWith("flight.yaml");
    });

    it("shows the backend's reason when the load fails", async () => {
      mocked.loadConfigFile.mockRejectedValue(new Error("Invalid config: duplicate sensor name"));
      bar();
      await chooseFile();
      fireEvent.click(action("Load"));
      expect(await screen.findByText("Invalid config: duplicate sensor name")).toBeInTheDocument();
    });

    it("writes the loaded config into the cache without refetching", async () => {
      const loaded = { Sensors: [] };
      mocked.loadConfigFile.mockResolvedValue(loaded);
      const { client } = bar();
      await chooseFile();
      fireEvent.click(action("Load"));
      await screen.findByText("Config loaded.");
      expect(client.getQueryData(queryKeys.config)).toEqual(loaded);
    });
  });

  describe("download", () => {
    it("saves the file under its own name", async () => {
      const revoke = vi.fn();
      Object.assign(URL, { createObjectURL: () => "blob:cfg", revokeObjectURL: revoke });
      let saved = "";
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
        saved = this.download;
      });
      bar();
      await chooseFile("bench.yaml");
      fireEvent.click(action("Download"));
      await flush();
      expect(mocked.downloadConfigFile).toHaveBeenCalledWith("bench.yaml");
      expect(saved).toBe("bench.yaml");
      expect(revoke).toHaveBeenCalledWith("blob:cfg");
    });

    it("shows the reason when the download fails", async () => {
      mocked.downloadConfigFile.mockRejectedValue(new Error("NovaOps API error 404"));
      bar();
      await chooseFile();
      fireEvent.click(action("Download"));
      expect(await screen.findByText("NovaOps API error 404")).toBeInTheDocument();
    });
  });

  describe("upload", () => {
    it("uploads a chosen YAML file and says so", async () => {
      bar();
      const file = new File(["x: 1"], "new.yaml");
      fireEvent.change(fileInput(), { target: { files: [file] } });
      expect(await screen.findByText("Config uploaded.")).toBeInTheDocument();
      expect(mocked.uploadConfig).toHaveBeenCalledWith(file);
    });

    it("only offers YAML files", () => {
      bar();
      expect(fileInput()).toHaveAttribute("accept", ".yaml,.yml");
    });

    it("does nothing if the picker was cancelled", () => {
      bar();
      fireEvent.change(fileInput(), { target: { files: [] } });
      expect(mocked.uploadConfig).not.toHaveBeenCalled();
    });

    it("shows the reason when the upload is rejected", async () => {
      mocked.uploadConfig.mockRejectedValue(new Error("YAML parse error"));
      bar();
      fireEvent.change(fileInput(), { target: { files: [new File(["x"], "bad.yaml")] } });
      expect(await screen.findByText("YAML parse error")).toBeInTheDocument();
    });

    it("clears the picker afterwards so the same file can be chosen again", async () => {
      bar();
      const clear = vi.spyOn(fileInput(), "value", "set");
      fireEvent.change(fileInput(), { target: { files: [new File(["x"], "a.yaml")] } });
      await screen.findByText("Config uploaded.");
      expect(clear).toHaveBeenCalledWith("");
    });
  });

  describe("saving", () => {
    it("can only Update when there are changes, no validation errors, and no save running", () => {
      const { unmount } = bar({ isDirty: false });
      expect(action("Update")).toHaveAttribute("aria-disabled", "true");
      unmount();
      const second = bar({ isDirty: true, validationErrorCount: 2 });
      expect(action("Update")).toHaveAttribute("aria-disabled", "true");
      second.unmount();
      const third = bar({ isDirty: true, isSaving: true });
      expect(action("Update")).toHaveAttribute("aria-disabled", "true");
      third.unmount();
      bar({ isDirty: true });
      expect(action("Update")).toHaveAttribute("aria-disabled", "false");
    });

    it("calls back to save, but not when it is not allowed", () => {
      const first = bar({ isDirty: true });
      fireEvent.click(action("Update"));
      expect(first.props.onUpdate).toHaveBeenCalledTimes(1);
      first.unmount();
      const second = bar({ isDirty: false });
      fireEvent.click(action("Update"));
      expect(second.props.onUpdate).not.toHaveBeenCalled();
    });

    it("flags unsaved changes", () => {
      bar({ isDirty: true });
      expect(screen.getByText("unsaved changes")).toBeInTheDocument();
    });

    it("counts validation errors, in the singular and plural", () => {
      const view = bar({ validationErrorCount: 1 });
      expect(screen.getByText("1 validation error")).toBeInTheDocument();
      view.unmount();
      bar({ validationErrorCount: 3 });
      expect(screen.getByText("3 validation errors")).toBeInTheDocument();
    });

    it("shows a save error, and a success message only while there are no further edits", () => {
      const view = bar({ saveError: "Backend rejected the config" });
      expect(screen.getByText("Backend rejected the config")).toBeInTheDocument();
      view.unmount();
      const ok = bar({ saveOk: true, isDirty: false });
      expect(screen.getByText("Saved & re-fetched.")).toBeInTheDocument();
      ok.unmount();
      bar({ saveOk: true, isDirty: true });
      expect(screen.queryByText("Saved & re-fetched.")).not.toBeInTheDocument();
    });
  });

  describe("creating a new config", () => {
    it("shows the name box with Cancel and Create in place of Update", () => {
      bar({ creatingName: "draft.yaml" });
      expect(screen.getByDisplayValue("draft.yaml")).toBeInTheDocument();
      expect(action("Create")).toBeInTheDocument();
      expect(screen.queryByText("Update")).not.toBeInTheDocument();
    });

    it("reports name edits and cancels", () => {
      const { props } = bar({ creatingName: "" });
      fireEvent.change(screen.getByPlaceholderText("filename.yaml"), { target: { value: "x.yaml" } });
      expect(props.onCreateNameChange).toHaveBeenCalledWith("x.yaml");
      fireEvent.click(action("Cancel"));
      expect(props.onCancelNew).toHaveBeenCalled();
    });

    it("disables Load, Download and New while creating, and only enables Create when allowed", async () => {
      bar({ creatingName: "x.yaml", isDirty: true });
      await flush();
      for (const label of ["Load", "Download", "New"]) expect(action(label)).toHaveAttribute("aria-disabled", "true");
      expect(action("Create")).toHaveAttribute("aria-disabled", "false");
    });

    it("starts a new config from New", () => {
      const { props } = bar();
      fireEvent.click(action("New"));
      expect(props.onNew).toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------

describe("CalibrationModal", () => {
  const sensor = (over: Partial<SensorEntry> = {}): SensorEntry => ({
    name: "PT1",
    type: "PT",
    unit: "psi",
    binding: { source: "GCS", hat_id: 0, channel_id: 0 },
    ...over,
  });

  function modal(s: SensorEntry = sensor()) {
    const onSave = vi.fn();
    const onClose = vi.fn();
    const view = renderWithProviders(<CalibrationModal sensor={s} onSave={onSave} onClose={onClose} />);
    return { ...view, onSave, onClose };
  }

  const measured = () => screen.getByPlaceholderText("capture or type") as HTMLInputElement;
  const real = () => screen.getByPlaceholderText("e.g. 0") as HTMLInputElement;
  const addPoint = () => screen.getByText("Add point");
  const reading = (value: number) =>
    act(() => useNovaStore.getState().ingestEngineData([{ name: "PT1", value, avg: value, unit: "raw", timestamp: 0 }]));
  const typePoint = (m: string, r: string) => {
    fireEvent.change(measured(), { target: { value: m } });
    fireEvent.change(real(), { target: { value: r } });
    fireEvent.click(addPoint());
  };
  const rows = () => screen.getAllByRole("row").slice(1).map((tr) => Array.from(tr.querySelectorAll("td")).map((td) => td.textContent));

  beforeEach(() => {
    useNovaStore.setState(initial, true);
    vi.useRealTimers();
  });
  afterEach(() => vi.useRealTimers());

  describe("points", () => {
    it("starts with the sensor's existing calibration", () => {
      modal(sensor({ convert: { calibration: [[0, 0], [10, 100]] } }));
      expect(rows()).toEqual([["1", "0", "0", "delete"], ["2", "10", "100", "delete"]]);
    });

    it("starts empty when there is none", () => {
      modal();
      expect(screen.getByText("No calibration points yet.")).toBeInTheDocument();
    });

    it("adds a hand-typed point and clears the boxes", () => {
      modal();
      typePoint("1.23456", "5");
      expect(rows()).toEqual([["1", "1.2346", "5", "delete"]]);
      expect(measured().value).toBe("");
      expect(real().value).toBe("");
    });

    it("needs both numbers before a point can be added", () => {
      modal();
      expect(addPoint()).toHaveAttribute("aria-disabled", "true");
      fireEvent.change(measured(), { target: { value: "1" } });
      expect(addPoint()).toHaveAttribute("aria-disabled", "true");
      fireEvent.change(real(), { target: { value: "2" } });
      expect(addPoint()).toHaveAttribute("aria-disabled", "false");
      fireEvent.change(real(), { target: { value: "" } });
      fireEvent.click(addPoint());
      expect(screen.getByText("No calibration points yet.")).toBeInTheDocument();
    });

    it("accepts zero and negative values", () => {
      modal();
      typePoint("0", "0");
      typePoint("-3", "-1.5");
      expect(rows().map((r) => [r[1], r[2]])).toEqual([["0", "0"], ["-3", "-1.5"]]);
    });

    it("removes a point and renumbers", () => {
      modal(sensor({ convert: { calibration: [[0, 0], [1, 1], [2, 2]] } }));
      fireEvent.click(screen.getAllByLabelText("Remove point")[1]);
      expect(rows().map((r) => r.slice(0, 3))).toEqual([["1", "0", "0"], ["2", "2", "2"]]);
    });

    it("warns that a single point cannot make a linear fit", () => {
      modal(sensor({ convert: { calibration: [[0, 0]] } }));
      expect(screen.getByText("A linear fit needs at least 2 points.")).toBeInTheDocument();
    });

    it("uses the sensor's unit in the label, or a default", () => {
      const view = modal();
      expect(screen.getByText("Real value (psi)")).toBeInTheDocument();
      view.unmount();
      modal(sensor({ unit: undefined }));
      expect(screen.getByText("Real value (unit)")).toBeInTheDocument();
    });
  });

  describe("capture", () => {
    beforeEach(() => vi.useFakeTimers());

    it("shows the live raw reading, or a dash", () => {
      modal();
      expect(screen.getByText("—")).toBeInTheDocument();
      reading(123.5);
      expect(screen.getByText("123.5")).toBeInTheDocument();
    });

    it("averages ten seconds of readings into the measured box, showing progress", () => {
      modal();
      reading(10);
      fireEvent.click(screen.getByText("Capture 10s avg"));
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(screen.getByText("Capturing… 50%")).toBeInTheDocument();
      reading(20);
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(screen.getByText("Capture 10s avg")).toBeInTheDocument();
      expect(Number(measured().value)).toBeCloseTo(15, 3);
    });

    it("ignores a second capture click while one is running", () => {
      modal();
      reading(1);
      fireEvent.click(screen.getByText("Capture 10s avg"));
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      fireEvent.click(screen.getByText(/Capturing/));
      expect(screen.getByText(/Capturing… 10%/)).toBeInTheDocument();
    });

    it("leaves the measured box empty if there were no readings to average", () => {
      modal();
      fireEvent.click(screen.getByText("Capture 10s avg"));
      act(() => {
        vi.advanceTimersByTime(10_000);
      });
      expect(measured().value).toBe("");
    });

    it("stops sampling when the dialog is closed mid-capture", () => {
      const view = modal();
      reading(1);
      fireEvent.click(screen.getByText("Capture 10s avg"));
      view.unmount();
      expect(() => {
        vi.advanceTimersByTime(20_000);
      }).not.toThrow();
    });
  });

  describe("zero at current reading", () => {
    const cal = sensor({ convert: { calibration: [[0, 0], [10, 100]] } }); // real = 10 * measured

    it("is disabled without a live value or without two points", () => {
      const first = modal(cal);
      expect(screen.getByText("Zero here").closest("button")).toHaveAttribute("aria-disabled", "true");
      first.unmount();
      modal(sensor({ convert: { calibration: [[0, 0]] } }));
      reading(1);
      expect(screen.getByText("Zero here").closest("button")).toHaveAttribute("aria-disabled", "true");
    });

    it("is disabled for a flat calibration, which has no slope to shift along", () => {
      modal(sensor({ convert: { calibration: [[0, 5], [10, 5]] } }));
      reading(3);
      expect(screen.getByText("Zero here").closest("button")).toHaveAttribute("aria-disabled", "true");
    });

    it("shifts every point so the current reading maps to zero, keeping the slope", () => {
      modal(cal);
      reading(2); // calibrates to 20 now
      fireEvent.click(screen.getByText("Zero here"));
      // shift = 20 / 10 = 2 -> measured values move up by 2
      expect(rows().map((r) => [r[1], r[2]])).toEqual([["2", "0"], ["12", "100"]]);
    });

    it("maps the live reading to exactly zero afterwards", () => {
      const { onSave } = modal(cal);
      reading(2.5);
      fireEvent.click(screen.getByText("Zero here"));
      fireEvent.click(screen.getByText("Apply to draft"));
      const [[m0, r0], [m1, r1]] = onSave.mock.calls[0][0] as Array<[number, number]>;
      const slope = (r1 - r0) / (m1 - m0);
      expect(slope).toBeCloseTo(10);
      expect(r0 + slope * (2.5 - m0)).toBeCloseTo(0, 5);
    });

    it("works for a negative slope", () => {
      modal(sensor({ convert: { calibration: [[0, 100], [10, 0]] } })); // real = 100 - 10 * measured
      reading(4); // calibrates to 60
      fireEvent.click(screen.getByText("Zero here"));
      expect(rows().map((r) => r[2])).toEqual(["100", "0"]);
      expect(Number(rows()[0][1])).toBeCloseTo(-6);
    });
  });

  describe("applying", () => {
    it("hands the points to the draft and closes, without saving to the backend", () => {
      const { onSave, onClose } = modal();
      typePoint("1", "2");
      typePoint("3", "4");
      fireEvent.click(screen.getByText("Apply to draft"));
      expect(onSave).toHaveBeenCalledWith([[1, 2], [3, 4]]);
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/press Update in the action bar to persist/)).toBeInTheDocument();
    });

    it("can apply an empty list, which clears the calibration", () => {
      const { onSave } = modal(sensor({ convert: { calibration: [[0, 0], [1, 1]] } }));
      fireEvent.click(screen.getAllByLabelText("Remove point")[0]);
      fireEvent.click(screen.getAllByLabelText("Remove point")[0]);
      fireEvent.click(screen.getByText("Apply to draft"));
      expect(onSave).toHaveBeenCalledWith([]);
    });

    it("cancels without saving", () => {
      const { onSave, onClose } = modal();
      typePoint("1", "2");
      fireEvent.click(screen.getByText("Cancel"));
      expect(onSave).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });

    it("closes from a click on the overlay but not on the dialog", () => {
      const { onClose, container } = modal();
      fireEvent.click(screen.getByText("Calibrate · PT1"));
      expect(onClose).not.toHaveBeenCalled();
      fireEvent.click(container.querySelector("div")!);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});

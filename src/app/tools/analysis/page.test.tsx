import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "@/lib/api";
import type { SystemConfig } from "@/lib/types";
import { FakeUPlot } from "@/test/uplotMock";
import { renderWithProviders } from "@/test/render";
import AnalysisPage from "./page";

vi.mock("@/lib/api");
vi.mock("next/navigation", () => ({ usePathname: () => "/tools/analysis" }));

const mocked = vi.mocked(api);
const T0 = 1_700_000_000;

const CONFIG: SystemConfig = {
  Sensors: [
    { name: "PT1", type: "PT", unit: "psi", binding: { source: "GCS", hat_id: 0, channel_id: 0 }, convert: { calibration: [[0, 0], [10, 100]] } },
    { name: "LC1", type: "LC", unit: "kg", binding: { source: "GCS", hat_id: 0, channel_id: 1 } },
    { name: "GHOST", type: "PT", unit: "psi", binding: { source: "GCS", hat_id: 9, channel_id: 9 } },
  ],
  Actuators: [{ name: "Fill", type: "solenoid", binding: { target: "GCS", relay_channel: 0 }, actions: { solenoid_type: "nominally_closed" } }],
};

const gcsCsv = `timestamp,hat0_ch0,hat0_ch1,extra\n${T0},1,5,0\n${T0 + 1},2,6,0\n${T0 + 2},3,7,0\n${T0 + 3},4,8,0`;
const actuatorCsv = `timestamp,relay_0,type_id\n${T0 * 1000},0,start\n${(T0 + 1) * 1000},1,relay`;

const flush = () => act(async () => {});
const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;
const load = async (name: string, text: string) => {
  fireEvent.change(fileInput(), { target: { files: [new File([text], name, { type: "text/csv" })] } });
  await flush();
};

beforeEach(() => {
  vi.resetAllMocks();
  mocked.getConfig.mockResolvedValue(CONFIG);
  mocked.getDataFiles.mockResolvedValue([]);
});

async function page(config: SystemConfig = CONFIG) {
  mocked.getConfig.mockResolvedValue(config);
  const view = renderWithProviders(<AnalysisPage />);
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  return view;
}

describe("Analysis page", () => {
  describe("before a capture is loaded", () => {
    it("explains what to do, with nothing to export and no charts", async () => {
      await page();
      expect(screen.getByText("No capture loaded")).toBeInTheDocument();
      expect(screen.getByText("Post-test review of a recorded capture")).toBeInTheDocument();
      expect(screen.getByText("Export calibrated CSV").closest("button")).toHaveAttribute("aria-disabled", "true");
      expect(FakeUPlot.instances).toHaveLength(0);
      expect(screen.queryByText("Processing")).not.toBeInTheDocument();
    });

    it("links back to the tools index", async () => {
      await page();
      expect(screen.getByRole("link", { name: "← Back to Tools" })).toHaveAttribute("href", "/tools");
    });

    it("warns when the config has no sensors", async () => {
      await page({});
      expect(screen.getByText(/No sensors in the loaded config/)).toBeInTheDocument();
    });
  });

  describe("with a capture", () => {
    it("resolves the file against the config and shows the summary, processing, channels and stats", async () => {
      await page();
      await load("novaGround_run1.csv", gcsCsv);
      expect(screen.getByText("1 log · calibrated offline review")).toBeInTheDocument();
      expect(screen.getByText("Samples")).toBeInTheDocument();
      expect(screen.getByText("Processing")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Channels" })).toBeInTheDocument();
      expect(screen.getByText("Statistics")).toBeInTheDocument();
      expect(screen.getByText("UNRESOLVED SENSORS (1)")).toBeInTheDocument();
      expect(screen.getByText("UNBOUND COLUMNS (1)")).toBeInTheDocument();
    });

    it("selects every channel by default and draws a chart per unit", async () => {
      await page();
      await load("novaGround_run1.csv", gcsCsv);
      const switches = screen.getAllByRole("switch").filter((s) => s.getAttribute("title")?.includes("calibration") || s.getAttribute("title")?.includes("processing"));
      expect(switches.every((s) => s.getAttribute("aria-checked") === "true")).toBe(true);
      expect(FakeUPlot.instances.length).toBe(2); // psi and kg
    });

    it("calibrates with the config's table", async () => {
      await page();
      await load("novaGround_run1.csv", gcsCsv);
      // raw 1..4 through [[0,0],[10,100]] is 10..40
      const stats = screen.getByText("Statistics").closest("div")!.parentElement!;
      expect(within(stats).getByText("10.00")).toBeInTheDocument();
      expect(within(stats).getByText("40.00")).toBeInTheDocument();
    });

    it("removes a channel from the charts and statistics when it is switched off", async () => {
      await page();
      await load("novaGround_run1.csv", gcsCsv);
      const lc = screen.getAllByRole("switch").find((s) => within(s).queryByText("LC1"))!;
      fireEvent.click(lc);
      expect(FakeUPlot.instances.filter((u) => !u.destroyed)).toHaveLength(1);
      const stats = screen.getByText("Statistics").closest("div")!.parentElement!;
      expect(within(stats).queryByText("LC1")).not.toBeInTheDocument();
    });

    it("shows 'No channels selected' when none are", async () => {
      await page();
      await load("novaGround_run1.csv", gcsCsv);
      fireEvent.click(screen.getByText("None"));
      expect(screen.getByText("No channels selected.")).toBeInTheDocument();
      expect(screen.getByText("Export calibrated CSV").closest("button")).toHaveAttribute("aria-disabled", "true");
    });

    it("offers the window bar, and a drag-selection on a chart sets the shared window", async () => {
      await page();
      await load("novaGround_run1.csv", gcsCsv);
      expect(screen.getByText("Full capture").closest("button")).toHaveAttribute("aria-disabled", "true");
      const chart = FakeUPlot.instances.find((u) => !u.destroyed)!;
      chart.select = { left: 1, top: 0, width: 3, height: 1 }; // wider than the 2 px click threshold once scaled
      act(() => chart.fire("setSelect"));
      expect(screen.getByText("Full capture").closest("button")).toHaveAttribute("aria-disabled", "false");
      for (const u of FakeUPlot.instances.filter((x) => !x.destroyed)) {
        expect(u.scaleCalls.at(-1)!.range).toEqual({ min: 1, max: 4 });
      }
    });

    it("changes the chart height with the size buttons", async () => {
      await page();
      await load("novaGround_run1.csv", gcsCsv);
      fireEvent.click(screen.getByText("tall"));
      await waitFor(() => expect(FakeUPlot.last.opts.height).toBe(420));
      fireEvent.click(screen.getByText("compact"));
      await waitFor(() => expect(FakeUPlot.last.opts.height).toBe(220));
    });

    it("pluralises the log count", async () => {
      await page();
      await load("novaGround_run1.csv", gcsCsv);
      await load("novaThermo_run1.csv", gcsCsv);
      expect(screen.getByText("2 logs · calibrated offline review")).toBeInTheDocument();
    });
  });

  describe("display options", () => {
    it("splits a range outlier by default, and keeps channels together when switched off", async () => {
      const csv = `timestamp,hat0_ch0,hat0_ch1\n${T0},1,1\n${T0 + 1},2,2\n${T0 + 2},3,500`;
      await page({
        Sensors: [
          { name: "A", type: "LC", unit: "kg", binding: { source: "GCS", hat_id: 0, channel_id: 0 } },
          { name: "B", type: "LC", unit: "kg", binding: { source: "GCS", hat_id: 0, channel_id: 1 } },
        ],
      });
      await load("novaGround_x.csv", csv);
      expect(screen.getByText("split by range")).toBeInTheDocument();
      fireEvent.click(screen.getByText("Auto-split mismatched ranges"));
      expect(screen.queryByText("split by range")).not.toBeInTheDocument();
    });

    it("lists the four display and export switches", async () => {
      await page();
      await load("novaGround_run1.csv", gcsCsv);
      for (const label of ["Auto-split mismatched ranges", "Actuation markers on charts", "Label actuation markers", "Keep raw columns in export"]) {
        expect(screen.getByText(label)).toBeInTheDocument();
      }
    });
  });

  describe("actuation events", () => {
    it("shows the events card once an actuator log is loaded, and zooms on a click", async () => {
      await page();
      await load("novaGround_run1.csv", gcsCsv);
      expect(screen.queryByText("Actuation events")).not.toBeInTheDocument();
      await load("novaGround_actuators.csv", actuatorCsv);
      expect(screen.getByText("Actuation events")).toBeInTheDocument();
      fireEvent.click(screen.getByText("Fill"));
      expect(screen.getByText("Full capture").closest("button")).not.toHaveAttribute("aria-disabled", "true");
    });

    it("says the events cannot be placed when the sensor clock is an uptime counter", async () => {
      await page();
      await load("novaGround_run1.csv", `timestamp,hat0_ch0\n0,1\n1000,2`);
      await load("novaGround_actuators.csv", actuatorCsv);
      expect(screen.getByText(/Cannot place events on this timeline/)).toBeInTheDocument();
    });
  });

  describe("export", () => {
    let saved: { name: string; text: Promise<string> } | null;

    beforeEach(() => {
      saved = null;
      Object.assign(URL, {
        createObjectURL: (blob: Blob) => {
          saved = { name: "", text: blob.text() };
          return "blob:csv";
        },
        revokeObjectURL: () => {},
      });
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
        if (saved) saved.name = this.download;
      });
    });

    it("saves the calibrated CSV under the capture's name", async () => {
      await page();
      await load("novaGround_run1.csv", gcsCsv);
      fireEvent.click(screen.getByText("Export calibrated CSV"));
      expect(saved!.name).toBe("novaGround_run1_calibrated.csv");
      const text = await saved!.text;
      const [header, first] = text.split("\n");
      expect(header).toBe("timestamp,time,elapsed_s,cal_PT1[psi],cal_LC1[kg]");
      expect(first.split(",").slice(3)).toEqual(["10", "5"]);
    });

    it("carries only the selected channels", async () => {
      await page();
      await load("novaGround_run1.csv", gcsCsv);
      const lc = screen.getAllByRole("switch").find((s) => within(s).queryByText("LC1"))!;
      fireEvent.click(lc);
      fireEvent.click(screen.getByText("Export calibrated CSV"));
      expect((await saved!.text).split("\n")[0]).toBe("timestamp,time,elapsed_s,cal_PT1[psi]");
    });

    it("keeps the raw columns when asked", async () => {
      await page();
      await load("novaGround_run1.csv", gcsCsv);
      fireEvent.click(screen.getByText("Keep raw columns in export"));
      fireEvent.click(screen.getByText("Export calibrated CSV"));
      expect((await saved!.text).split("\n")[0]).toContain("GCS:hat0_ch0");
    });

    it("exports nothing without a capture", async () => {
      await page();
      fireEvent.click(screen.getByText("Export calibrated CSV"));
      expect(saved).toBeNull();
    });
  });
});

import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { sendFasSound, uploadFasSoundClip } from "@/lib/api/direct";
import type { FlightTelemetry } from "@/lib/flight/types";
import { useNovaStore } from "@/lib/store/store";
import type { ClientRole } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { RadioConfigView } from "./RadioConfigView";
import { SoundboardTool } from "./SoundboardTool";

vi.mock("@/lib/api/direct", () => ({ sendFasSound: vi.fn(), uploadFasSoundClip: vi.fn() }));

const initial = useNovaStore.getInitialState();

function connect(role: ClientRole | null) {
  useNovaStore.setState({ session: { clientId: role ? "c1" : null, role } });
}

function telemetry(t: Partial<FlightTelemetry>) {
  act(() => useNovaStore.getState().ingestFlightData(t as FlightTelemetry));
}

const flush = () => act(async () => {});
const button = (name: string | RegExp) => screen.getByRole("button", { name });

beforeEach(() => {
  useNovaStore.setState(initial, true);
  vi.mocked(sendFasSound).mockReset().mockResolvedValue({ published_commands: [] });
  vi.mocked(uploadFasSoundClip).mockReset();
});

// ---------------------------------------------------------------------------

describe("SoundboardTool", () => {
  const clips = [
    { idx: 0, name: "boot", format: 1, sampleRate: 8000, length: 4096 },
    { idx: 1, name: "", format: 9 },
  ];

  describe("display", () => {
    it("shows dashes and says no directory has been received before any telemetry", () => {
      renderWithProviders(<SoundboardTool />);
      expect(screen.getByText("No clip directory received")).toBeInTheDocument();
      expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    });

    it("lists clips with their format, rate and size, naming unknown formats by number", () => {
      telemetry({ sound: { clips } });
      renderWithProviders(<SoundboardTool />);
      expect(screen.getByText("2 stored")).toBeInTheDocument();
      expect(screen.getByText("boot")).toBeInTheDocument();
      expect(screen.getByText("IMA-ADPCM")).toBeInTheDocument();
      expect(screen.getByText("8000 Hz")).toBeInTheDocument();
      expect(screen.getByText("4096 B")).toBeInTheDocument();
      expect(screen.getByText("9")).toBeInTheDocument(); // unknown format
    });

    it("shows the status chips and playing state", () => {
      telemetry({ sound: { status: { clipCount: 3, playingIdx: 2, busy: true, tone: true, ulReady: true, ulActive: true } } });
      renderWithProviders(<SoundboardTool />);
      for (const chip of ["tone", "busy", "upload active", "upload ready"]) expect(screen.getByText(chip)).toBeInTheDocument();
      expect(screen.getByText("#2")).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument();
    });

    it("distinguishes idle (null) from unknown (absent) for the playing clip", () => {
      telemetry({ sound: { status: { playingIdx: null } } });
      renderWithProviders(<SoundboardTool />);
      expect(screen.getByText("idle")).toBeInTheDocument();
    });

    it("shows storage used against capacity, and erase progress only while it is under 100%", () => {
      telemetry({ sound: { status: { usedKb: 100, capKb: 400, pct: 40 } } });
      renderWithProviders(<SoundboardTool />);
      expect(screen.getByText("100 kB / 400 kB")).toBeInTheDocument();
      expect(screen.getByText("40%")).toBeInTheDocument();
    });

    it("hides the progress row when idle at 100%", () => {
      telemetry({ sound: { status: { pct: 100 } } });
      renderWithProviders(<SoundboardTool />);
      expect(screen.queryByText("progress")).not.toBeInTheDocument();
    });
  });

  describe("who may command", () => {
    it.each([
      ["viewer", false],
      [null, false],
      ["operator", true],
      ["pad", true],
      ["admin", true],
    ] as const)("role %s: controls enabled=%s", (role, enabled) => {
      connect(role);
      renderWithProviders(<SoundboardTool />);
      for (const name of ["Stop", "Refresh list", "Set volume", "Test tone"]) {
        if (enabled) expect(button(name)).toBeEnabled();
        else expect(button(name)).toBeDisabled();
      }
    });

    it("explains a missing role, and a missing connection", () => {
      connect("viewer");
      renderWithProviders(<SoundboardTool />);
      expect(screen.getByText("Operator role required to send commands")).toBeInTheDocument();
    });

    it("says it is not connected with no session", () => {
      renderWithProviders(<SoundboardTool />);
      expect(screen.getByText("Not connected")).toBeInTheDocument();
    });
  });

  describe("commands", () => {
    beforeEach(() => connect("operator"));

    it("plays the chosen clip on the chosen node", async () => {
      telemetry({ sound: { clips } });
      renderWithProviders(<SoundboardTool />);
      fireEvent.click(screen.getAllByRole("button", { name: "Play" })[1]);
      await flush();
      expect(sendFasSound).toHaveBeenCalledWith({ node: "FMC_0", action: "play", idx: 1 }, "c1");
      expect(screen.getByText("OK — play")).toBeInTheDocument();
    });

    it("sends stop, list and volume", async () => {
      renderWithProviders(<SoundboardTool />);
      fireEvent.click(button("Stop"));
      fireEvent.click(button("Refresh list"));
      fireEvent.change(screen.getByRole("slider"), { target: { value: "200" } });
      fireEvent.click(button("Set volume"));
      await flush();
      expect(vi.mocked(sendFasSound).mock.calls.map((c) => c[0])).toEqual([
        { node: "FMC_0", action: "stop" },
        { node: "FMC_0", action: "list" },
        { node: "FMC_0", action: "volume", volume: 200 },
      ]);
    });

    it("starts the volume at 128", async () => {
      renderWithProviders(<SoundboardTool />);
      fireEvent.click(button("Set volume"));
      await flush();
      expect(sendFasSound).toHaveBeenCalledWith({ node: "FMC_0", action: "volume", volume: 128 }, "c1");
    });

    it("targets whichever node is typed", async () => {
      renderWithProviders(<SoundboardTool />);
      fireEvent.change(screen.getByDisplayValue("FMC_0"), { target: { value: "FMC_1" } });
      fireEvent.click(button("Stop"));
      await flush();
      expect(sendFasSound).toHaveBeenCalledWith({ node: "FMC_1", action: "stop" }, "c1");
    });

    it("sends the default tone when the fields are blank, omitting them rather than sending 0", async () => {
      renderWithProviders(<SoundboardTool />);
      fireEvent.click(button("Test tone"));
      await flush();
      expect(sendFasSound).toHaveBeenCalledWith({ node: "FMC_0", action: "tone" }, "c1");
    });

    it("sends a typed frequency and duration, and drops a zero or negative one", async () => {
      renderWithProviders(<SoundboardTool />);
      const freq = screen.getByPlaceholderText("2000");
      const dur = screen.getByPlaceholderText("500");
      fireEvent.change(freq, { target: { value: "1500" } });
      fireEvent.change(dur, { target: { value: "250" } });
      fireEvent.click(button("Test tone"));
      await flush();
      expect(sendFasSound).toHaveBeenLastCalledWith({ node: "FMC_0", action: "tone", freq_hz: 1500, ms: 250 }, "c1");

      fireEvent.change(freq, { target: { value: "0" } });
      fireEvent.change(dur, { target: { value: "-5" } });
      fireEvent.click(button("Test tone"));
      await flush();
      expect(sendFasSound).toHaveBeenLastCalledWith({ node: "FMC_0", action: "tone" }, "c1");
    });

    it("shows the backend's error", async () => {
      vi.mocked(sendFasSound).mockRejectedValue(new Error("FMC offline"));
      renderWithProviders(<SoundboardTool />);
      fireEvent.click(button("Stop"));
      await flush();
      expect(screen.getByText("Error: FMC offline")).toBeInTheDocument();
    });
  });

  describe("erasing every clip", () => {
    beforeEach(() => connect("operator"));

    it("needs two deliberate steps and sends nothing until the second", async () => {
      renderWithProviders(<SoundboardTool />);
      fireEvent.click(button("Clear all clips"));
      expect(screen.getByText(/erases every stored clip/)).toBeInTheDocument();
      expect(button("Yes, erase all")).toBeDisabled();
      expect(sendFasSound).not.toHaveBeenCalled();

      fireEvent.click(screen.getByText("I understand this is irreversible"));
      expect(button("Yes, erase all")).toBeEnabled();
      fireEvent.click(button("Yes, erase all"));
      await flush();
      expect(sendFasSound).toHaveBeenCalledWith({ node: "FMC_0", action: "clear" }, "c1");
    });

    it("can be cancelled, and starts again from the first step", () => {
      renderWithProviders(<SoundboardTool />);
      fireEvent.click(button("Clear all clips"));
      fireEvent.click(screen.getByText("I understand this is irreversible"));
      fireEvent.click(button("Cancel"));
      expect(screen.queryByText(/erases every stored clip/)).not.toBeInTheDocument();
      fireEvent.click(button("Clear all clips"));
      expect(button("Yes, erase all")).toBeDisabled();
    });

    it("resets the confirmation after erasing", async () => {
      renderWithProviders(<SoundboardTool />);
      fireEvent.click(button("Clear all clips"));
      fireEvent.click(screen.getByText("I understand this is irreversible"));
      fireEvent.click(button("Yes, erase all"));
      await flush();
      expect(screen.queryByText(/erases every stored clip/)).not.toBeInTheDocument();
    });

    it("cannot even be started by a viewer", () => {
      connect("viewer");
      renderWithProviders(<SoundboardTool />);
      expect(button("Clear all clips")).toBeDisabled();
      fireEvent.click(button("Clear all clips"));
      expect(screen.queryByText(/erases every stored clip/)).not.toBeInTheDocument();
      expect(sendFasSound).not.toHaveBeenCalled();
    });
  });

  describe("clip upload", () => {
    const audio = (name = "my beep.wav") => new File(["x"], name, { type: "audio/wav" });
    const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;
    const pick = (f: File) => fireEvent.change(fileInput(), { target: { files: [f] } });
    const upload = () => button("Upload");

    beforeEach(() => connect("operator"));

    it("is disabled until a file is chosen and named", () => {
      renderWithProviders(<SoundboardTool />);
      expect(upload()).toBeDisabled();
      pick(audio());
      expect(upload()).toBeEnabled();
    });

    it("seeds the name from the file name without its extension, capped at 24 characters", () => {
      renderWithProviders(<SoundboardTool />);
      pick(audio("a-very-long-clip-name-that-goes-on-and-on.wav"));
      const name = screen.getByDisplayValue(/^a-very-long-clip-name/) as HTMLInputElement;
      expect(name.value).toBe("a-very-long-clip-name-th");
      expect(name.value).toHaveLength(24);
    });

    it("does not overwrite a name already typed", () => {
      renderWithProviders(<SoundboardTool />);
      pick(audio("first.wav"));
      fireEvent.change(screen.getByDisplayValue("first"), { target: { value: "mine" } });
      pick(audio("second.wav"));
      expect(screen.getByDisplayValue("mine")).toBeInTheDocument();
    });

    it("needs a non-blank name", () => {
      renderWithProviders(<SoundboardTool />);
      pick(audio());
      fireEvent.change(screen.getByDisplayValue("my beep"), { target: { value: "   " } });
      expect(upload()).toBeDisabled();
    });

    it("is disabled for a viewer", () => {
      connect("viewer");
      renderWithProviders(<SoundboardTool />);
      pick(audio());
      expect(upload()).toBeDisabled();
    });

    it("uploads with the defaults, omitting blank processing options", async () => {
      vi.mocked(uploadFasSoundClip).mockResolvedValue({ uploaded: { name: "my beep", format: 1, bytes: 900, crc32: 1, sample_rate: 8000, seconds: 1.234 } });
      renderWithProviders(<SoundboardTool />);
      const file = audio();
      pick(file);
      fireEvent.click(upload());
      await flush();
      expect(uploadFasSoundClip).toHaveBeenCalledWith({ file, name: "my beep", format: "adpcm", node: "FMC_0" }, "c1");
      expect(screen.getByText('Uploaded "my beep" — 1.2 s, 900 B. Appears in the list shortly.')).toBeInTheDocument();
    });

    it("sends the chosen format and processing options", async () => {
      vi.mocked(uploadFasSoundClip).mockResolvedValue({ uploaded: { name: "n", format: 2, bytes: 1, crc32: 1, sample_rate: 1, seconds: 1 } });
      renderWithProviders(<SoundboardTool />);
      pick(audio());
      fireEvent.change(screen.getByDisplayValue("adpcm (compact)"), { target: { value: "pcm" } });
      fireEvent.change(screen.getByPlaceholderText("700"), { target: { value: "649.6" } });
      fireEvent.change(screen.getByPlaceholderText("0"), { target: { value: "2.5" } });
      fireEvent.click(upload());
      await flush();
      expect(uploadFasSoundClip).toHaveBeenCalledWith(
        expect.objectContaining({ format: "pcm", highpassHz: 650, pitchSemitones: 2.5 }),
        "c1",
      );
    });

    it("drops a negative processing option rather than sending it", async () => {
      vi.mocked(uploadFasSoundClip).mockResolvedValue({ uploaded: { name: "n", format: 1, bytes: 1, crc32: 1, sample_rate: 1, seconds: 1 } });
      renderWithProviders(<SoundboardTool />);
      pick(audio());
      fireEvent.change(screen.getByPlaceholderText("700"), { target: { value: "-5" } });
      fireEvent.click(upload());
      await flush();
      expect(vi.mocked(uploadFasSoundClip).mock.calls[0][0]).not.toHaveProperty("highpassHz");
    });

    it("clears the form after a successful upload", async () => {
      vi.mocked(uploadFasSoundClip).mockResolvedValue({ uploaded: { name: "n", format: 1, bytes: 1, crc32: 1, sample_rate: 1, seconds: 1 } });
      renderWithProviders(<SoundboardTool />);
      pick(audio());
      fireEvent.click(upload());
      await flush();
      expect(screen.queryByDisplayValue("my beep")).not.toBeInTheDocument();
      expect(upload()).toBeDisabled();
    });

    it("keeps the form and shows the reason when the upload fails", async () => {
      vi.mocked(uploadFasSoundClip).mockRejectedValue(new Error("ffmpeg is not installed"));
      renderWithProviders(<SoundboardTool />);
      pick(audio());
      fireEvent.click(upload());
      await waitFor(() => expect(screen.getByText("Error: ffmpeg is not installed")).toBeInTheDocument());
      expect(screen.getByDisplayValue("my beep")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------

describe("RadioConfigView", () => {
  const record = {
    callsign: "VE3UTA",
    networkId: 7,
    vehicleNodeId: 2,
    allocationLowHz: 902_000_000,
    allocationHighHz: 928_000_000,
    lora: { frequencyHz: 915_000_000, bandwidthHz: 125_000, powerDbm: 20, spreadingFactor: 9, codingRate: "4/5", preambleSymbols: 8 },
    pressureChannels: [{ boardId: 0, channel: 1 }],
    rfChain: {
      cyclePeriodMs: 1000,
      warmupMs: 50,
      tailMs: 10,
      maxOnMs: 800,
      minOffMs: 200,
      runcamAutostopS: 600,
      dutyCycle: true,
      runcamAutostop: false,
      bootSound: true,
      recOnPower: false,
      paBoardId: 0,
      paChannel: 3,
      runcamBoardId: null,
      runcamChannel: null,
    },
  };

  const show = (state: unknown) => {
    telemetry({ radioConfig: state } as never);
    return renderWithProviders(<RadioConfigView />);
  };

  it("explains that nothing has been received", () => {
    renderWithProviders(<RadioConfigView />);
    expect(screen.getByText(/No/)).toBeInTheDocument();
    expect(screen.getByText("fas_radio_cfg")).toBeInTheDocument();
  });

  it("shows nothing from a record that failed to decode, rather than half of it", () => {
    show({ decodeError: "bad crc", config: record });
    expect(screen.getByText("decode failed")).toBeInTheDocument();
    expect(screen.getByText("bad crc")).toBeInTheDocument();
    expect(screen.queryByText("VE3UTA")).not.toBeInTheDocument();
  });

  it("says a transaction is in flight when there is no record yet", () => {
    show({ statusName: "pending", persisted: false });
    expect(screen.getByText(/no config record has been read back yet/)).toBeInTheDocument();
  });

  it("shows the identity, LoRa and pressure-channel sections", () => {
    show({ config: record, generation: 4, transactionId: 12 });
    expect(screen.getByText("VE3UTA")).toBeInTheDocument();
    expect(screen.getByText("902.000 MHz")).toBeInTheDocument();
    expect(screen.getByText("125.0 kHz")).toBeInTheDocument();
    expect(screen.getByText("SF9")).toBeInTheDocument();
    expect(screen.getByText("20 dBm")).toBeInTheDocument();
    expect(screen.getByText("EPB 0 · ch 1")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("says when no pressure channels are selected", () => {
    show({ config: { ...record, pressureChannels: [] } });
    expect(screen.getByText("none selected")).toBeInTheDocument();
  });

  it("shows RF chain bindings, with unfitted peripherals named as such", () => {
    show({ config: record });
    expect(screen.getByText("EPB 0 · ch 3")).toBeInTheDocument();
    expect(screen.getByText("unfitted")).toBeInTheDocument();
  });

  it("shows duty-cycle timings and the camera and boot options", () => {
    show({ config: record });
    expect(screen.getByText("1000 ms")).toBeInTheDocument();
    expect(screen.getByText("600 s")).toBeInTheDocument();
    expect(screen.getAllByText("yes").length).toBeGreaterThan(0);
    expect(screen.getAllByText("no").length).toBeGreaterThan(0);
  });

  it("warns when record-on-power is set", () => {
    show({ config: { ...record, rfChain: { ...record.rfChain, recOnPower: true } } });
    expect(screen.getByText(/energising the camera rail starts a recording/)).toBeInTheDocument();
  });

  describe("transaction badges", () => {
    it.each([
      [{ persisted: true }, "persisted"],
      [{ persisted: false }, "not persisted"],
      [{ linkReady: true }, "link ready"],
      [{ linkReady: false }, "link not ready"],
      [{ readbackMatches: true }, "readback matches"],
      [{ readbackMatches: false }, "readback MISMATCH"],
      [{}, "readback unknown"],
      [{ statusName: "applied" }, "applied"],
      [{ placeholderId: true }, "placeholder callsign"],
      [{ validationError: 3 }, "validation error 3"],
    ])("%j shows '%s'", (state, text) => {
      show({ config: record, ...state });
      expect(screen.getAllByText(text).length).toBeGreaterThan(0);
    });

    it("does not show a validation error of zero", () => {
      show({ config: record, validationError: 0 });
      expect(screen.queryByText(/validation error/)).not.toBeInTheDocument();
    });

    it("warns about the placeholder callsign without gating anything", () => {
      show({ config: record, placeholderId: true });
      expect(screen.getByText(/never gated on it/)).toBeInTheDocument();
    });

    it("has no controls to change the record", () => {
      show({ config: record });
      expect(within(document.body).queryAllByRole("button")).toHaveLength(0);
    });
  });
});

import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "@/lib/api";
import type { SystemConfig } from "@/lib/types";
import { createTestQueryClient, queryWrapper } from "@/test/queryWrapper";
import {
  queryKeys,
  useActuators,
  useAssignRole,
  useConfig,
  useConfigList,
  useDataFiles,
  useDownloadDataFile,
  useLoadConfig,
  usePatchConfig,
  usePutConfig,
  useReloadConfig,
  useRoles,
  useSendCommand,
  useSendSystemCommand,
  useSensors,
  useSetCalibration,
  useSetDataSaving,
  useUploadConfig,
  useUploadDataFile,
} from "./index";

vi.mock("@/lib/api");

const mocked = vi.mocked(api);
const CFG: SystemConfig = { Sensors: [{ name: "PT1", type: "PT", binding: { source: "GCS", hat_id: 0, channel_id: 0 } }], Actuators: [] };

beforeEach(() => {
  vi.resetAllMocks();
  mocked.getConfig.mockResolvedValue(CFG);
  mocked.getSensors.mockResolvedValue(CFG.Sensors!);
  mocked.getActuators.mockResolvedValue([]);
});

describe("query keys", () => {
  it("are distinct, so one resource's cache never overwrites another's", () => {
    const keys = Object.values(queryKeys).map((k) => JSON.stringify(k));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("read hooks", () => {
  it.each([
    ["useConfig", () => useConfig(), () => mocked.getConfig, CFG],
    ["useSensors", () => useSensors(), () => mocked.getSensors, CFG.Sensors],
    ["useActuators", () => useActuators(), () => mocked.getActuators, []],
  ] as Array<[string, () => { isSuccess: boolean; data: unknown }, () => unknown, unknown]>)("%s fetches once and returns the data", async (_n, hook, fn, data) => {
    const { result } = renderHook(hook, { wrapper: queryWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(data);
    expect(fn()).toHaveBeenCalledTimes(1);
  });

  it("useConfigList lists the config files", async () => {
    mocked.listConfigFiles.mockResolvedValue(["a.yaml", "b.yaml"]);
    const { result } = renderHook(() => useConfigList(), { wrapper: queryWrapper() });
    await waitFor(() => expect(result.current.data).toEqual(["a.yaml", "b.yaml"]));
  });

  it("useRoles lists connected clients", async () => {
    mocked.getRoles.mockResolvedValue([{ client_id: "c1", role: "viewer" }]);
    const { result } = renderHook(() => useRoles(), { wrapper: queryWrapper() });
    await waitFor(() => expect(result.current.data).toEqual([{ client_id: "c1", role: "viewer" }]));
  });

  it("useDataFiles passes the client id through", async () => {
    mocked.getDataFiles.mockResolvedValue(["a.csv"]);
    const { result } = renderHook(() => useDataFiles("c9"), { wrapper: queryWrapper() });
    await waitFor(() => expect(result.current.data).toEqual(["a.csv"]));
    expect(mocked.getDataFiles).toHaveBeenCalledWith("c9");
  });

  it("surfaces a fetch failure as an error without retrying in tests", async () => {
    mocked.getConfig.mockRejectedValue(new Error("down"));
    const { result } = renderHook(() => useConfig(), { wrapper: queryWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("down");
    expect(mocked.getConfig).toHaveBeenCalledTimes(1);
  });
});

describe("config writes refresh every config view", () => {
  /** Mount config, sensors and actuators, then run a mutation and count refetches. */
  async function refetchesAfter(useMutationHook: () => { mutate: (v: never) => void; isSuccess: boolean }, variable: unknown) {
    const client = createTestQueryClient();
    const wrapper = queryWrapper(client);
    renderHook(() => ({ c: useConfig(), s: useSensors(), a: useActuators() }), { wrapper });
    await waitFor(() => expect(mocked.getActuators).toHaveBeenCalledTimes(1));
    const m = renderHook(useMutationHook, { wrapper });
    m.result.current.mutate(variable as never);
    await waitFor(() => expect(m.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(mocked.getConfig).toHaveBeenCalledTimes(2));
    return { config: mocked.getConfig.mock.calls.length, sensors: mocked.getSensors.mock.calls.length, actuators: mocked.getActuators.mock.calls.length };
  }

  it.each([
    ["useUploadConfig", () => useUploadConfig(), () => mocked.uploadConfig.mockResolvedValue(CFG), new File(["x"], "c.yaml"), () => mocked.uploadConfig],
    ["usePutConfig", () => usePutConfig(), () => mocked.putConfig.mockResolvedValue(CFG), CFG, () => mocked.putConfig],
    ["usePatchConfig", () => usePatchConfig(), () => mocked.patchConfig.mockResolvedValue(CFG), { Actuators: [] }, () => mocked.patchConfig],
    ["useReloadConfig", () => useReloadConfig(), () => mocked.reloadConfig.mockResolvedValue(CFG), undefined, () => mocked.reloadConfig],
  ])("%s", async (_n, hook, arm, variable, fn) => {
    arm();
    const counts = await refetchesAfter(hook as never, variable);
    expect(counts).toEqual({ config: 2, sensors: 2, actuators: 2 });
    expect(fn()).toHaveBeenCalledTimes(1);
  });

  it("does not refetch when the write fails", async () => {
    mocked.putConfig.mockRejectedValue(new Error("invalid"));
    const wrapper = queryWrapper();
    renderHook(() => useConfig(), { wrapper });
    await waitFor(() => expect(mocked.getConfig).toHaveBeenCalledTimes(1));
    const m = renderHook(() => usePutConfig(), { wrapper });
    m.result.current.mutate(CFG);
    await waitFor(() => expect(m.result.current.isError).toBe(true));
    expect(m.result.current.error?.message).toBe("invalid");
    expect(mocked.getConfig).toHaveBeenCalledTimes(1);
  });

  it("useLoadConfig writes the returned config straight into the cache, with no refetch", async () => {
    const loaded: SystemConfig = {
      Sensors: [{ name: "PT2", type: "PT", binding: { source: "GCS", hat_id: 1, channel_id: 1 } }],
      Actuators: [{ name: "V1", type: "solenoid", binding: { target: "GCS", relay_channel: 0 } }],
    };
    mocked.loadConfigFile.mockResolvedValue(loaded);
    const client = createTestQueryClient();
    const wrapper = queryWrapper(client);
    renderHook(() => useConfig(), { wrapper });
    await waitFor(() => expect(mocked.getConfig).toHaveBeenCalledTimes(1));

    const m = renderHook(() => useLoadConfig(), { wrapper });
    m.result.current.mutate("flight.yaml");
    await waitFor(() => expect(m.result.current.isSuccess).toBe(true));

    expect(mocked.loadConfigFile).toHaveBeenCalledWith("flight.yaml");
    expect(client.getQueryData(queryKeys.config)).toEqual(loaded);
    expect(client.getQueryData(queryKeys.sensors)).toEqual(loaded.Sensors);
    expect(client.getQueryData(queryKeys.actuators)).toEqual(loaded.Actuators);
    expect(mocked.getConfig).toHaveBeenCalledTimes(1);
  });

  it("useLoadConfig caches empty lists for a config with no sensors or actuators", async () => {
    mocked.loadConfigFile.mockResolvedValue({});
    const client = createTestQueryClient();
    const m = renderHook(() => useLoadConfig(), { wrapper: queryWrapper(client) });
    m.result.current.mutate("empty.yaml");
    await waitFor(() => expect(m.result.current.isSuccess).toBe(true));
    expect(client.getQueryData(queryKeys.sensors)).toEqual([]);
    expect(client.getQueryData(queryKeys.actuators)).toEqual([]);
  });
});

describe("mutation hooks that forward to the API", () => {
  async function run<V>(hook: () => { mutate: (v: V) => void; isSuccess: boolean }, variable: V) {
    const { result } = renderHook(hook, { wrapper: queryWrapper() });
    result.current.mutate(variable);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  }

  it("useSendCommand", async () => {
    mocked.sendCommand.mockResolvedValue({ published_commands: [] });
    const payload = { type: "solenoid", name: "V1", state: "open" };
    await run(() => useSendCommand(), { payload, clientId: "c1" });
    expect(mocked.sendCommand).toHaveBeenCalledWith(payload, "c1");
  });

  it("useSendSystemCommand", async () => {
    mocked.sendSystemCommand.mockResolvedValue({ published_commands: [] });
    const payload = { name: "Abort" } as never;
    await run(() => useSendSystemCommand(), { payload, clientId: "c1" });
    expect(mocked.sendSystemCommand).toHaveBeenCalledWith(payload, "c1");
  });

  it("a rejected command reaches the caller as an error", async () => {
    mocked.sendCommand.mockRejectedValue(new Error("Physical lockout active"));
    const { result } = renderHook(() => useSendCommand(), { wrapper: queryWrapper() });
    result.current.mutate({ payload: { type: "t", name: "n", state: "s" }, clientId: "c1" });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("Physical lockout active");
  });

  it("useAssignRole", async () => {
    mocked.assignRole.mockResolvedValue({ client_id: "c1", role: "operator" });
    await run(() => useAssignRole(), { payload: { role: "operator" as const }, clientId: "c1" });
    expect(mocked.assignRole).toHaveBeenCalledWith({ role: "operator" }, "c1");
  });

  it("useSetCalibration and useSetDataSaving", async () => {
    mocked.setCalibration.mockResolvedValue({ calibration_enabled: true });
    mocked.setDataSaving.mockResolvedValue({ data_saving_enabled: false });
    await run(() => useSetCalibration(), true);
    await run(() => useSetDataSaving(), false);
    expect(mocked.setCalibration).toHaveBeenCalledWith(true);
    expect(mocked.setDataSaving).toHaveBeenCalledWith(false);
  });

  it("useDownloadDataFile and useUploadDataFile", async () => {
    mocked.downloadDataFile.mockResolvedValue(new Blob(["x"]));
    mocked.uploadDataFile.mockResolvedValue({ file_name: "a.csv", bytes_written: 1 });
    const file = new File(["x"], "a.csv");
    await run(() => useDownloadDataFile(), "a.csv");
    await run(() => useUploadDataFile(), file);
    expect(mocked.downloadDataFile).toHaveBeenCalledWith("a.csv");
    expect(mocked.uploadDataFile).toHaveBeenCalledWith(file);
  });
});

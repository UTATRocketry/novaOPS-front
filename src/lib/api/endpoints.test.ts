import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { NovaPidLayout } from "../pid/serializer";
import * as api from "./index";
import * as direct from "./direct";

const BASE = "http://nova.test";
const CLIENT = "client-1";
const server = setupServer();

interface Seen {
  method: string;
  path: string;
  headers: Headers;
  body: unknown;
  form?: FormData;
}

let seen: Seen[];

/** Answer every request with `reply` and record what was sent. */
function recordAll(reply: () => Response = () => HttpResponse.json({})) {
  server.use(
    http.all(`${BASE}/*`, async ({ request }) => {
      const url = new URL(request.url);
      const type = request.headers.get("content-type") ?? "";
      const entry: Seen = { method: request.method, path: url.pathname + url.search, headers: request.headers, body: undefined };
      if (type.startsWith("multipart/")) entry.form = await request.formData();
      else {
        const text = await request.text();
        entry.body = text ? JSON.parse(text) : undefined;
      }
      seen.push(entry);
      return reply();
    }),
  );
}

const last = () => seen[seen.length - 1];

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterAll(() => server.close());
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_NOVA_API_BASE_URL", BASE);
  seen = [];
});
afterEach(() => {
  server.resetHandlers();
  vi.unstubAllEnvs();
});

/** [name, call, method, path, body, sends client id] */
const jsonCalls: Array<[string, () => Promise<unknown>, string, string, unknown, boolean]> = [
  ["getHealth", () => api.getHealth(), "GET", "/health", undefined, false],
  ["getConfig", () => api.getConfig(), "GET", "/api/config", undefined, false],
  ["getSensors", () => api.getSensors(), "GET", "/api/config/sensors", undefined, false],
  ["getActuators", () => api.getActuators(), "GET", "/api/config/actuators", undefined, false],
  ["putConfig", () => api.putConfig({ Sensors: [] }), "PUT", "/api/config/update", { Sensors: [] }, false],
  ["patchConfig", () => api.patchConfig({ Actuators: [] }), "PATCH", "/api/config/update", { Actuators: [] }, false],
  ["reloadConfig", () => api.reloadConfig(), "POST", "/api/config/reload", undefined, false],
  ["listConfigFiles", () => api.listConfigFiles(), "GET", "/api/config/list", undefined, false],
  ["loadConfigFile", () => api.loadConfigFile("a b/c.yaml"), "POST", "/api/config/load?path=a%20b%2Fc.yaml", undefined, false],
  ["sendCommand", () => api.sendCommand({ type: "solenoid", name: "V1", state: "open" }, CLIENT), "POST", "/api/commands", { type: "solenoid", name: "V1", state: "open" }, true],
  ["sendSystemCommand", () => api.sendSystemCommand({ name: "Abort" } as never, CLIENT), "POST", "/api/system-commands", { name: "Abort" }, true],
  ["getRoles", () => api.getRoles(), "GET", "/api/roles", undefined, false],
  ["assignRole", () => api.assignRole({ role: "operator" }, CLIENT), "POST", "/api/roles", { role: "operator" }, true],
  ["setCalibration", () => api.setCalibration(true), "POST", "/api/flags/calibration", { enabled: true }, false],
  ["setDataSaving", () => api.setDataSaving(false), "POST", "/api/flags/data-saving", { enabled: false }, false],
  ["getRecordingStatus", () => api.getRecordingStatus(), "GET", "/api/flags/data-saving", undefined, false],
  ["startRecording", () => api.startRecording(CLIENT), "POST", "/api/flags/data-saving", { enabled: true }, true],
  ["stopRecording", () => api.stopRecording(CLIENT), "POST", "/api/flags/data-saving", { enabled: false }, true],
  ["getCalibrationStatus", () => api.getCalibrationStatus(), "GET", "/api/flags/calibration", undefined, false],
  ["toggleCalibration", () => api.toggleCalibration(CLIENT, false), "POST", "/api/flags/calibration", { enabled: false }, true],
  ["getDataFiles", () => api.getDataFiles(CLIENT), "GET", "/api/data-files", undefined, true],
  ["sendConsole", () => api.sendConsole({ level: "info", message: "hi" }), "POST", "/api/console", { level: "info", message: "hi" }, false],
  ["fasListPorts", () => api.fasListPorts(CLIENT), "POST", "/api/console/command", { action: "list_ports" }, true],
  ["fasLinkStatus", () => api.fasLinkStatus(CLIENT), "POST", "/api/console/command", { action: "status" }, true],
  ["fasConfigurePort", () => api.fasConfigurePort("COM3", 115200, CLIENT), "POST", "/api/console/command", { action: "configure", port: "COM3", baud: 115200 }, true],
  ["fasDisconnectPort", () => api.fasDisconnectPort(CLIENT), "POST", "/api/console/command", { action: "disconnect" }, true],
  ["sendDirectRelay", () => direct.sendDirectRelay({ target: "FAS", node: "EPB_0", channel: 1, state: 1 }, CLIENT), "POST", "/api/direct/relay", { target: "FAS", node: "EPB_0", channel: 1, state: 1 }, true],
  ["sendDirectServo", () => direct.sendDirectServo({ target: "GCS", channel: 2, pulse_us: 1500 }, CLIENT), "POST", "/api/direct/servo", { target: "GCS", channel: 2, pulse_us: 1500 }, true],
  ["sendFasSd", () => direct.sendFasSd({ action: "clear" }, CLIENT), "POST", "/api/fas/sd", { action: "clear" }, true],
  ["sendFasBuzzer", () => direct.sendFasBuzzer({ action: "stop" }, CLIENT), "POST", "/api/fas/buzzer", { action: "stop" }, true],
  ["sendFasRab", () => direct.sendFasRab({ action: "arm", rab_id: 1 }, CLIENT), "POST", "/api/fas/rab", { action: "arm", rab_id: 1 }, true],
  ["sendFasAux", () => direct.sendFasAux({ device: "runcam", enable: true }, CLIENT), "POST", "/api/fas/aux", { device: "runcam", enable: true }, true],
  ["sendFasRuncamRecord", () => direct.sendFasRuncamRecord({ node: "FMC_0", enable: true }, CLIENT), "POST", "/api/fas/runcam_record", { node: "FMC_0", enable: true }, true],
  ["sendFasRadioConfig", () => direct.sendFasRadioConfig({ node: "FMC_0", cfg: { sf: 7 } }, CLIENT), "POST", "/api/fas/radio_config", { node: "FMC_0", cfg: { sf: 7 } }, true],
  ["sendFasSound", () => direct.sendFasSound({ action: "volume", volume: 10 }, CLIENT), "POST", "/api/fas/sound", { action: "volume", volume: 10 }, true],
  ["sendFasCharger", () => direct.sendFasCharger({ enable: false }, CLIENT), "POST", "/api/fas/charger", { enable: false }, true],
];

describe("REST wrappers", () => {
  it.each(jsonCalls)("%s", async (_name, call, method, path, body, sendsClientId) => {
    recordAll();
    await call();
    expect(seen).toHaveLength(1);
    expect(last().method).toBe(method);
    expect(last().path).toBe(path);
    expect(last().body).toEqual(body);
    if (sendsClientId) expect(last().headers.get("x-client-id")).toBe(CLIENT);
    else expect(last().headers.has("x-client-id")).toBe(false);
  });

  it("returns the parsed body to the caller", async () => {
    recordAll(() => HttpResponse.json({ published_commands: [1, 2] }));
    await expect(api.sendCommand({ type: "t", name: "n", state: "s" }, CLIENT)).resolves.toEqual({ published_commands: [1, 2] });
  });

  it("surfaces a role rejection as the backend's message", async () => {
    recordAll(() => HttpResponse.json({ detail: "Role viewer may not command" }, { status: 403 }));
    await expect(api.sendCommand({ type: "t", name: "n", state: "s" }, CLIENT)).rejects.toThrow("Role viewer may not command");
  });
});

describe("file download", () => {
  it("downloadDataFile fetches the named file, URL-encoded, as a blob", async () => {
    recordAll(() => new HttpResponse("a,b\n1,2", { headers: { "content-type": "text/csv" } }));
    const blob = await api.downloadDataFile("my run/1.csv");
    expect(last().path).toBe("/api/data-files/my%20run%2F1.csv");
    expect(await blob.text()).toBe("a,b\n1,2");
  });

  it("downloadConfigFile fetches the named file as a blob", async () => {
    recordAll(() => new HttpResponse("a: 1"));
    expect(await (await api.downloadConfigFile("c.yaml")).text()).toBe("a: 1");
    expect(last().path).toBe("/api/config/download/c.yaml");
  });

  it.each([
    ["downloadDataFile", () => api.downloadDataFile("x.csv")],
    ["downloadConfigFile", () => api.downloadConfigFile("x.yaml")],
  ])("%s throws on a non-OK response", async (_n, call) => {
    recordAll(() => new HttpResponse("nope", { status: 404 }));
    await expect(call()).rejects.toThrow("NovaOps API error 404");
  });
});

describe("downloadData", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(URL, "createObjectURL");
    Reflect.deleteProperty(URL, "revokeObjectURL");
  });

  it("downloads the most recent file listed", async () => {
    server.use(
      http.get(`${BASE}/api/data-files`, () => HttpResponse.json(["old.csv", "new.csv"])),
      http.get(`${BASE}/api/data-files/:name`, ({ params }) => new HttpResponse(`contents of ${params.name}`)),
    );
    const revoke = vi.fn();
    // jsdom has no object URLs; add them to the real URL, keeping the rest intact.
    Object.assign(URL, { createObjectURL: () => "blob:fake", revokeObjectURL: revoke });
    let downloaded = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloaded = this.download;
    });

    await api.downloadData();
    expect(downloaded).toBe("new.csv");
    expect(revoke).toHaveBeenCalledWith("blob:fake");
  });

  it("fails clearly when there is nothing to download", async () => {
    server.use(http.get(`${BASE}/api/data-files`, () => HttpResponse.json([])));
    await expect(api.downloadData()).rejects.toThrow("No data files available");
  });
});

describe("withBackendSupport", () => {
  it("passes a result through", async () => {
    await expect(direct.withBackendSupport("Radio", async () => 5)).resolves.toBe(5);
  });

  it.each(["NovaOps API error 404", "NovaOps API error 405", "Route Not Found"])(
    "turns '%s' into a clear 'not supported yet' error",
    async (message) => {
      await expect(
        direct.withBackendSupport("Radio config", async () => {
          throw new Error(message);
        }),
      ).rejects.toThrow("Radio config: backend does not support this yet");
    },
  );

  it("rethrows other errors unchanged", async () => {
    const err = new Error("NovaOps API error 500");
    await expect(
      direct.withBackendSupport("x", async () => {
        throw err;
      }),
    ).rejects.toBe(err);
  });

  it("does not mistake a number that merely contains 404 for a missing endpoint", async () => {
    await expect(
      direct.withBackendSupport("x", async () => {
        throw new Error("timeout after 14040 ms");
      }),
    ).rejects.toThrow("timeout after 14040 ms");
  });
});

describe("P&ID layout", () => {
  const layout = { schemaVersion: 1, meta: { name: "L", savedAt: "", app: "novaops" }, systems: {}, graph: { cells: [] } } as unknown as NovaPidLayout;

  it("getPidLayout returns a valid layout", async () => {
    recordAll(() => HttpResponse.json({ layout }));
    await expect(api.getPidLayout()).resolves.toEqual(layout);
    expect(last().path).toBe("/api/diagram");
  });

  it("getPidLayout returns null for an invalid layout, a 404 or an unreachable backend", async () => {
    server.use(http.get(`${BASE}/api/diagram`, () => HttpResponse.json({ layout: { nope: true } })));
    await expect(api.getPidLayout()).resolves.toBeNull();
    server.use(http.get(`${BASE}/api/diagram`, () => HttpResponse.json({ detail: "none" }, { status: 404 })));
    await expect(api.getPidLayout()).resolves.toBeNull();
    server.use(http.get(`${BASE}/api/diagram`, () => HttpResponse.error()));
    await expect(api.getPidLayout()).resolves.toBeNull();
  });

  it("putPidLayout wraps the layout and sends the client id", async () => {
    recordAll();
    await api.putPidLayout(layout, CLIENT);
    expect(last()).toMatchObject({ method: "PUT", path: "/api/diagram", body: { layout } });
    expect(last().headers.get("x-client-id")).toBe(CLIENT);
  });

  it("putPidLayout throws on a rejected save so the operator is told", async () => {
    recordAll(() => HttpResponse.json({ detail: "Operator role required" }, { status: 403 }));
    await expect(api.putPidLayout(layout, CLIENT)).rejects.toThrow("Operator role required");
  });
});

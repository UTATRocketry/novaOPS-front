// @vitest-environment node
//
// Multipart uploads run under Node's own FormData/File: jsdom's FormData is not
// one Node's fetch can serialise, which is a test-environment limit, not an app
// one (browsers use the same FormData for the body and the request).

import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { uploadFasSoundClip } from "./direct";
import { uploadConfig } from "./config";
import { uploadDataFile } from "./dataFiles";

const BASE = "http://nova.test";
const CLIENT = "client-1";
const server = setupServer();

let form: FormData | undefined;
let headers: Headers | undefined;
let path = "";

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterAll(() => server.close());
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_NOVA_API_BASE_URL", BASE);
  form = undefined;
  server.use(
    http.post(`${BASE}/*`, async ({ request }) => {
      path = new URL(request.url).pathname;
      headers = request.headers;
      form = await request.formData();
      return HttpResponse.json({ file_name: "run.csv", bytes_written: 7, uploaded: {} });
    }),
  );
});
afterEach(() => {
  server.resetHandlers();
  vi.unstubAllEnvs();
});

const csv = () => new File(["a,b\n1,2"], "run.csv", { type: "text/csv" });

describe("uploads", () => {
  it("uploadConfig posts the file as multipart form data", async () => {
    await uploadConfig(new File(["x: 1"], "cfg.yaml"));
    expect(path).toBe("/api/config/upload");
    expect(headers?.get("content-type")).toMatch(/^multipart\/form-data; boundary=/);
    expect((form!.get("file") as File).name).toBe("cfg.yaml");
  });

  it("uploadDataFile posts the file and returns the backend's summary", async () => {
    await expect(uploadDataFile(csv())).resolves.toEqual({ file_name: "run.csv", bytes_written: 7, uploaded: {} });
    expect(path).toBe("/api/data-files/upload");
    expect(await (form!.get("file") as File).text()).toBe("a,b\n1,2");
  });

  it("uploadFasSoundClip sends defaults, omitting unset options", async () => {
    await uploadFasSoundClip({ file: csv(), name: "beep" }, CLIENT);
    expect(path).toBe("/api/fas/sound/upload");
    expect(form!.get("name")).toBe("beep");
    expect(form!.get("format")).toBe("adpcm");
    for (const key of ["highpass_hz", "pitch_semitones", "node"]) expect(form!.has(key)).toBe(false);
    expect(headers?.get("x-client-id")).toBe(CLIENT);
  });

  it("uploadFasSoundClip sends every option when given, including zero", async () => {
    await uploadFasSoundClip(
      { file: csv(), name: "b", format: "pcm", highpassHz: 0, pitchSemitones: -2, node: "FMC_1" },
      CLIENT,
    );
    expect(form!.get("format")).toBe("pcm");
    expect(form!.get("highpass_hz")).toBe("0");
    expect(form!.get("pitch_semitones")).toBe("-2");
    expect(form!.get("node")).toBe("FMC_1");
  });
});

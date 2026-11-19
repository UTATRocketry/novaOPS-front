import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { onAlertEvent } from "../alerts/bus";
import type { AlertInput } from "../alerts/types";
import { novaFetch } from "./novaFetch";

const BASE = "http://nova.test";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterAll(() => server.close());

let alerts: AlertInput[];
let off: () => void;

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_NOVA_API_BASE_URL", BASE);
  alerts = [];
  off = onAlertEvent((a) => alerts.push(a));
});

afterEach(() => {
  off();
  server.resetHandlers();
  vi.unstubAllEnvs();
});

describe("novaFetch", () => {
  it("GETs JSON from the configured base URL", async () => {
    server.use(http.get(`${BASE}/health`, () => HttpResponse.json({ status: "ok" })));
    await expect(novaFetch("/health")).resolves.toEqual({ status: "ok" });
  });

  it("uses a relative URL when no base is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_NOVA_API_BASE_URL", "");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
    await novaFetch("/health");
    expect(fetchSpy.mock.calls[0][0]).toBe("/health");
  });

  it("sends JSON content type and the client id when given", async () => {
    let headers: Headers | undefined;
    server.use(
      http.post(`${BASE}/api/x`, ({ request }) => {
        headers = request.headers;
        return HttpResponse.json({});
      }),
    );
    await novaFetch("/api/x", { method: "POST", body: "{}" }, "client-7");
    expect(headers?.get("content-type")).toBe("application/json");
    expect(headers?.get("x-client-id")).toBe("client-7");
  });

  it("omits X-Client-Id when no client id is given", async () => {
    let headers: Headers | undefined;
    server.use(
      http.get(`${BASE}/api/x`, ({ request }) => {
        headers = request.headers;
        return HttpResponse.json({});
      }),
    );
    await novaFetch("/api/x");
    expect(headers?.has("x-client-id")).toBe(false);
  });

  it("lets the caller's headers override the defaults", async () => {
    let headers: Headers | undefined;
    server.use(
      http.get(`${BASE}/api/x`, ({ request }) => {
        headers = request.headers;
        return HttpResponse.json({});
      }),
    );
    await novaFetch("/api/x", { headers: { "Content-Type": "text/plain" } });
    expect(headers?.get("content-type")).toBe("text/plain");
  });

  it("does not set a JSON content type for FormData, so the multipart boundary is kept", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
    await novaFetch("/api/upload", { method: "POST", body: new FormData() });
    const sent = fetchSpy.mock.calls[0][1]?.headers as Record<string, string>;
    expect(sent["Content-Type"]).toBeUndefined();
  });

  it("fails, rather than reaching a real network, when a test forgot to mock a route", async () => {
    await expect(novaFetch("/not-mocked")).rejects.toThrow();
  });

  describe("errors", () => {
    it("throws the FastAPI detail string", async () => {
      server.use(http.post(`${BASE}/api/commands`, () => HttpResponse.json({ detail: "Viewer cannot command" }, { status: 403 })));
      await expect(novaFetch("/api/commands", { method: "POST" })).rejects.toThrow("Viewer cannot command");
    });

    it("falls back to a status message when the body has no string detail", async () => {
      server.use(
        http.get(`${BASE}/a`, () => HttpResponse.json({ detail: [{ msg: "bad" }] }, { status: 422 })),
        http.get(`${BASE}/b`, () => new HttpResponse("not json", { status: 404 })),
        http.get(`${BASE}/c`, () => HttpResponse.json(null, { status: 400 })),
      );
      await expect(novaFetch("/a")).rejects.toThrow("NovaOps API error 422");
      await expect(novaFetch("/b")).rejects.toThrow("NovaOps API error 404");
      await expect(novaFetch("/c")).rejects.toThrow("NovaOps API error 400");
    });

    it("does not raise an alert for a 4xx, which callers handle inline", async () => {
      server.use(http.get(`${BASE}/x`, () => HttpResponse.json({ detail: "nope" }, { status: 403 })));
      await expect(novaFetch("/x")).rejects.toThrow();
      expect(alerts).toEqual([]);
    });

    it("raises an error alert for a 5xx", async () => {
      server.use(http.post(`${BASE}/api/commands`, () => HttpResponse.json({ detail: "MQTT down" }, { status: 503 })));
      await expect(novaFetch("/api/commands", { method: "POST" })).rejects.toThrow("MQTT down");
      expect(alerts).toEqual([
        { severity: "error", source: "api", title: "API error 503", detail: "POST /api/commands — MQTT down" },
      ]);
    });

    it("raises a network alert and rethrows the original error when the request fails", async () => {
      server.use(http.get(`${BASE}/health`, () => HttpResponse.error()));
      await expect(novaFetch("/health")).rejects.toBeInstanceOf(TypeError);
      expect(alerts).toHaveLength(1);
      expect(alerts[0]).toMatchObject({ severity: "error", source: "api", title: "Network error" });
      expect(alerts[0].detail).toMatch(/^GET \/health — /);
    });

    it("rejects on a 200 whose body is not JSON", async () => {
      server.use(http.get(`${BASE}/x`, () => new HttpResponse("<html>", { status: 200 })));
      await expect(novaFetch("/x")).rejects.toThrow();
    });
  });
});

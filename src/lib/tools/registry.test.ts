import { afterEach, describe, expect, it, vi } from "vitest";

import { getTool, getTools, registerTool } from "./registry";

// The registry is a module-level singleton, so each test uses its own slugs.
const def = (slug: string, over = {}) => ({ slug, label: slug.toUpperCase(), description: "d", icon: "build", ...over });

afterEach(() => vi.restoreAllMocks());

describe("tool registry", () => {
  it("registers a tool and resolves its href from the slug", () => {
    registerTool(def("alpha"));
    expect(getTool("alpha")).toMatchObject({ slug: "alpha", label: "ALPHA", href: "/tools/alpha" });
  });

  it("lists tools in registration order", () => {
    registerTool(def("order-1"));
    registerTool(def("order-2"));
    registerTool(def("order-3"));
    const slugs = getTools().map((t) => t.slug).filter((s) => s.startsWith("order-"));
    expect(slugs).toEqual(["order-1", "order-2", "order-3"]);
  });

  it("replaces, rather than duplicates, a tool registered twice", () => {
    registerTool(def("dup", { label: "First" }));
    registerTool(def("dup", { label: "Second" }));
    expect(getTools().filter((t) => t.slug === "dup")).toHaveLength(1);
    expect(getTool("dup")?.label).toBe("Second");
  });

  it("trims the slug", () => {
    registerTool(def("  padded  "));
    expect(getTool("padded")?.href).toBe("/tools/padded");
  });

  it("ignores a blank slug, with a warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const before = getTools().length;
    registerTool(def("   "));
    registerTool(def(""));
    expect(getTools()).toHaveLength(before);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("returns undefined for an unknown slug", () => {
    expect(getTool("never-registered")).toBeUndefined();
  });

  it("returns a copy of the list, so callers cannot change the registry", () => {
    registerTool(def("copy-check"));
    const list = getTools();
    list.length = 0;
    expect(getTool("copy-check")).toBeDefined();
  });

  it("keeps the optional badge", () => {
    registerTool(def("badged", { badge: "beta" }));
    expect(getTool("badged")?.badge).toBe("beta");
  });
});

describe("tool manifest", () => {
  it("registers every shipped tool with a route that matches its folder name", async () => {
    await import("./manifest");
    const slugs = getTools().map((t) => t.slug);
    for (const slug of ["servo", "relay", "soundboard", "analysis", "radio"]) {
      expect(slugs).toContain(slug);
      expect(getTool(slug)?.href).toBe(`/tools/${slug}`);
    }
  });
});

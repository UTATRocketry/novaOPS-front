import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { FakeUPlot } from "./src/test/uplotMock";

// uPlot needs a real canvas; every test gets the recording fake instead.
vi.mock("uplot", async () => await import("./src/test/uplotMock"));

// jsdom has no layout engine, so it lacks these browser APIs. uPlot, Chakra and
// next-themes touch them at import or mount time; stubs are enough because no
// test asserts on real layout.
if (typeof window !== "undefined") {
  if (!window.matchMedia) {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList;
  }

  class NoopObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  window.ResizeObserver ??= NoopObserver as unknown as typeof ResizeObserver;
  window.IntersectionObserver ??= NoopObserver as unknown as typeof IntersectionObserver;

  window.scrollTo = () => {};
  Element.prototype.scrollIntoView ??= () => {};
}

afterEach(() => {
  cleanup();
  FakeUPlot.reset();
});

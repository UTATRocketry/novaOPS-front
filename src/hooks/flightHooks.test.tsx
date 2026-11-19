import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearFlightRecord, startFlightRecorder, stopFlightRecorder } from "@/lib/flight/recorder";
import type { FlightTelemetry } from "@/lib/flight/types";
import { useNovaStore } from "@/lib/store";
import { useFlightKinematics } from "./useFlightKinematics";
import { useFlightRecord } from "./useFlightRecord";

const t = (v: Partial<FlightTelemetry>) => v as FlightTelemetry;

describe("useFlightKinematics", () => {
  function setup(first: FlightTelemetry | null) {
    return renderHook(({ telemetry }: { telemetry: FlightTelemetry | null }) => useFlightKinematics(telemetry), {
      initialProps: { telemetry: first },
    });
  }

  it("has nothing to report without telemetry", () => {
    expect(setup(null).result.current).toEqual({});
  });

  it("needs two samples before it reports a velocity", () => {
    const { result } = setup(t({ altitude: 100, timestamp: 1000 }));
    expect(result.current.velocity).toBeUndefined();
  });

  it("differentiates altitude over the sample clock", () => {
    const { result, rerender } = setup(t({ altitude: 100, timestamp: 1000 }));
    rerender({ telemetry: t({ altitude: 110, timestamp: 2000 }) });
    expect(result.current.velocity).toBe(10);
  });

  it("reports a descent as a negative velocity", () => {
    const { result, rerender } = setup(t({ altitude: 100, timestamp: 1000 }));
    rerender({ telemetry: t({ altitude: 95, timestamp: 2000 }) });
    expect(result.current.velocity).toBe(-5);
  });

  it("smooths later samples with an EMA (alpha 0.3)", () => {
    const { result, rerender } = setup(t({ altitude: 0, timestamp: 1000 }));
    rerender({ telemetry: t({ altitude: 10, timestamp: 2000 }) }); // 10 m/s
    rerender({ telemetry: t({ altitude: 30, timestamp: 3000 }) }); // inst 20 -> 13
    expect(result.current.velocity).toBeCloseTo(13);
  });

  it("ignores a gap longer than 2 s and a clock that did not advance", () => {
    const { result, rerender } = setup(t({ altitude: 0, timestamp: 1000 }));
    rerender({ telemetry: t({ altitude: 500, timestamp: 9000 }) });
    expect(result.current.velocity).toBeUndefined();
    rerender({ telemetry: t({ altitude: 600, timestamp: 9000 }) });
    expect(result.current.velocity).toBeUndefined();
  });

  it("forgets its history when altitude disappears, so it never spans the gap", () => {
    const { result, rerender } = setup(t({ altitude: 0, timestamp: 1000 }));
    rerender({ telemetry: t({ altitude: 10, timestamp: 2000 }) });
    expect(result.current.velocity).toBe(10);
    rerender({ telemetry: t({}) });
    expect(result.current.velocity).toBeUndefined();
    rerender({ telemetry: t({ altitude: 50, timestamp: 3000 }) });
    expect(result.current.velocity).toBeUndefined();
  });

  describe("inclination", () => {
    it.each([
      [{ x: 0, y: 0, z: 1, magnitude: 1 }, 0],
      [{ x: 1, y: 0, z: 0, magnitude: 1 }, 90],
      [{ x: 0, y: 0, z: -1, magnitude: 1 }, 180],
      [{ x: 1, y: 0, z: 1, magnitude: Math.SQRT2 }, 45],
    ])("accel %j -> %d degrees from vertical", (accel, degrees) => {
      const { result } = setup(t({ accel }));
      expect(result.current.inclination).toBeCloseTo(degrees);
    });

    it("clamps rounding error instead of returning NaN", () => {
      const { result } = setup(t({ accel: { x: 0, y: 0, z: 1.0000001, magnitude: 1 } }));
      expect(result.current.inclination).toBe(0);
    });

    it("is not reported for a zero-magnitude or missing accelerometer", () => {
      expect(setup(t({ accel: { x: 0, y: 0, z: 0, magnitude: 0 } })).result.current.inclination).toBeUndefined();
      expect(setup(t({})).result.current.inclination).toBeUndefined();
    });
  });
});

describe("useFlightRecord", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useNovaStore.setState(useNovaStore.getInitialState(), true);
    clearFlightRecord();
  });
  afterEach(() => {
    stopFlightRecorder();
    clearFlightRecord();
    vi.useRealTimers();
  });

  it("returns the recorder's live series", () => {
    startFlightRecorder();
    const { result } = renderHook(() => useFlightRecord());
    vi.advanceTimersByTime(500);
    expect(result.current.tsSec.length).toBe(5);
    expect(Object.keys(result.current.channels)).toContain("altitude");
  });

  it("re-renders on its interval so consumers see new samples", () => {
    let renders = 0;
    renderHook(() => {
      renders++;
      return useFlightRecord(200);
    });
    const before = renders;
    for (let i = 0; i < 5; i++) {
      act(() => {
        vi.advanceTimersByTime(200);
      });
    }
    expect(renders - before).toBe(5);
  });

  it("stops re-rendering after unmount", () => {
    let renders = 0;
    const { unmount } = renderHook(() => {
      renders++;
      return useFlightRecord(100);
    });
    unmount();
    const after = renders;
    vi.advanceTimersByTime(1000);
    expect(renders).toBe(after);
  });
});

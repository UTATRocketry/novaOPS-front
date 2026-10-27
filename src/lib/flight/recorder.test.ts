import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useNovaStore } from "../store";
import {
  CH_ACCEL,
  CH_ALTITUDE,
  clearFlightRecord,
  flightIndexAtOrAfter,
  getFlightSeries,
  sampleWindow,
  startFlightRecorder,
  stopFlightRecorder,
} from "./recorder";
import type { FlightTelemetry } from "./types";

const initial = useNovaStore.getInitialState();
const flight = (t: Partial<FlightTelemetry>) => t as FlightTelemetry;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  useNovaStore.setState(initial, true);
  clearFlightRecord();
});

afterEach(() => {
  stopFlightRecorder();
  clearFlightRecord();
  vi.useRealTimers();
});

describe("flight recorder", () => {
  it("samples at 10 Hz once started", () => {
    startFlightRecorder();
    vi.advanceTimersByTime(1000);
    expect(getFlightSeries().tsSec).toHaveLength(10);
  });

  it("does nothing until started, and stops when told to", () => {
    vi.advanceTimersByTime(1000);
    expect(getFlightSeries().tsSec).toHaveLength(0);
    startFlightRecorder();
    vi.advanceTimersByTime(300);
    stopFlightRecorder();
    vi.advanceTimersByTime(1000);
    expect(getFlightSeries().tsSec).toHaveLength(3);
  });

  it("is idempotent: a second start does not double the sample rate", () => {
    startFlightRecorder();
    startFlightRecorder();
    vi.advanceTimersByTime(1000);
    expect(getFlightSeries().tsSec).toHaveLength(10);
  });

  it("keeps its history across a stop and restart", () => {
    startFlightRecorder();
    vi.advanceTimersByTime(500);
    stopFlightRecorder();
    startFlightRecorder();
    vi.advanceTimersByTime(500);
    expect(getFlightSeries().tsSec).toHaveLength(10);
  });

  it("records NaN, never zero, for a channel with no data", () => {
    startFlightRecorder();
    vi.advanceTimersByTime(100);
    const { channels } = getFlightSeries();
    expect(channels.altitude).toHaveLength(1);
    for (const values of Object.values(channels)) expect(values[0]).toBeNaN();
  });

  it("records engineering values as received and ignores non-finite ones", () => {
    useNovaStore.getState().ingestFlightData(
      flight({ altitude: 120.5, pressure: Infinity, accel: { x: 1, y: 2, z: 3, magnitude: 3.7 } as never }),
    );
    startFlightRecorder();
    vi.advanceTimersByTime(100);
    const { channels } = getFlightSeries();
    expect(channels.altitude[0]).toBe(120.5);
    expect(channels.pressure[0]).toBeNaN();
    expect([channels.accelX[0], channels.accelY[0], channels.accelZ[0], channels.accelMag[0]]).toEqual([1, 2, 3, 3.7]);
  });

  it("derives velocity from consecutive telemetry frames", () => {
    startFlightRecorder();
    useNovaStore.getState().ingestFlightData(flight({ altitude: 0, timestamp: 1000 }));
    vi.advanceTimersByTime(100);
    useNovaStore.getState().ingestFlightData(flight({ altitude: 10, timestamp: 2000 }));
    vi.advanceTimersByTime(100);
    const { velocity } = getFlightSeries().channels;
    expect(velocity[0]).toBeNaN(); // one sample is not enough to differentiate
    expect(velocity[1]).toBe(10);
  });

  it("smooths later velocity samples with an EMA", () => {
    startFlightRecorder();
    const send = (altitude: number, timestamp: number) => {
      useNovaStore.getState().ingestFlightData(flight({ altitude, timestamp }));
      vi.advanceTimersByTime(100);
    };
    send(0, 1000);
    send(10, 2000); // 10 m/s
    send(30, 3000); // instantaneous 20 m/s -> 0.3*20 + 0.7*10 = 13
    expect(getFlightSeries().channels.velocity[2]).toBeCloseTo(13);
  });

  it("holds the last velocity when no new frame arrived", () => {
    startFlightRecorder();
    useNovaStore.getState().ingestFlightData(flight({ altitude: 0, timestamp: 1000 }));
    vi.advanceTimersByTime(100);
    useNovaStore.getState().ingestFlightData(flight({ altitude: 10, timestamp: 2000 }));
    vi.advanceTimersByTime(500);
    expect(getFlightSeries().channels.velocity.slice(1)).toEqual([10, 10, 10, 10, 10]);
  });

  it("ignores a gap longer than 2 s when estimating velocity", () => {
    startFlightRecorder();
    useNovaStore.getState().ingestFlightData(flight({ altitude: 0, timestamp: 1000 }));
    vi.advanceTimersByTime(100);
    useNovaStore.getState().ingestFlightData(flight({ altitude: 500, timestamp: 11000 }));
    vi.advanceTimersByTime(100);
    expect(getFlightSeries().channels.velocity[1]).toBeNaN();
  });

  it("drops the velocity estimate when altitude goes missing", () => {
    startFlightRecorder();
    useNovaStore.getState().ingestFlightData(flight({ altitude: 0, timestamp: 1000 }));
    vi.advanceTimersByTime(100);
    useNovaStore.getState().ingestFlightData(flight({ altitude: 10, timestamp: 2000 }));
    vi.advanceTimersByTime(100);
    useNovaStore.getState().ingestFlightData(flight({}));
    vi.advanceTimersByTime(100);
    expect(getFlightSeries().channels.velocity[2]).toBeNaN();
  });

  it("keeps only the newest 18,000 samples", () => {
    startFlightRecorder();
    vi.advanceTimersByTime(18_050 * 100);
    const { tsSec, channels } = getFlightSeries();
    expect(tsSec).toHaveLength(18_000);
    expect(channels.altitude).toHaveLength(18_000);
    expect(tsSec[0]).toBeLessThan(tsSec[17_999]);
  });

  it("clearFlightRecord empties every buffer and resets velocity", () => {
    startFlightRecorder();
    useNovaStore.getState().ingestFlightData(flight({ altitude: 0, timestamp: 1000 }));
    vi.advanceTimersByTime(300);
    clearFlightRecord();
    const { tsSec, channels } = getFlightSeries();
    expect(tsSec).toHaveLength(0);
    expect(Object.values(channels).every((c) => c.length === 0)).toBe(true);
  });
});

describe("sampleWindow", () => {
  function record(seconds: number) {
    startFlightRecorder();
    for (let i = 0; i < seconds * 10; i++) {
      useNovaStore.getState().ingestFlightData(flight({ altitude: i }));
      vi.advanceTimersByTime(100);
    }
  }

  it("returns the last N seconds, columns parallel to the channels asked for", () => {
    record(10);
    const { xs, ys } = sampleWindow([...CH_ALTITUDE, ...CH_ACCEL.slice(0, 1)], 3);
    expect(ys).toHaveLength(2);
    expect(ys[0]).toHaveLength(xs.length);
    expect(ys[1]).toHaveLength(xs.length);
    expect(xs.length).toBeGreaterThanOrEqual(30);
    expect(xs.length).toBeLessThanOrEqual(31);
    expect(xs[0]).toBeGreaterThanOrEqual(Date.now() / 1000 - 3);
  });

  it("returns everything when the window is longer than the record", () => {
    record(2);
    expect(sampleWindow(CH_ALTITUDE, 600).xs).toHaveLength(20);
  });

  it("clamps the start to launch time when given", () => {
    record(10);
    const launchMs = Date.now() - 2000;
    const { xs } = sampleWindow(CH_ALTITUDE, 600, launchMs);
    expect(xs[0]).toBeGreaterThanOrEqual(launchMs / 1000);
    expect(xs.length).toBeLessThan(25);
  });

  it("ignores a launch time older than the window", () => {
    record(10);
    const { xs } = sampleWindow(CH_ALTITUDE, 2, Date.now() - 600_000);
    expect(xs.length).toBeLessThanOrEqual(21);
  });

  it("is empty before anything has been recorded", () => {
    expect(sampleWindow(CH_ALTITUDE, 10)).toEqual({ xs: [], ys: [[]] });
  });

  it("returns copies, not the live buffers", () => {
    record(1);
    const { xs } = sampleWindow(CH_ALTITUDE, 10);
    expect(xs).not.toBe(getFlightSeries().tsSec);
  });
});

describe("flightIndexAtOrAfter", () => {
  it("finds the first sample at or after a time", () => {
    startFlightRecorder();
    vi.advanceTimersByTime(1000); // samples at 1000.1 ... 1001.0 s
    const { tsSec } = getFlightSeries();
    expect(flightIndexAtOrAfter(0)).toBe(0);
    expect(flightIndexAtOrAfter(tsSec[4])).toBe(4);
    expect(flightIndexAtOrAfter(tsSec[4] + 0.001)).toBe(5);
    expect(flightIndexAtOrAfter(1e12)).toBe(tsSec.length);
  });
});

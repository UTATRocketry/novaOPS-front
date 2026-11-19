import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ConditionAlert } from "@/lib/alerts";
import { useNovaStore } from "@/lib/store";
import { renderWithProviders } from "@/test/render";
import { AlertCenter } from "./AlertCenter";
import { AlertChips } from "./AlertChips";

const initial = useNovaStore.getInitialState();
const store = () => useNovaStore.getState();

const condition = (id: string, severity: ConditionAlert["severity"], over: Partial<ConditionAlert> = {}): ConditionAlert => ({
  id,
  severity,
  title: `${id} title`,
  source: "test",
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(10_000_000);
  useNovaStore.setState(initial, true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AlertChips", () => {
  it("shows an all-clear chip when there are no alerts", () => {
    renderWithProviders(<AlertChips />);
    expect(screen.getByRole("button", { name: "No active alerts" })).toBeInTheDocument();
    expect(screen.getByText("OK")).toBeInTheDocument();
  });

  it("shows one chip per severity that has alerts, with its count, and none for the rest", () => {
    act(() => store().reconcileConditionAlerts([condition("a", "warn"), condition("b", "warn"), condition("c", "fault")]));
    renderWithProviders(<AlertChips />);
    const button = screen.getByRole("button", { name: "3 active alerts" });
    expect(within(button).getByText("2")).toBeInTheDocument();
    expect(within(button).getByText("1")).toBeInTheDocument();
    expect(within(button).getAllByText(/^\d+$/)).toHaveLength(2);
    expect(within(button).queryByText("OK")).not.toBeInTheDocument();
  });

  it("orders the chips most severe first", () => {
    act(() =>
      store().reconcileConditionAlerts([condition("i", "info"), condition("w", "warn"), condition("f", "fault"), condition("e", "error"), condition("e2", "error")]),
    );
    renderWithProviders(<AlertChips />);
    const counts = within(screen.getByRole("button")).getAllByText(/^\d+$/).map((n) => n.textContent);
    expect(counts).toEqual(["1", "2", "1", "1"]); // fault, error(2), warn, info
  });

  it("says '1 active alert' in singular", () => {
    act(() => store().reconcileConditionAlerts([condition("a", "info")]));
    renderWithProviders(<AlertChips />);
    expect(screen.getByRole("button")).toHaveAttribute("title", "1 active alert");
  });

  it("updates live as alerts come and go", () => {
    renderWithProviders(<AlertChips />);
    act(() => store().reconcileConditionAlerts([condition("a", "fault")]));
    expect(screen.getByRole("button", { name: "1 active alerts" })).toBeInTheDocument();
    act(() => store().reconcileConditionAlerts([]));
    expect(screen.getByRole("button", { name: "No active alerts" })).toBeInTheDocument();
  });

  it("opens the alert center when clicked", () => {
    renderWithProviders(<AlertChips />);
    fireEvent.click(screen.getByRole("button"));
    expect(store().alertCenterOpen).toBe(true);
  });
});

describe("AlertCenter", () => {
  const open = () => act(() => store().setAlertCenterOpen(true));

  it("renders nothing while closed", () => {
    act(() => store().reconcileConditionAlerts([condition("a", "warn")]));
    renderWithProviders(<AlertCenter />);
    expect(screen.queryByText("a title")).not.toBeInTheDocument();
  });

  it("shows the empty state when open with no alerts", () => {
    open();
    renderWithProviders(<AlertCenter />);
    expect(screen.getByText("No active alerts")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Acknowledge all" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear events" })).not.toBeInTheDocument();
  });

  it("lists alerts most severe first, newest first within a severity", () => {
    vi.setSystemTime(1_000_000);
    act(() => store().reconcileConditionAlerts([condition("old-warn", "warn")]));
    vi.setSystemTime(2_000_000);
    act(() => store().reconcileConditionAlerts([condition("old-warn", "warn"), condition("new-warn", "warn"), condition("fault", "fault")]));
    open();
    renderWithProviders(<AlertCenter />);
    const titles = screen.getAllByText(/ title$/).map((n) => n.textContent);
    expect(titles).toEqual(["fault title", "new-warn title", "old-warn title"]);
  });

  it("shows the title, detail, source and age", () => {
    vi.setSystemTime(10_000_000 - 125_000);
    act(() => store().reconcileConditionAlerts([condition("a", "warn", { detail: "13.20 V low", source: "battery" })]));
    vi.setSystemTime(10_000_000);
    open();
    renderWithProviders(<AlertCenter />);
    expect(screen.getByText("a title")).toBeInTheDocument();
    expect(screen.getByText("13.20 V low")).toBeInTheDocument();
    expect(screen.getByText("battery · 2m ago")).toBeInTheDocument();
  });

  it.each([
    [5_000, "5s ago"],
    [59_000, "59s ago"],
    [60_000, "1m ago"],
    [3_599_000, "59m ago"],
    [3_600_000, "1h ago"],
    [7_300_000, "2h ago"],
  ])("shows an alert raised %d ms ago as '%s'", (age, text) => {
    vi.setSystemTime(10_000_000 - age);
    act(() => store().reconcileConditionAlerts([condition("a", "info", { source: "s" })]));
    vi.setSystemTime(10_000_000);
    open();
    renderWithProviders(<AlertCenter />);
    expect(screen.getByText(`s · ${text}`)).toBeInTheDocument();
  });

  it("acknowledges one alert, which then loses its Ack button and is marked", () => {
    act(() => store().reconcileConditionAlerts([condition("a", "warn")]));
    open();
    renderWithProviders(<AlertCenter />);
    fireEvent.click(screen.getByRole("button", { name: "Ack" }));
    expect(store().alerts[0].acknowledged).toBe(true);
    expect(screen.queryByRole("button", { name: "Ack" })).not.toBeInTheDocument();
    expect(screen.getByText(/ack'd/)).toBeInTheDocument();
  });

  it("acknowledges all", () => {
    act(() => store().reconcileConditionAlerts([condition("a", "warn"), condition("b", "fault")]));
    open();
    renderWithProviders(<AlertCenter />);
    fireEvent.click(screen.getByRole("button", { name: "Acknowledge all" }));
    expect(store().alerts.every((a) => a.acknowledged)).toBe(true);
    expect(screen.queryByRole("button", { name: "Acknowledge all" })).not.toBeInTheDocument();
  });

  it("lets an event alert be dismissed but not a condition alert", () => {
    act(() => {
      store().reconcileConditionAlerts([condition("cond", "warn")]);
      store().pushEventAlert({ id: "evt", severity: "error", title: "API down", source: "api" });
    });
    open();
    renderWithProviders(<AlertCenter />);
    expect(screen.getAllByRole("button", { name: "Dismiss" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(store().alerts.map((a) => a.id)).toEqual(["cond"]);
  });

  it("clears every event alert, leaving conditions", () => {
    act(() => {
      store().reconcileConditionAlerts([condition("cond", "warn")]);
      store().pushEventAlert({ severity: "error", title: "e1", source: "api" });
      store().pushEventAlert({ severity: "error", title: "e2", source: "api" });
    });
    open();
    renderWithProviders(<AlertCenter />);
    fireEvent.click(screen.getByRole("button", { name: "Clear events" }));
    expect(store().alerts.map((a) => a.id)).toEqual(["cond"]);
  });

  it("shows the alert count in the header", () => {
    act(() => store().reconcileConditionAlerts([condition("a", "warn"), condition("b", "info")]));
    open();
    renderWithProviders(<AlertCenter />);
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("closes from the Close button", () => {
    open();
    renderWithProviders(<AlertCenter />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(store().alertCenterOpen).toBe(false);
  });

  it("opens from the chips", async () => {
    renderWithProviders(
      <>
        <AlertChips />
        <AlertCenter />
      </>,
    );
    expect(screen.queryByText("Alerts")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "No active alerts" }));
    expect(await screen.findByText("Alerts")).toBeInTheDocument();
  });
});

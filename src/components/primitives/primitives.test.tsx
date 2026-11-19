import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "@/test/render";
import { Chip, Icon, KpiTile, Mono, STATUS_COLOR, StatusDot } from "./index";

describe("KpiTile", () => {
  it("shows the label, value and unit", () => {
    renderWithProviders(<KpiTile label="Altitude" value="120.5" unit="m" />);
    expect(screen.getByText("Altitude")).toBeInTheDocument();
    expect(screen.getByText("120.5")).toBeInTheDocument();
    expect(screen.getByText("m")).toBeInTheDocument();
  });

  it.each([undefined, null, ""])("shows a dash, and no unit, for the missing value %j", (value) => {
    renderWithProviders(<KpiTile label="Altitude" value={value} unit="m" />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("m")).not.toBeInTheDocument();
  });

  it("shows a real zero as a value, not as missing", () => {
    renderWithProviders(<KpiTile label="Velocity" value={0} unit="m/s" />);
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
    expect(screen.getByText("m/s")).toBeInTheDocument();
  });
});

describe("Chip", () => {
  it("renders its children", () => {
    renderWithProviders(<Chip status="nominal">NOMINAL</Chip>);
    expect(screen.getByText("NOMINAL")).toBeInTheDocument();
  });

  it("defaults to the neutral status", () => {
    renderWithProviders(<Chip>idle</Chip>);
    expect(screen.getByText("idle")).toBeInTheDocument();
  });
});

describe("StatusDot", () => {
  it("renders at the requested size", () => {
    const { container } = renderWithProviders(<StatusDot status="fault" size={12} />);
    const dot = container.querySelector("span");
    expect(dot).toBeInTheDocument();
    expect(getComputedStyle(dot as Element).width).toBe("12px");
  });
});

describe("Icon", () => {
  it("shows the ligature name and is hidden from assistive technology", () => {
    const { container } = renderWithProviders(<Icon name="rocket_launch" />);
    const icon = container.querySelector(".material-symbols-rounded");
    expect(icon).toHaveTextContent("rocket_launch");
    expect(icon).toHaveAttribute("aria-hidden", "true");
  });
});

describe("Mono", () => {
  it("renders inline text", () => {
    renderWithProviders(<Mono>PT1</Mono>);
    expect(screen.getByText("PT1").tagName).toBe("SPAN");
  });
});

describe("STATUS_COLOR", () => {
  it("covers every status", () => {
    expect(Object.keys(STATUS_COLOR).sort()).toEqual(["error", "fault", "info", "neutral", "nominal", "warn"]);
  });
});

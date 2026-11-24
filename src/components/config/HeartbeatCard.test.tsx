import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/test/render";
import { HeartbeatCard } from "./HeartbeatCard";

describe("HeartbeatCard", () => {
  it("shows the default as a placeholder when the config has no Heartbeat section", () => {
    renderWithProviders(<HeartbeatCard heartbeat={undefined} onChange={() => {}} />);
    expect(screen.getByPlaceholderText("2000")).toHaveValue(null);
  });

  it("sets and clears timeout_ms, removing the section when it's empty", () => {
    const onChange = vi.fn();
    const view = renderWithProviders(<HeartbeatCard heartbeat={undefined} onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText("2000"), { target: { value: "1500" } });
    expect(onChange).toHaveBeenLastCalledWith({ timeout_ms: 1500 });
    view.rerender(<HeartbeatCard heartbeat={{ timeout_ms: 1500 }} onChange={onChange} />);
    fireEvent.change(screen.getByDisplayValue("1500"), { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });
});

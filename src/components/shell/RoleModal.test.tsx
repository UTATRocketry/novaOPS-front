import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { assignRole } from "@/lib/api";
import { useNovaStore } from "@/lib/store";
import type { ClientRole } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { RoleModal } from "./RoleModal";

vi.mock("@/lib/api", () => ({ assignRole: vi.fn() }));

const initial = useNovaStore.getInitialState();

function connect(role: ClientRole | null, clientId: string | null = "c1") {
  useNovaStore.setState({ session: { clientId, role } });
}

function open(props: Partial<{ isOpen: boolean; onClose: () => void }> = {}) {
  const onClose = props.onClose ?? vi.fn();
  const view = renderWithProviders(<RoleModal isOpen={props.isOpen ?? true} onClose={onClose} />);
  return { ...view, onClose };
}

const select = () => screen.getByRole("combobox") as HTMLSelectElement;
const request = () => screen.getByRole("button", { name: "Request Role" });

beforeEach(() => {
  useNovaStore.setState(initial, true);
  vi.mocked(assignRole).mockReset().mockResolvedValue({ client_id: "c1", role: "operator" });
});

describe("RoleModal: display", () => {
  it("renders nothing when closed", () => {
    connect("viewer");
    open({ isOpen: false });
    expect(screen.queryByText("Change Session Role")).not.toBeInTheDocument();
  });

  it("shows the current role and starts on it", () => {
    connect("operator");
    open();
    expect(screen.getByText("OPERATOR")).toBeInTheDocument();
    expect(select().value).toBe("operator");
  });

  it("starts on viewer, with a dash for the current role, when there is no session", () => {
    connect(null, null);
    open();
    expect(select().value).toBe("viewer");
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("describes the selected role", () => {
    connect("viewer");
    open();
    expect(screen.getByText("Read-only access to all telemetry and views.")).toBeInTheDocument();
    fireEvent.change(select(), { target: { value: "operator" } });
    expect(screen.getByText(/Command valves/)).toBeInTheDocument();
  });

  it("offers the four roles", () => {
    connect("viewer");
    open();
    expect(Array.from(select().options).map((o) => o.value)).toEqual(["viewer", "pad", "operator", "admin"]);
  });
});

describe("RoleModal: connection", () => {
  it("says it is not connected and cannot submit", () => {
    connect(null, null);
    open();
    expect(screen.getByText("Not connected.")).toBeInTheDocument();
    expect(request()).toBeDisabled();
  });

  it("sends nothing without a client id", () => {
    connect(null, null);
    open();
    fireEvent.click(request());
    expect(assignRole).not.toHaveBeenCalled();
  });
});

describe("RoleModal: requesting a role", () => {
  it("requests a non-admin role with no password and the client id, then closes", async () => {
    connect("viewer");
    const { onClose } = open();
    fireEvent.change(select(), { target: { value: "operator" } });
    fireEvent.click(request());
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(assignRole).toHaveBeenCalledWith({ role: "operator", password: undefined }, "c1");
  });

  it("shows a password box only for admin", () => {
    connect("viewer");
    open();
    expect(screen.queryByPlaceholderText("Enter admin password")).not.toBeInTheDocument();
    fireEvent.change(select(), { target: { value: "admin" } });
    expect(screen.getByPlaceholderText("Enter admin password")).toHaveAttribute("type", "password");
  });

  it("sends the typed password for admin", async () => {
    connect("viewer");
    const { onClose } = open();
    fireEvent.change(select(), { target: { value: "admin" } });
    await userEvent.type(screen.getByPlaceholderText("Enter admin password"), "s3cret");
    fireEvent.click(request());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(assignRole).toHaveBeenCalledWith({ role: "admin", password: "s3cret" }, "c1");
  });

  it("never sends a password typed for admin once another role is chosen", async () => {
    connect("viewer");
    const { onClose } = open();
    fireEvent.change(select(), { target: { value: "admin" } });
    await userEvent.type(screen.getByPlaceholderText("Enter admin password"), "s3cret");
    fireEvent.change(select(), { target: { value: "operator" } });
    fireEvent.click(request());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(assignRole).toHaveBeenCalledWith({ role: "operator", password: undefined }, "c1");
    expect(JSON.stringify(vi.mocked(assignRole).mock.calls)).not.toContain("s3cret");
  });

  it("forgets the password after switching away from admin and back", async () => {
    connect("viewer");
    open();
    fireEvent.change(select(), { target: { value: "admin" } });
    await userEvent.type(screen.getByPlaceholderText("Enter admin password"), "s3cret");
    fireEvent.change(select(), { target: { value: "pad" } });
    fireEvent.change(select(), { target: { value: "admin" } });
    expect(screen.getByPlaceholderText("Enter admin password")).toHaveValue("");
  });

  it("is disabled and shows progress while the request is in flight", async () => {
    connect("viewer");
    vi.mocked(assignRole).mockReturnValue(new Promise(() => {}));
    open();
    fireEvent.change(select(), { target: { value: "operator" } });
    fireEvent.click(request());
    // Chakra swaps the label for a spinner while loading, so find it by state.
    await waitFor(() => expect(document.querySelector("button[data-loading]")).toBeDisabled());
    expect(assignRole).toHaveBeenCalledTimes(1);
  });
});

describe("RoleModal: rejection", () => {
  it("shows the backend's message and stays open for a refused role", async () => {
    connect("viewer");
    vi.mocked(assignRole).mockRejectedValue(new Error("Role pad already taken"));
    const { onClose } = open();
    fireEvent.change(select(), { target: { value: "pad" } });
    fireEvent.click(request());
    expect(await screen.findByText("Role pad already taken")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows a wrong admin password under the password box and keeps the dialog open", async () => {
    connect("viewer");
    vi.mocked(assignRole).mockRejectedValue(new Error("Invalid admin password"));
    const { onClose } = open();
    fireEvent.change(select(), { target: { value: "admin" } });
    await userEvent.type(screen.getByPlaceholderText("Enter admin password"), "wrong");
    fireEvent.click(request());
    expect(await screen.findByText("Invalid admin password")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getAllByText("Invalid admin password")).toHaveLength(1);
  });

  it("clears the error when the operator edits the password or changes role", async () => {
    connect("viewer");
    vi.mocked(assignRole).mockRejectedValue(new Error("Invalid admin password"));
    open();
    fireEvent.change(select(), { target: { value: "admin" } });
    await userEvent.type(screen.getByPlaceholderText("Enter admin password"), "x");
    fireEvent.click(request());
    await screen.findByText("Invalid admin password");
    await userEvent.type(screen.getByPlaceholderText("Enter admin password"), "y");
    expect(screen.queryByText("Invalid admin password")).not.toBeInTheDocument();
  });

  it("uses a generic message for an error that is not an Error", async () => {
    connect("viewer");
    vi.mocked(assignRole).mockRejectedValue("nope");
    open();
    fireEvent.change(select(), { target: { value: "operator" } });
    fireEvent.click(request());
    expect(await screen.findByText("An unexpected error occurred.")).toBeInTheDocument();
  });
});

describe("RoleModal: closing", () => {
  it("Cancel closes without sending anything", () => {
    connect("viewer");
    const { onClose } = open();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(assignRole).not.toHaveBeenCalled();
  });

  it("the close button closes", async () => {
    connect("viewer");
    const { onClose } = open();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Close role modal" }));
    });
    expect(onClose).toHaveBeenCalled();
  });
});

// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ActionEditorDrawer from "../ActionEditorDrawer";
import type { PlannerActionRecord } from "@planner/data/actionRepository";

class PlannerConflictError extends Error { constructor(_entityId?: string) { super("This record changed after you opened it."); this.name = "PlannerConflictError"; } }

const action: PlannerActionRecord = {
  id: "action-1", project_id: "project-1", title: "Coordinate embeds", priority: "High", status: "Open", archived_at: null,
  project_name: "BIMC ED", description: null, workstream: null, assigned_user_id: null, assigned_to: null, waiting_on: null,
  source_entity_type: null, source_entity_id: null, completed_at: null, created_at: "2026-08-02T12:00:00Z",
  action_date: "2026-08-02", due_date: "2026-08-03", follow_up_date: null, impact_date: null, updated_at: "2026-08-02T12:00:00Z",
};

describe("ActionEditorDrawer", () => {
  it("requires confirmation before a required-date mutation", async () => {
    const save = vi.fn();
    render(<ActionEditorDrawer action={action} isOpen onClose={vi.fn()} onSave={save} onArchive={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Required date"), { target: { value: "2026-08-05" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(save).not.toHaveBeenCalled();
    expect(screen.getByText("Confirm required-date change")).toBeInTheDocument();
    expect(screen.getByText("2026-08-03")).toBeInTheDocument();
    expect(screen.getByText("2026-08-05")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm change" }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ due_date: "2026-08-05" }), "2026-08-02T12:00:00Z");
  });

  it("renders the server and proposed values after a conflict and requires reconfirmation", async () => {
    const freshAction = { ...action, due_date: "2026-08-04", workstream: "Concurrent server update", updated_at: "2026-08-04T12:00:00Z" };
    const save = vi.fn().mockRejectedValueOnce(new PlannerConflictError("action-1")).mockResolvedValueOnce({ ...freshAction, due_date: "2026-08-05" });
    const fetchCurrentAction = vi.fn(async () => freshAction);
    render(<ActionEditorDrawer action={action} isOpen onClose={vi.fn()} onSave={save} onArchive={vi.fn()} onFetchCurrentAction={fetchCurrentAction} />);

    fireEvent.change(screen.getByLabelText("Required date"), { target: { value: "2026-08-05" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm change" }));

    expect(await screen.findByText("This record changed on the server.")).toBeInTheDocument();
    expect(fetchCurrentAction).toHaveBeenCalledWith("project-1", "action-1");
    expect(screen.getByText("Server/current value: 2026-08-04")).toBeInTheDocument();
    expect(screen.getByText("Your proposed value: 2026-08-05")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again with confirmation" }));
    expect(screen.getByText("Confirm required-date change")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm change" }));
    expect(save).toHaveBeenLastCalledWith({ due_date: "2026-08-05" }, "2026-08-04T12:00:00Z");
    expect(save.mock.calls[1][0]).not.toHaveProperty("workstream");
  });

  it("retries archive after a conflict using the fresh version without saving", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const freshAction = { ...action, status: "In Progress", updated_at: "2026-08-04T12:00:00Z" };
    const onSave = vi.fn();
    const onArchive = vi.fn().mockRejectedValueOnce(new PlannerConflictError("action-1")).mockResolvedValueOnce({ ...freshAction, archived_at: "2026-08-05T00:00:00Z" });
    render(<ActionEditorDrawer action={action} isOpen onClose={vi.fn()} onSave={onSave} onArchive={onArchive} onFetchCurrentAction={vi.fn(async () => freshAction)} />);

    fireEvent.click(screen.getByRole("button", { name: "Archive action" }));
    expect(await screen.findByText("This record changed on the server.")).toBeInTheDocument();
    expect(screen.getByText("Server/current value: In Progress")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry archive" }));

    expect(onSave).not.toHaveBeenCalled();
    expect(onArchive).toHaveBeenLastCalledWith("2026-08-04T12:00:00Z");
    vi.restoreAllMocks();
  });

  it("rebases untouched server date and owner fields without prompting during a title-only retry", async () => {
    const freshAction = { ...action, title: "Server title", due_date: "2026-08-08", assigned_user_id: "server-owner", updated_at: "2026-08-08T12:00:00Z" };
    const save = vi.fn().mockRejectedValueOnce(new PlannerConflictError("action-1")).mockResolvedValueOnce({ ...freshAction, title: "User title" });
    render(<ActionEditorDrawer action={action} isOpen onClose={vi.fn()} onSave={save} onArchive={vi.fn()} onFetchCurrentAction={vi.fn(async () => freshAction)} />);

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "User title" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("This record changed on the server.")).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("User title");
    expect(screen.getByLabelText("Required date")).toHaveValue("2026-08-08");
    expect(screen.getByLabelText("Owner")).toHaveValue("server-owner");

    fireEvent.click(screen.getByRole("button", { name: "Try again with confirmation" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await waitFor(() => expect(save).toHaveBeenLastCalledWith({ title: "User title" }, "2026-08-08T12:00:00Z"));
  });

  it("places focus in the drawer, traps Tab, and restores the opener after Escape", () => {
    const opener = document.createElement("button");
    opener.textContent = "Open editor";
    document.body.append(opener);
    opener.focus();
    const onClose = vi.fn();
    render(<ActionEditorDrawer action={action} isOpen onClose={onClose} onSave={vi.fn()} onArchive={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("button", { name: "Close" }), { key: "Tab", shiftKey: true });
    expect(screen.getByRole("button", { name: "Archive action" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it("portals date confirmation outside the drawer and restores focus when cancelled", () => {
    render(<ActionEditorDrawer action={action} isOpen onClose={vi.fn()} onSave={vi.fn()} onArchive={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Required date"), { target: { value: "2026-08-05" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    const confirmation = screen.getByRole("alertdialog");
    expect(confirmation.parentElement).toBe(document.body);
    expect(screen.getByRole("dialog", { hidden: true })).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("button", { name: "Confirm change" })).toHaveFocus();
    fireEvent.keyDown(confirmation, { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toHaveFocus();
  });
});

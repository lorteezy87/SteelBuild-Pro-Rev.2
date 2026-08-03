// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import NewTaskDialog from "../NewTaskDialog";

const projects = [{ id: "project-1", name: "BIMC ED" }];

describe("NewTaskDialog", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("requires a record kind before rendering the operational action fields", () => {
    render(<NewTaskDialog isOpen projects={projects} onClose={vi.fn()} onCreateAction={vi.fn()} onCreateScheduleActivity={vi.fn()} />);

    expect(screen.getByText("Choose a record kind to begin.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Record kind"), { target: { value: "action" } });

    for (const label of ["Project", "Title", "Priority", "Status", "Workstream", "Action date", "Follow-up date", "Required date", "Impact date", "Owner", "Waiting on", "Source type", "Source ID"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it("renders schedule fields for a schedule activity and blocks submission offline", () => {
    vi.stubGlobal("navigator", { onLine: false });
    const createScheduleActivity = vi.fn();
    render(<NewTaskDialog isOpen projects={projects} onClose={vi.fn()} onCreateAction={vi.fn()} onCreateScheduleActivity={createScheduleActivity} />);

    fireEvent.change(screen.getByLabelText("Record kind"), { target: { value: "schedule" } });
    for (const label of ["Project", "Task name", "Phase", "Start date", "End date", "Schedule status", "Percent complete"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Create schedule activity" })).toBeDisabled();
    expect(screen.getByText("Creating Planner records requires an online connection.")).toBeInTheDocument();
    expect(createScheduleActivity).not.toHaveBeenCalled();
  });

  it("places focus in the dialog and restores its opener after Escape", () => {
    const opener = document.createElement("button");
    opener.textContent = "Open new task";
    document.body.append(opener);
    opener.focus();
    const onClose = vi.fn();
    render(<NewTaskDialog isOpen projects={projects} onClose={onClose} onCreateAction={vi.fn()} onCreateScheduleActivity={vi.fn()} />);

    expect(screen.getByLabelText("Record kind")).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    expect(opener).toHaveFocus();
    opener.remove();
  });
});

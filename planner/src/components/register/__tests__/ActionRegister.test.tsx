// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PlannerAction, PlannerActionFilters } from "@planner/data/plannerTypes";
import ActionRegister from "../ActionRegister";

const filters: PlannerActionFilters = { search: "" };

const actions: PlannerAction[] = [
  {
    id: "critical-action",
    project_id: "project-1",
    project_name: "26179 – BIMC ED",
    title: "Resolve released drawing conflict",
    priority: "Critical",
    status: "Open",
    archived_at: null,
    workstream: "Detailing",
    action_date: "2026-08-02",
    follow_up_date: "2026-08-03",
    due_date: "2026-08-04",
    impact_date: "2026-08-05",
    waiting_on: "Structural engineer",
  },
  {
    id: "high-action",
    project_id: "project-2",
    project_name: "25443 – ALA AJ Seminary Bldg.",
    title: "Confirm delivery sequence",
    priority: "High",
    status: "In Progress",
    archived_at: null,
    workstream: "Delivery",
    action_date: "2026-08-03",
    follow_up_date: null,
    due_date: "2026-08-06",
    impact_date: "2026-08-07",
    waiting_on: "Shop",
  },
  {
    id: "archived-action",
    project_id: "project-3",
    project_name: "25531 – Skyport at Redfield",
    title: "Archive completed coordination item",
    priority: "Normal",
    status: "Closed",
    archived_at: "2026-08-01T12:00:00Z",
    workstream: "Coordination",
    action_date: "2026-08-01",
    follow_up_date: null,
    due_date: "2026-08-01",
    impact_date: "2026-08-01",
    waiting_on: null,
  },
];

describe("ActionRegister", () => {
  it("renders the stable register headers, priority text, and accessible selection controls", () => {
    const onSelectedActionIdsChange = vi.fn();

    render(
      <ActionRegister
        actions={actions}
        filters={filters}
        selectedActionIds={["critical-action"]}
        onSelectedActionIdsChange={onSelectedActionIdsChange}
        onFiltersChange={vi.fn()}
        onCompleteSelected={vi.fn()}
        onNewAction={vi.fn()}
        onExport={vi.fn()}
      />,
    );

    for (const header of [
      "Priority",
      "Project",
      "Action",
      "Workstream",
      "Action Date",
      "Follow-Up",
      "Required",
      "Impact",
      "Waiting On",
      "Status",
    ]) {
      expect(screen.getByRole("columnheader", { name: header })).toHaveAttribute("data-sticky", "true");
    }

    expect(screen.getByText("Critical")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("Normal")).toBeInTheDocument();
    expect(screen.getByText("1 selected")).toBeInTheDocument();

    const criticalCheckbox = screen.getByRole("checkbox", {
      name: "Select Resolve released drawing conflict",
    });
    expect(criticalCheckbox).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Select Confirm delivery sequence" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select Archive completed coordination item" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "Select Confirm delivery sequence" }));
    expect(onSelectedActionIdsChange).toHaveBeenCalledWith(["critical-action", "high-action"]);
  });

  it("prevents bulk completion when an archived or terminal action is selected", () => {
    render(
      <ActionRegister
        actions={actions}
        filters={filters}
        selectedActionIds={["archived-action"]}
        onSelectedActionIdsChange={vi.fn()}
        onFiltersChange={vi.fn()}
        onCompleteSelected={vi.fn()}
        onNewAction={vi.fn()}
        onExport={vi.fn()}
      />,
    );

    expect(screen.getByText("1 selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Complete Selected" })).toBeDisabled();
  });
});

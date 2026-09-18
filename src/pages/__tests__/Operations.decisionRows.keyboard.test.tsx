// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ScheduleCommandCenter from "../schedule/ScheduleCommandCenter";
import FieldHubControlCenter from "../fieldHub/FieldHubControlCenter";

afterEach(cleanup);

function panel(title: string) {
  const section = screen.getByRole("heading", { name: title }).closest("section");
  if (!section) throw new Error(`Missing panel ${title}`);
  return within(section);
}

it("opens schedule lookahead, milestone, and risk rows with Enter and Space", async () => {
  const user = userEvent.setup();
  const nextDay = new Date();
  nextDay.setDate(nextDay.getDate() + 1);
  const task = { id: "task-1", task_name: "Release columns", start_date: nextDay.toISOString().slice(0, 10), milestone: true, priority: "Critical" };
  const onOpenTask = vi.fn();
  render(<ScheduleCommandCenter projectName="Test" tasks={[task]} onOpenTask={onOpenTask}
    onAddTask={vi.fn()} onBulkAdd={vi.fn()} onWbsBuilder={vi.fn()} onImportMpp={vi.fn()} onImportCsv={vi.fn()}
    importing={false} onExportIcs={vi.fn()} onExportPdf={vi.fn()} exportingPdf={false} projectAvailable hasTasks view="gantt"
  ><div>Schedule body</div></ScheduleCommandCenter>);
  for (const title of ["14-Day Lookahead", "Milestones", "Schedule Attention"]) {
    const row = panel(title).getByRole("button", { name: /Release columns/ });
    if (title === "Schedule Attention") {
      row.focus();
      expect(row).toHaveFocus();
    } else {
      expect(row).toHaveAttribute("tabindex", "0");
      panel(title).getByRole("button", { name: /View all|View schedule/ }).focus();
      await user.tab();
      expect(row).toHaveFocus();
    }
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onOpenTask).toHaveBeenLastCalledWith(task);
  }
  expect(onOpenTask).toHaveBeenCalledTimes(6);
});

it("opens punchlist, inspection, and safety rows with Enter and Space", async () => {
  const user = userEvent.setup();
  const onOpenPunchlist = vi.fn();
  const onOpenInspection = vi.fn();
  const onOpenIncident = vi.fn();
  render(<FieldHubControlCenter projectName="Test" logs={[]} search="" onSearch={vi.fn()}
    typeFilter="All" onTypeFilterChange={vi.fn()} phaseFilter="All" onPhaseFilterChange={vi.fn()} onLogActivity={vi.fn()}
    punchlistItems={[{ id: "punch-1", description: "Repair connection", status: "Open" }]}
    inspections={[{ id: "inspection-1", inspection_type: "Weld inspection", status: "Scheduled" }]}
    incidents={[{ id: "safety-1", incident_type: "Open safety observation", status: "Open" }]}
    onOpenPunchlist={onOpenPunchlist} onOpenInspection={onOpenInspection} onOpenIncident={onOpenIncident}
  />);
  for (const [title, name, callback, id] of [
    ["Open Field Issues", "Repair connection", onOpenPunchlist, "punch-1"],
    ["Active Inspections", "Weld inspection", onOpenInspection, "inspection-1"],
    ["Site Coordination", "Open safety observation", onOpenIncident, "safety-1"],
  ] as const) {
    const row = panel(title).getByRole("button", { name: new RegExp(name) });
    expect(row).toHaveAttribute("tabindex", "0");
    panel(title).getByRole("button", { name: "View all" }).focus();
    await user.tab();
    expect(row).toHaveFocus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenLastCalledWith(id);
  }
});

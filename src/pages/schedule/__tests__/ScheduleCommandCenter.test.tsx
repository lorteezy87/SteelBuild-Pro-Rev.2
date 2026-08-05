// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ScheduleCommandCenter from "../ScheduleCommandCenter";

/**
 * Regression guard: the canonical Schedule shell exposes the operational
 * actions that were previously only available in the classic header while
 * leaving the ScheduleBody responsible for phase and view controls.
 */
function renderCC(props: Record<string, unknown> = {}) {
  return render(
    <ScheduleCommandCenter
      projectName="Test Project"
      tasks={[]}
      onAddTask={() => {}}
      onBulkAdd={() => {}}
      onWbsBuilder={() => {}}
      onImportMpp={() => {}}
      importing={false}
      onExportIcs={() => {}}
      onExportPdf={() => {}}
      exportingPdf={false}
      projectAvailable
      hasTasks
      view="gantt"
      onOpenTask={() => {}}
      {...props}
    >
      <div data-testid="schedule-body">body</div>
    </ScheduleCommandCenter>,
  );
}

describe("ScheduleCommandCenter — Bulk Add + WBS Builder discoverability", () => {
  it("renders the Bulk Add and WBS Builder buttons and fires their handlers", () => {
    const onBulkAdd = vi.fn();
    const onWbsBuilder = vi.fn();
    renderCC({ onBulkAdd, onWbsBuilder });

    const bulk = screen.getByRole("button", { name: /bulk add/i });
    const wbs = screen.getByRole("button", { name: /wbs builder/i });
    expect(bulk).toBeInTheDocument();
    expect(wbs).toBeInTheDocument();

    fireEvent.click(bulk);
    fireEvent.click(wbs);
    expect(onBulkAdd).toHaveBeenCalledTimes(1);
    expect(onWbsBuilder).toHaveBeenCalledTimes(1);
  });

  it("keeps the primary Add Task action regardless", () => {
    const onAddTask = vi.fn();
    renderCC({ onAddTask });
    const add = screen.getByRole("button", { name: /add task/i });
    fireEvent.click(add);
    expect(onAddTask).toHaveBeenCalledTimes(1);
  });

  it("promotes import and export actions into the canonical shell", () => {
    const onImportMpp = vi.fn();
    const onExportIcs = vi.fn();
    const onExportPdf = vi.fn();
    renderCC({ onImportMpp, onExportIcs, onExportPdf });

    fireEvent.click(screen.getByRole("button", { name: /import ms project/i }));
    fireEvent.click(screen.getByRole("button", { name: /export ics/i }));
    fireEvent.click(screen.getByRole("button", { name: /export pdf/i }));

    expect(onImportMpp).toHaveBeenCalledTimes(1);
    expect(onExportIcs).toHaveBeenCalledTimes(1);
    expect(onExportPdf).toHaveBeenCalledTimes(1);
  });

  it("does not duplicate search or phase controls owned by ScheduleBody", () => {
    renderCC();
    expect(screen.queryByPlaceholderText(/search tasks/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /all phases/i })).toBeNull();
  });

  it("uses a stable body ref for decision-panel View All", () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });

    renderCC();
    fireEvent.click(screen.getAllByRole("button", { name: /view all/i })[0]);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });
});

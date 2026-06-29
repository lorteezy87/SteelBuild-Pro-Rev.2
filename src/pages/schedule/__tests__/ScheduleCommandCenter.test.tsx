// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ScheduleCommandCenter from "../ScheduleCommandCenter";

/**
 * Regression guard: the live command_ui path renders the Schedule via
 * ScheduleCommandCenter, and Bulk Add + WBS Builder were unreachable there
 * because the header exposed no triggers for them (only Add Task). These assert
 * the secondary action buttons render and fire when their handlers are passed,
 * and stay hidden when they aren't (backward compatible for other callers).
 */
function renderCC(props: Record<string, unknown> = {}) {
  return render(
    <ScheduleCommandCenter
      projectName="Test Project"
      tasks={[]}
      search=""
      onSearch={() => {}}
      phaseFilter="all"
      onPhaseFilter={() => {}}
      onAddTask={() => {}}
      onOpenTask={() => {}}
      {...props}
    >
      <div>body</div>
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

  it("hides the secondary buttons when no handlers are passed (backward compatible)", () => {
    renderCC();
    expect(screen.queryByRole("button", { name: /bulk add/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /wbs builder/i })).toBeNull();
  });
});

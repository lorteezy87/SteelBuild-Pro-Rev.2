// @vitest-environment jsdom

import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlannerAction } from "@planner/data/plannerTypes";

vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/components/shared/ProjectContext", () => ({ ProjectContext: null }));
vi.mock("@/components/shared/OrgContext", () => ({ useOrg: () => ({ currentOrg: null }) }));

import { useTaskRegisterMetricActions } from "../TaskRegisterPage";

const actions: PlannerAction[] = [{
  id: "action-1",
  project_id: "project-1",
  status: "Open",
  priority: "High",
  archived_at: null,
  title: "Release embeds",
  due_date: "2026-08-02",
}];

function TaskRegisterMetricView() {
  const rows = useTaskRegisterMetricActions(actions, "due-today", { timezone: "America/Phoenix" });
  return <output>{rows.map((action) => action.id).join(",") || "none"}</output>;
}

describe("Task Register metric clock", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("recomputes filtered metric rows at the org-local date rollover and clears the timer", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-03T06:59:30.000Z"));
    const clearIntervalSpy = vi.spyOn(window, "clearInterval");

    const { unmount } = render(<TaskRegisterMetricView />);

    expect(screen.getByRole("status", { hidden: true })).toHaveTextContent("action-1");
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(screen.getByRole("status", { hidden: true })).toHaveTextContent("none");

    unmount();
    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });
});

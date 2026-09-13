// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useScheduleCommandSummary } from "../useScheduleCommandSummary";
import type { ScheduleSummary, TaskRecord } from "../scheduleCommandCenter.derive";

const SUMMARY: ScheduleSummary = {
  total: 1,
  critical: 0,
  activities: 1,
  atRisk: 0,
  overdue: 0,
  inLookahead: 0,
  pctComplete: 0,
  pctCompleteCoverage: { weighted: 0, total: 1 },
  tbd: 1,
  milestones: 0,
  lookaheadQueue: [],
  milestoneQueue: [],
  riskQueue: [],
};

describe("useScheduleCommandSummary", () => {
  it("memoizes by the same tasks and summary inputs used by the shell", () => {
    const tasks: TaskRecord[] = [{ id: "task-1", start_date: null, end_date: null }];
    const { result, rerender } = renderHook(
      ({ currentTasks, summary }: {
        currentTasks: TaskRecord[];
        summary?: ScheduleSummary;
      }) => useScheduleCommandSummary(currentTasks, summary),
      { initialProps: { currentTasks: tasks, summary: undefined } },
    );
    const initial = result.current;

    rerender({ currentTasks: tasks, summary: undefined });
    expect(result.current).toBe(initial);

    const replacementTasks = [...tasks];
    rerender({ currentTasks: replacementTasks, summary: undefined });
    expect(result.current).not.toBe(initial);

    rerender({ currentTasks: replacementTasks, summary: SUMMARY });
    expect(result.current).toBe(SUMMARY);
  });
});

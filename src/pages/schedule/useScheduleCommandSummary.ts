import { useMemo } from "react";
import { buildScheduleSummary } from "./scheduleCommandCenter.derive";
import type { ScheduleSummary, TaskRecord } from "./scheduleCommandCenter.derive";

export function useScheduleCommandSummary(
  tasks: TaskRecord[],
  summary: ScheduleSummary | undefined,
): ScheduleSummary {
  return useMemo(
    () => (summary ? summary : buildScheduleSummary(tasks)),
    [tasks, summary],
  );
}

import { describe, expect, it, vi } from "vitest";
import {
  captureDayFromTimestamp,
  persistScheduleProgress,
  type ScheduleProgressTask,
  type ScheduleTaskProgressGateway,
} from "../progressSync";

function gatewayFor(current: ScheduleProgressTask) {
  const get = vi.fn(async () => ({ ...current }));
  const update = vi.fn(async (_id: string, patch: Record<string, unknown>) => patch);
  return { gateway: { get, update } satisfies ScheduleTaskProgressGateway, get, update };
}

describe("persistScheduleProgress", () => {
  it("derives actuals from the current server row, not a rendered snapshot", async () => {
    const { gateway, get, update } = gatewayFor({
      id: "task-1",
      status: "In Progress",
      percent_complete: 50,
      actual_start_date: "2026-06-10",
      actual_finish_date: null,
    });

    await persistScheduleProgress({
      gateway,
      id: "task-1",
      pct: 100,
      capturedDay: "2026-06-12",
    });

    expect(get).toHaveBeenCalledWith("task-1");
    expect(update).toHaveBeenCalledWith("task-1", {
      percent_complete: 100,
      status: "Complete",
      actual_finish_date: "2026-06-12",
    });
  });

  it("does not overwrite actuals another client already recorded", async () => {
    const { gateway, update } = gatewayFor({
      id: "task-1",
      status: "Complete",
      percent_complete: 100,
      actual_start_date: "2026-06-09",
      actual_finish_date: "2026-06-11",
    });

    await persistScheduleProgress({
      gateway,
      id: "task-1",
      pct: 100,
      capturedDay: "2026-06-12",
    });

    expect(update).toHaveBeenCalledWith("task-1", {
      percent_complete: 100,
      status: "Complete",
    });
  });
});

describe("captureDayFromTimestamp", () => {
  it("converts legacy epoch values through local calendar semantics", () => {
    const stamp = new Date(2026, 5, 12, 23, 30, 0).getTime();
    expect(captureDayFromTimestamp(stamp)).toBe("2026-06-12");
  });

  it("returns undefined for missing or malformed legacy timestamps", () => {
    expect(captureDayFromTimestamp(undefined)).toBeUndefined();
    expect(captureDayFromTimestamp("not-a-number")).toBeUndefined();
  });
});

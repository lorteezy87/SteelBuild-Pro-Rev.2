// @vitest-environment jsdom
// jsdom for renderHook — these tests run the real useScheduleMutations.

import { createElement } from "react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { todayLocalISO } from "@/lib/dateMath";
import { SCHEDULE_STATUSES } from "@/lib/schedule/taskStatus";
import { getQueryKey } from "@/services/cacheRegistry";
import { useScheduleMutations, type UseScheduleMutationsParams } from "../useScheduleMutations";
import type { ScheduleTask } from "../types";

/**
 * Behavioural cover for the schedule task write paths.
 *
 * The earlier cover (actualsWiring / scheduleBodySaveGuard) regex-matched the
 * source of useScheduleMutations. It passed while the bulk toolbar sent
 * `percent_complete: undefined` for a reopen — the payload was wrong, the text
 * it looked for was still there. These tests call the real hook and assert on
 * the payload that reaches `entities.ScheduleTask.update`, checked against the
 * database's own constraint.
 */

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/api/supabaseClient", () => ({
  entities: { ScheduleTask: { update: mocks.update } },
}));
vi.mock("sonner", () => ({
  toast: {
    success: mocks.toastSuccess,
    warning: mocks.toastWarning,
    error: mocks.toastError,
    info: vi.fn(),
    loading: vi.fn(),
  },
}));

type Row = Record<string, unknown>;

/**
 * The row the database would hold after an UPDATE. `cleanRecord` drops
 * undefined keys before the request is built, so an undefined value leaves the
 * stored column as it was — which is exactly how `status` alone gets validated
 * against the percent already stored.
 */
function afterUpdate(stored: Row, patch: Row): Row {
  const row = { ...stored };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) row[key] = value;
  }
  return row;
}

/** schedule_status_pct_consistency, as written in the baseline migration. */
function passesPctConsistency(row: Row): boolean {
  const pct = row.percent_complete;
  if (pct === null || pct === undefined) return true;
  const n = Number(pct);
  switch (row.status) {
    case "Complete":
      return n === 100;
    case "Not Started":
      return n === 0;
    case "In Progress":
      return n < 100;
    default:
      return true;
  }
}

/** A stored row, as the page's scheduleTasks holds it. */
type StoredTask = {
  id: string; project_id: string; task_name: string; status: string;
  percent_complete: number | null;
  actual_start_date: string | null; actual_finish_date: string | null;
};

const DONE: StoredTask = {
  id: "t-done", project_id: "p1", task_name: "Erect bay 1",
  status: "Complete", percent_complete: 100,
  actual_start_date: "2026-08-01", actual_finish_date: "2026-08-20",
};
const MID: StoredTask = {
  id: "t-mid", project_id: "p1", task_name: "Fabricate columns",
  status: "In Progress", percent_complete: 40,
  actual_start_date: "2026-08-15", actual_finish_date: null,
};
/** Underway, but nobody recorded when it started. */
const UNRECORDED: StoredTask = {
  id: "t-unrecorded", project_id: "p1", task_name: "Ship sequence 2",
  status: "In Progress", percent_complete: 30,
  actual_start_date: null, actual_finish_date: null,
};
const FRESH: StoredTask = {
  id: "t-fresh", project_id: "p1", task_name: "Detail stairs",
  status: "Not Started", percent_complete: 0,
  actual_start_date: null, actual_finish_date: null,
};
/** Progress unknown — the NULL a reopen leaves behind. */
const HELD: StoredTask = {
  id: "t-held", project_id: "p1", task_name: "Canopy steel",
  status: "On Hold", percent_complete: null,
  actual_start_date: null, actual_finish_date: null,
};
const STORED: StoredTask[] = [DONE, MID, UNRECORDED, FRESH, HELD];

function renderMutations(scheduleTasks: StoredTask[] = STORED) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const params: UseScheduleMutationsParams = {
    projectId: "p1",
    qc,
    scheduleTasks: scheduleTasks as unknown as ScheduleTask[],
    enrichedTasks: scheduleTasks as unknown as ScheduleTask[],
    tasksWithEffective: scheduleTasks as unknown as ScheduleTask[],
    selectedProject: null,
    selectedTask: null,
    selectedIds: new Set(),
    setSelectedTask: vi.fn(),
    setSelectedIds: vi.fn(),
    setShowDrawer: vi.fn(),
    setShowBulkAdd: vi.fn(),
    setShowBulkResource: vi.fn(),
    setShowBulkDates: vi.fn(),
    setShowBulkDuration: vi.fn(),
    setShowBulkParent: vi.fn(),
    setShowBulkDeleteConfirm: vi.fn(),
    setDeleteTarget: vi.fn(),
    setBulkResourceValue: vi.fn(),
    setBulkSaving: vi.fn(),
    setImporting: vi.fn(),
    view: "gantt",
    exportingPdf: false,
    setExportingPdf: vi.fn(),
    fileInputRef: { current: null },
  };
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
  const { result } = renderHook(() => useScheduleMutations(params), { wrapper });
  return { result, qc };
}

/** Every payload handed to entities.ScheduleTask.update, keyed by task id. */
function payloadsById(): Record<string, Row> {
  return Object.fromEntries(
    mocks.update.mock.calls.map(([id, fields]) => [id as string, fields as Row]),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.update.mockImplementation(async (id: string, fields: Row) => ({ id, ...fields }));
});

describe("bulk status toolbar", () => {
  it("bulk-reopening a Complete task clears its percent to NULL rather than failing the CHECK", async () => {
    const { result } = renderMutations();
    await result.current.bulkUpdateMut.mutateAsync({ ids: [DONE.id], status: "In Progress" });

    const payload = payloadsById()[DONE.id];
    // Reopening says the task is no longer done, not how much remains.
    expect(payload.percent_complete).toBeNull();
    expect(passesPctConsistency(afterUpdate(DONE, payload))).toBe(true);
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it.each(SCHEDULE_STATUSES)("a bulk move to %s satisfies the constraint on every stored row", async (status) => {
    const { result } = renderMutations();
    await result.current.bulkUpdateMut.mutateAsync({
      ids: STORED.map((t) => t.id),
      status,
    });

    const payloads = payloadsById();
    for (const stored of STORED) {
      const row = afterUpdate(stored, payloads[stored.id]);
      expect(passesPctConsistency(row), `${String(stored.id)} → ${status}`).toBe(true);
    }
  });

  it.each(SCHEDULE_STATUSES)("a bulk move to %s writes exactly what a single-task save writes", async (status) => {
    // One write path: the bulk toolbar and the drawer must not be able to
    // disagree about percent, actuals, or anything else buildTaskUpdate owns.
    const single = renderMutations();
    for (const stored of STORED) {
      await single.result.current.updateTaskMut.mutateAsync({ id: stored.id, status } as ScheduleTask);
    }
    const viaSingle = payloadsById();

    mocks.update.mockClear();
    const bulk = renderMutations();
    await bulk.result.current.bulkUpdateMut.mutateAsync({
      ids: STORED.map((t) => t.id),
      status,
    });
    const viaBulk = payloadsById();

    for (const stored of STORED) {
      const id = stored.id;
      expect(viaBulk[id], `${id} → ${status}`).toEqual(viaSingle[id]);
    }
  });

  it("stamps actual dates per task, only where none were recorded, and says how many", async () => {
    const today = todayLocalISO();
    const { result } = renderMutations();
    await result.current.bulkUpdateMut.mutateAsync({
      ids: [DONE.id, MID.id, FRESH.id],
      status: "Complete",
    });

    const payloads = payloadsById();
    // Already Complete: not a transition, so nothing is re-stamped over the
    // day the work really finished.
    expect(payloads[DONE.id]).not.toHaveProperty("actual_finish_date");
    expect(payloads[DONE.id]).not.toHaveProperty("actual_start_date");
    // Started on 08-15 and recorded: keeps its start, gains a finish.
    expect(payloads[MID.id]).not.toHaveProperty("actual_start_date");
    expect(payloads[MID.id].actual_finish_date).toBe(today);
    // Never started: both halves are stamped.
    expect(payloads[FRESH.id].actual_start_date).toBe(today);
    expect(payloads[FRESH.id].actual_finish_date).toBe(today);

    // Writing a date nobody typed must be named in the toast.
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Updated 3 tasks. Recorded actual dates on 2.");
  });

  it("does not stamp a start on a task that is merely re-marked with the status it already has", async () => {
    const { result } = renderMutations();
    await result.current.bulkUpdateMut.mutateAsync({ ids: [UNRECORDED.id], status: "In Progress" });

    expect(payloadsById()[UNRECORDED.id]).not.toHaveProperty("actual_start_date");
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Updated 1 tasks.");
  });

  it("reports a partial failure instead of claiming every task was updated", async () => {
    mocks.update.mockImplementation(async (id: string, fields: Row) => {
      if (id === MID.id) throw new Error("permission denied");
      return { id, ...fields };
    });
    const { result } = renderMutations();
    await result.current.bulkUpdateMut.mutateAsync({ ids: [MID.id, FRESH.id], status: "On Hold" });

    expect(mocks.toastWarning).toHaveBeenCalledWith("1 updated, 1 failed.");
  });
});

describe("single-task save (updateTaskMut → buildTaskUpdate)", () => {
  it("stamps the actual finish on a real transition to Complete", async () => {
    const { result } = renderMutations();
    await result.current.updateTaskMut.mutateAsync({ id: MID.id, status: "Complete" } as ScheduleTask);

    const payload = payloadsById()[MID.id];
    expect(payload).toMatchObject({ status: "Complete", percent_complete: 100 });
    expect(payload.actual_finish_date).toBe(todayLocalISO());
    expect(payload).not.toHaveProperty("actual_start_date");
  });

  it("does not re-stamp when the save leaves the status unchanged", async () => {
    // Compared against the STORED row, so an unrelated edit of an in-progress
    // task with no recorded start does not invent one dated today.
    const { result } = renderMutations();
    await result.current.updateTaskMut.mutateAsync({
      id: UNRECORDED.id, status: "In Progress", task_name: "Ship sequence 2A",
    } as ScheduleTask);

    const payload = payloadsById()[UNRECORDED.id];
    expect(payload).not.toHaveProperty("actual_start_date");
    expect(payload).not.toHaveProperty("actual_finish_date");
  });

  it("keeps a date the user typed, and an explicit null, over the derived stamp", async () => {
    const { result } = renderMutations();
    await result.current.updateTaskMut.mutateAsync({
      id: FRESH.id, status: "Complete", actual_start_date: "2026-09-02", actual_finish_date: null,
    } as ScheduleTask);

    const payload = payloadsById()[FRESH.id];
    expect(payload.actual_start_date).toBe("2026-09-02");
    // Clearing a wrong actual must not be undone by the stamp.
    expect(payload.actual_finish_date).toBeNull();
  });

  it("validates the stamped actuals too, and writes nothing when they are inverted", async () => {
    // A typed start after today plus a finish stamped today is an inverted
    // window. Sanitizing before the merge would miss it and let the database
    // reject the row with a raw constraint name.
    const { result } = renderMutations();
    await expect(
      result.current.updateTaskMut.mutateAsync({
        id: FRESH.id, status: "Complete", actual_start_date: "2099-01-01",
      } as ScheduleTask),
    ).rejects.toThrow(/Actual finish cannot be before the actual start/);

    expect(mocks.update).not.toHaveBeenCalled();
    expect(String(mocks.toastError.mock.calls[0]?.[0])).toMatch(/^Update failed: /);
  });

  it("reports an inverted date window instead of failing silently, and never paints it", async () => {
    // The Gantt drag / inline editor case: sanitize throws on end < start.
    // onMutate must skip the paint and mutationFn must let the same throw reach
    // onError — a swallowed throw here is a save that fails with no feedback.
    const { result, qc } = renderMutations();
    const key = getQueryKey("schedule_task", "p1") as unknown[];
    qc.setQueryData(key, STORED);

    await expect(
      result.current.updateTaskMut.mutateAsync({
        id: MID.id, start_date: "2026-09-10", end_date: "2026-09-01",
      } as ScheduleTask),
    ).rejects.toThrow(/Finish date cannot be before the start date/);

    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledTimes(1);
    expect(String(mocks.toastError.mock.calls[0][0])).toMatch(/^Update failed: .*Finish date/);
    expect(qc.getQueryData(key)).toEqual(STORED);
  });

  it("rolls the optimistic paint back before reporting a rejected save", async () => {
    const { result, qc } = renderMutations();
    const key = getQueryKey("schedule_task", "p1") as unknown[];
    qc.setQueryData(key, STORED);

    let listWhenReported: unknown;
    mocks.toastError.mockImplementation(() => {
      listWhenReported = qc.getQueryData(key);
    });
    mocks.update.mockRejectedValueOnce(new Error("new row violates check constraint"));

    await expect(
      result.current.updateTaskMut.mutateAsync({ id: MID.id, status: "Complete" } as ScheduleTask),
    ).rejects.toThrow();

    // The Gantt must not keep showing a row the database refused.
    expect(mocks.toastError).toHaveBeenCalledTimes(1);
    expect(listWhenReported).toEqual(STORED);
  });
});

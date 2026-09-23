// @vitest-environment jsdom

import { createElement } from "react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useScheduleMutations, type UseScheduleMutationsParams } from "../useScheduleMutations";
import type { ScheduleTask } from "../types";

/**
 * Reopening a finished task, end to end: the real mutation hook, the real
 * entity client, and only Supabase mocked. The request body is what the
 * database would receive.
 *
 * Both halves were broken at once — the bulk toolbar sent no percent (so the
 * CHECK rejected the stored 100), and the single path's deliberate NULL was
 * turned into 0 by the client. Unit tests on either layer alone could not see
 * the second, because each layer was "right" given what it was handed.
 */

const bodies = vi.hoisted(() => [] as Array<Record<string, unknown>>);

function makeBuilder() {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.select = vi.fn(chain);
  builder.eq = vi.fn(chain);
  builder.order = vi.fn(chain);
  builder.limit = vi.fn(chain);
  builder.single = vi.fn(async () => ({ data: { id: "t-done" }, error: null }));
  builder.update = vi.fn((body: Record<string, unknown>) => {
    bodies.push(body);
    return builder;
  });
  builder.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
  return builder;
}

vi.mock("@/lib/supabase", () => ({
  supabase: { from: () => makeBuilder(), rpc: vi.fn() },
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn(), loading: vi.fn() },
}));

const DONE_ID = "t-done";
const DONE: ScheduleTask = {
  id: DONE_ID, project_id: "p1", task_name: "Erect bay 1",
  status: "Complete", percent_complete: 100,
  actual_start_date: "2026-08-01", actual_finish_date: "2026-08-20",
};

function renderMutations() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const params: UseScheduleMutationsParams = {
    projectId: "p1", qc,
    scheduleTasks: [DONE], enrichedTasks: [DONE], tasksWithEffective: [DONE],
    selectedProject: null, selectedTask: null, selectedIds: new Set(),
    setSelectedTask: vi.fn(), setSelectedIds: vi.fn(), setShowDrawer: vi.fn(),
    setShowBulkAdd: vi.fn(), setShowBulkResource: vi.fn(), setShowBulkDates: vi.fn(),
    setShowBulkDuration: vi.fn(), setShowBulkParent: vi.fn(), setShowBulkDeleteConfirm: vi.fn(),
    setDeleteTarget: vi.fn(), setBulkResourceValue: vi.fn(), setBulkSaving: vi.fn(),
    setImporting: vi.fn(), view: "gantt", exportingPdf: false, setExportingPdf: vi.fn(),
    fileInputRef: { current: null },
  };
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return renderHook(() => useScheduleMutations(params), { wrapper }).result;
}

beforeEach(() => {
  bodies.length = 0;
});

describe("reopening a Complete task reaches the database with percent NULL", () => {
  it("from the drawer / inline editor", async () => {
    const result = renderMutations();
    await result.current.updateTaskMut.mutateAsync({ id: DONE_ID, status: "In Progress" });
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({ status: "In Progress", percent_complete: null });
  });

  it("from the bulk toolbar", async () => {
    const result = renderMutations();
    await result.current.bulkUpdateMut.mutateAsync({ ids: [DONE_ID], status: "In Progress" });
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({ status: "In Progress", percent_complete: null });
  });
});

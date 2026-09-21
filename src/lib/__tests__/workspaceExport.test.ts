import { describe, it, expect, vi, beforeEach } from "vitest";

const invokeMock = vi.fn();
const fromMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
    from: fromMock,
  },
}));

import { PAGE_SIZE } from "@/lib/pagedQuery";
import {
  buildWorkspaceExport,
  workspaceExportFileName,
  exportWorkspace,
  fetchWorkspaceProjects,
} from "../workspaceExport";

describe("buildWorkspaceExport", () => {
  it("bundles envelopes, sums total_rows, defaults workspace, carries failures", () => {
    const envs = [
      { export_version: 1, total_rows: 10, exported_at: "", exported_by: "", project: {}, tables: {}, row_counts: {} },
      { export_version: 1, total_rows: 5, exported_at: "", exported_by: "", project: {}, tables: {}, row_counts: {} },
    ];
    const b = buildWorkspaceExport(envs, {
      exportedAt: "2026-06-16T00:00:00.000Z",
      failures: [{ project_id: "x", name: "X", error: "boom" }],
    });
    expect(b.project_count).toBe(2);
    expect(b.total_rows).toBe(15);
    expect(b.workspace).toBe("workspace"); // default when no name
    expect(b.exported_at).toBe("2026-06-16T00:00:00.000Z");
    expect(b.failures).toHaveLength(1);
  });

  it("uses and trims a provided workspace name", () => {
    expect(buildWorkspaceExport([], { workspaceName: "  S&H Steel  " }).workspace).toBe("S&H Steel");
  });
});

describe("workspaceExportFileName", () => {
  it("slugifies the workspace name + date", () => {
    const name = workspaceExportFileName({
      workspace: "S&H Steel", exported_at: "2026-06-16T12:00:00Z",
      export_version: 1, project_count: 0, total_rows: 0, projects: [], failures: [],
    });
    expect(name).toBe("s-h-steel-export-2026-06-16.json");
  });
});

describe("exportWorkspace", () => {
  beforeEach(() => invokeMock.mockReset());

  it("exports each project and records a per-project failure without aborting the rest", async () => {
    invokeMock
      .mockResolvedValueOnce({ data: { export_version: 1, total_rows: 7, tables: {} }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "boom" } });

    const progress: Array<[number, number, string]> = [];
    const bundle = await exportWorkspace(
      [{ id: "p1", name: "One" }, { id: "p2", name: "Two" }],
      { workspaceName: "WS", onProgress: (d, t, n) => progress.push([d, t, n]) },
    );

    expect(bundle.project_count).toBe(1); // one succeeded
    expect(bundle.total_rows).toBe(7);
    expect(bundle.failures).toEqual([{ project_id: "p2", name: "Two", error: "boom" }]);
    expect(invokeMock).toHaveBeenCalledTimes(2);
    expect(invokeMock).toHaveBeenCalledWith("project-export", { body: { project_id: "p1" } });
    expect(progress.length).toBeGreaterThan(0);
  });

  it("recovers the real reason from a non-2xx FunctionsHttpError (e.g. 403)", async () => {
    // supabase-js delivers a non-2xx response as { data: null, error } where
    // error.message is generic and the real body is in error.context (Response).
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {
        message: "Edge Function returned a non-2xx status code",
        context: { json: async () => ({ error: "No access to this project" }) },
      },
    });
    const bundle = await exportWorkspace([{ id: "p9", name: "Nine" }]);
    expect(bundle.project_count).toBe(0);
    expect(bundle.failures[0].error).toBe("No access to this project");
  });

  it("falls back to the generic message when the error body can't be parsed", async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {
        message: "Edge Function returned a non-2xx status code",
        context: { json: async () => { throw new Error("not json"); } },
      },
    });
    const bundle = await exportWorkspace([{ id: "p1", name: "One" }]);
    expect(bundle.failures[0].error).toBe("Edge Function returned a non-2xx status code");
  });

  it("times out a hung project and continues exporting the rest", async () => {
    invokeMock
      .mockImplementationOnce(() => new Promise(() => {})) // never resolves
      .mockResolvedValueOnce({ data: { export_version: 1, total_rows: 3, tables: {} }, error: null });
    const bundle = await exportWorkspace(
      [{ id: "slow", name: "Slow" }, { id: "fast", name: "Fast" }],
      { perProjectTimeoutMs: 10 },
    );
    expect(bundle.project_count).toBe(1);
    expect(bundle.total_rows).toBe(3);
    expect(bundle.failures).toHaveLength(1);
    expect(bundle.failures[0].project_id).toBe("slow");
    expect(bundle.failures[0].error).toMatch(/timed out/i);
  });
});

/**
 * fetchWorkspaceProjects — the read that decides what a "backup" contains.
 *
 * It used to be a raw unbounded `.select()` in SystemTab, cut off at
 * PostgREST's 1000-row ceiling (audit batch 1, #435). The truncation happened
 * BEFORE exportWorkspace saw the list, so the dropped projects never became
 * `failures` — the one mechanism that is supposed to stop a backup being
 * silently partial — and the caller's success toast reported the truncated
 * count as the number of projects backed up.
 */
describe("fetchWorkspaceProjects", () => {
  interface Recorded {
    orders: string[];
    filters: Record<string, unknown>;
    ranges: { from: number; to: number }[];
  }

  function serveProjects(total: number, error?: unknown) {
    const calls: Recorded[] = [];
    const rows = Array.from({ length: total }, (_, i) => ({ id: `p-${i}`, name: `Project ${i}` }));
    fromMock.mockImplementation(() => {
      const rec: Recorded = { orders: [], filters: {}, ranges: [] };
      calls.push(rec);
      const chain = {
        select: () => chain,
        eq: (column: string, value: unknown) => { rec.filters[column] = value; return chain; },
        order: (column: string) => { rec.orders.push(column); return chain; },
        range: (start: number, end: number) => {
          rec.ranges.push({ from: start, to: end });
          return error
            ? Promise.resolve({ data: null, error })
            : Promise.resolve({ data: rows.slice(start, end + 1), error: null });
        },
      };
      return chain;
    });
    return calls;
  }

  beforeEach(() => fromMock.mockReset());

  it("returns every project past the 1000-row ceiling that used to truncate", async () => {
    serveProjects(PAGE_SIZE * 2 + 1);
    expect(await fetchWorkspaceProjects("org-1")).toHaveLength(PAGE_SIZE * 2 + 1);
  });

  it("requests consecutive, non-overlapping windows", async () => {
    const calls = serveProjects(PAGE_SIZE + 1);
    await fetchWorkspaceProjects("org-1");
    expect(calls.flatMap((c) => c.ranges)).toEqual([
      { from: 0, to: PAGE_SIZE - 1 },
      { from: PAGE_SIZE, to: PAGE_SIZE * 2 - 1 },
    ]);
  });

  it("orders by created_at with id as the unique tiebreaker paging needs", async () => {
    const calls = serveProjects(1);
    await fetchWorkspaceProjects("org-1");
    expect(calls[0].orders).toEqual(["created_at", "id"]);
  });

  it("scopes to the org so a backup cannot mix in another org's projects", async () => {
    const calls = serveProjects(1);
    await fetchWorkspaceProjects("org-1");
    expect(calls[0].filters.org_id).toBe("org-1");
  });

  it("omits the org filter when none is given, leaving RLS to narrow it", async () => {
    const calls = serveProjects(1);
    await fetchWorkspaceProjects(null);
    expect(calls[0].filters).not.toHaveProperty("org_id");
  });

  it("excludes soft-deleted projects but not on-hold ones", async () => {
    const calls = serveProjects(1);
    await fetchWorkspaceProjects("org-1");
    expect(calls[0].filters.is_deleted).toBe(false);
    // on_hold is deliberately NOT filtered: a backup labelled "every project in
    // <org>" has to include the paused ones.
    expect(calls[0].filters).not.toHaveProperty("on_hold");
  });

  it("throws rather than handing back a short list a backup would be built from", async () => {
    serveProjects(PAGE_SIZE + 1, { message: "read failed" });
    await expect(fetchWorkspaceProjects("org-1")).rejects.toThrow(/workspace projects/);
  });
});

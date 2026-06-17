import { describe, it, expect, vi, beforeEach } from "vitest";

const invokeMock = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invokeMock(...args) } },
}));

import { buildWorkspaceExport, workspaceExportFileName, exportWorkspace } from "../workspaceExport";

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

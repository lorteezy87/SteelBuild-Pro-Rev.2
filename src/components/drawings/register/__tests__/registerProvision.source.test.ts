import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DrawingRegisterRow } from "@/hooks/useDrawingRegister";
import { provisionRegisterRevision } from "../registerProvision";

type SourceSheet = {
  id: string;
  project_id: string;
  revision_number: string | null;
  sheet_number: string;
  title: string;
  file_url: string | null;
  pdf_page: number | null;
  is_deleted: boolean;
  deleted_at: string | null;
  is_superseded: boolean | null;
};

type QueryRecord = {
  table: string;
  filters: Record<string, unknown>;
};

const backend = vi.hoisted(() => ({
  sheet: null as SourceSheet | null,
  current: null as Record<string, unknown> | null,
  inserted: [] as Record<string, unknown>[],
  queries: [] as QueryRecord[],
  sourceError: null as { code: string; message: string } | null,
  currentError: null as { code: string; message: string } | null,
  insertError: null as { code: string; message: string } | null,
  raceWinner: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from(table: string) {
      const query: QueryRecord = { table, filters: {} };
      backend.queries.push(query);
      let insertion: Record<string, unknown> | null = null;
      const builder = {
        select() { return builder; },
        eq(field: string, value: unknown) { query.filters[field] = value; return builder; },
        is(field: string, value: unknown) { query.filters[field] = value; return builder; },
        insert(value: Record<string, unknown>) {
          insertion = value;
          backend.inserted.push(value);
          return builder;
        },
        async maybeSingle() {
          return { data: table === "drawings" ? backend.sheet : backend.current,
            error: table === "drawings" ? backend.sourceError : backend.currentError };
        },
        async single() {
          if (backend.raceWinner) backend.current = backend.raceWinner;
          return { data: backend.insertError ? null : { id: "revision-new", ...insertion }, error: backend.insertError };
        },
      };
      return builder;
    },
  },
}));

const registerRow: DrawingRegisterRow = {
  drawing_id: "drawing-1",
  project_id: "project-1",
  sheet_number: "S101",
  sheet_title: "Framing plan",
  discipline: "S",
  drawing_set_name: "Shop package",
  stage: "IFA",
  // The real view derives these from a revision row that does not exist yet.
  current_revision_id: null,
  current_revision: null,
  current_status: null,
  current_issued_at: null,
  open_impact_count: 0,
  pending_review_count: 0,
  rfi_count: 0,
  work_package_count: 0,
  last_activity: null,
};

// Only the network boundary is mocked; both UI callers use this real service.
async function setUpTracking(row: DrawingRegisterRow = registerRow) {
  return provisionRegisterRevision({ row, projectId: "project-1", userId: "actor-1" });
}

beforeEach(() => {
  backend.sheet = {
    id: "drawing-1", project_id: "project-1", revision_number: "B",
    sheet_number: "S101", title: "Framing plan",
    file_url: "app-files/org-1/uploads/synthetic-sheet.pdf", pdf_page: 7,
    is_deleted: false, deleted_at: null, is_superseded: false,
  };
  backend.current = null;
  backend.inserted = [];
  backend.queries = [];
  backend.sourceError = null;
  backend.currentError = null;
  backend.insertError = null;
  backend.raceWinner = null;
});

describe("Register first revision source routing", () => {
  it("preserves the authorized parent sheet code, PDF, and page when the register has no revision", async () => {
    await setUpTracking();
    expect(backend.inserted).toHaveLength(1);
    expect(backend.inserted[0]).toMatchObject({
      drawing_id: "drawing-1", project_id: "project-1",
      revision_code: "B", file_url: backend.sheet?.file_url, pdf_page: 7,
      release_status: "received", version_number: 1,
    });
    expect(backend.queries).toContainEqual({
      table: "drawings",
      filters: { id: "drawing-1", project_id: "project-1", is_deleted: false, deleted_at: null },
    });
  });

  it("requires source completion instead of creating a placeholder when the parent PDF is absent", async () => {
    backend.sheet!.file_url = null;
    await expect(setUpTracking()).rejects.toThrow(/source|PDF/i);
    expect(backend.inserted).toHaveLength(0);
  });

  it("does not create a revision when the authorized parent read returns no sheet", async () => {
    backend.sheet = null;
    await expect(setUpTracking()).rejects.toThrow(/sheet|access/i);
    expect(backend.inserted).toHaveLength(0);
  });

  it("returns an existing current revision unchanged, including an incomplete historical snapshot", async () => {
    backend.current = { id: "historical-revision", project_id: "project-1", drawing_id: "drawing-1", is_current: true, archived_at: null, revision_code: "v1", file_url: null, pdf_page: null };
    const result = await setUpTracking();
    expect(result).toEqual(backend.current);
    expect(backend.inserted).toHaveLength(0);
    expect(backend.queries).toEqual([{ table: "drawing_revisions", filters: {
      project_id: "project-1", drawing_id: "drawing-1", is_current: true, archived_at: null,
    } }]);
  });

  it.each([
    { project_id: "other-project" }, { project_id: null }, { drawing_id: "" },
  ])("rejects an invalid register identity before any read: %j", async (identity) => {
    await expect(setUpTracking({ ...registerRow, ...identity })).rejects.toThrow(/project/i);
    expect(backend.queries).toHaveLength(0);
  });

  it.each([
    { is_deleted: true }, { deleted_at: "2026-10-09T00:00:00Z" },
    { is_superseded: true }, { project_id: "other-project" }, { id: "other-drawing" },
  ])("rejects archived or mismatched parent source: %j", async (changes) => {
    Object.assign(backend.sheet!, changes);
    await expect(setUpTracking()).rejects.toThrow(/sheet|archived/i);
    expect(backend.inserted).toHaveLength(0);
  });

  it.each([
    [{ revision_number: null }, /revision code/], [{ revision_number: "  " }, /revision code/],
    [{ file_url: "  " }, /source PDF/], [{ pdf_page: null }, /PDF page/],
    [{ pdf_page: 0 }, /PDF page/], [{ pdf_page: -1 }, /PDF page/],
    [{ pdf_page: 1.5 }, /PDF page/], [{ pdf_page: Number.NaN }, /PDF page/],
  ] as const)("requires explicit source completion for %j", async (changes, message) => {
    Object.assign(backend.sheet!, changes);
    await expect(setUpTracking()).rejects.toThrow(message);
    expect(backend.inserted).toHaveLength(0);
  });

  it("reuses only the same project's active current winner after a unique-constraint race", async () => {
    backend.insertError = { code: "23505", message: "duplicate key" };
    backend.raceWinner = { id: "winner", project_id: "project-1", drawing_id: "drawing-1", is_current: true, archived_at: null, file_url: null, pdf_page: null };
    await expect(setUpTracking()).resolves.toEqual(backend.raceWinner);
    const revisionReads = backend.queries.filter((query) => query.table === "drawing_revisions" && Object.keys(query.filters).length > 0);
    expect(revisionReads).toHaveLength(2);
    for (const read of revisionReads) expect(read.filters).toEqual({ project_id: "project-1", drawing_id: "drawing-1", is_current: true, archived_at: null });
    expect(backend.inserted).toHaveLength(1);
  });

  it("preserves unique-conflict errors when there is no active winner", async () => {
    backend.insertError = { code: "23505", message: "historical version conflict" };
    await expect(setUpTracking()).rejects.toEqual(backend.insertError);
  });

  it("fails closed when a conflict reread returns an archived or foreign winner", async () => {
    backend.insertError = { code: "23505", message: "duplicate key" };
    backend.raceWinner = { id: "wrong-winner", project_id: "other-project", drawing_id: "drawing-1", is_current: true, archived_at: null };
    await expect(setUpTracking()).rejects.toThrow(/no longer matches/);
  });

  it("reuses a persisted current row on retry after the insert response was lost", async () => {
    backend.insertError = { code: "NETWORK", message: "response lost" };
    backend.raceWinner = { id: "persisted", project_id: "project-1", drawing_id: "drawing-1", is_current: true, archived_at: null };
    await expect(setUpTracking()).rejects.toEqual(backend.insertError);
    await expect(setUpTracking()).resolves.toEqual(backend.raceWinner);
    expect(backend.inserted).toHaveLength(1);
  });

  it("does not treat permission failures as a successful concurrent insert", async () => {
    backend.insertError = { code: "42501", message: "access revoked" };
    backend.raceWinner = { id: "winner" };
    await expect(setUpTracking()).rejects.toEqual(backend.insertError);
    expect(backend.queries).toHaveLength(3);
  });

  it.each(["current", "source"] as const)("preserves %s read errors without inserting", async (read) => {
    const error = { code: "PGRST116", message: "ambiguous or failed read" };
    if (read === "current") backend.currentError = error;
    else backend.sourceError = error;
    await expect(setUpTracking()).rejects.toEqual(error);
    expect(backend.inserted).toHaveLength(0);
  });

  it("fails closed on an unexpected cross-project current result", async () => {
    backend.current = { id: "foreign", project_id: "other-project", drawing_id: "drawing-1", is_current: true, archived_at: null };
    await expect(setUpTracking()).rejects.toThrow(/no longer matches/);
    expect(backend.inserted).toHaveLength(0);
  });
});

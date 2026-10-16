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

describe("Register tracking lookup", () => {
  it("holds implicit setup even when the parent has complete source metadata", async () => {
    await expect(setUpTracking()).rejects.toThrow(/tracking required/i);
    expect(backend.inserted).toHaveLength(0);
    expect(backend.queries.map(q => q.table)).toEqual(["drawing_revisions"]);
  });
  it("returns an existing current revision unchanged", async () => {
    backend.current = { id: "historical", project_id: "project-1", drawing_id: "drawing-1", is_current: true, archived_at: null, file_url: null };
    await expect(setUpTracking()).resolves.toEqual(backend.current);
    expect(backend.inserted).toHaveLength(0);
  });
  it.each([{ project_id: "other" }, { project_id: null }, { drawing_id: "" }])("rejects invalid project identity %j", async identity => {
    await expect(setUpTracking({ ...registerRow, ...identity })).rejects.toThrow(/project/i);
    expect(backend.queries).toHaveLength(0);
  });
  it("preserves lookup errors without falling back to create", async () => {
    backend.currentError = { code: "PGRST116", message: "ambiguous rows" };
    await expect(setUpTracking()).rejects.toEqual(backend.currentError);
    expect(backend.inserted).toHaveLength(0);
  });
  it("rejects a foreign current row", async () => {
    backend.current = { project_id: "other", drawing_id: "drawing-1", is_current: true, archived_at: null };
    await expect(setUpTracking()).rejects.toThrow(/no longer matches/);
    expect(backend.inserted).toHaveLength(0);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FabApprovalEvidenceRows } from "../fabReleaseEvidence";

type Row = Record<string, unknown>;
const database = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  failTable: "",
  calls: [] as Array<{ table: string; filters: Record<string, unknown>; start: number; end: number; order: string[] }>,
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const order: string[] = [];
      return {
        select(columns: string) {
          if (table === "drawing_signoffs" && /\b(signed_by|signed_at|status)\b/.test(columns)) {
            throw new Error("requested sign-off column does not exist");
          }
          return this;
        },
        eq(column: string, value: unknown) { filters[column] = value; return this; },
        in(column: string, values: string[]) { filters[column] = values; return this; },
        order(column: string) { order.push(column); return this; },
        async range(start: number, end: number) {
          database.calls.push({ table, filters: { ...filters }, start, end, order: [...order] });
          if (database.failTable === table && start >= 500) {
            return { data: null as Row[] | null, error: { message: "page unavailable" } };
          }
          const rows = (database.tables[table] || []).filter((row) =>
            Object.entries(filters).every(([column, value]) =>
              Array.isArray(value) ? value.includes(String(row[column])) : row[column] === value,
            ),
          );
          if (order.includes("id")) rows.sort((a, b) => String(a.id).localeCompare(String(b.id)));
          return { data: rows.slice(start, end + 1), error: null };
        },
      };
    },
  },
}));

import {
  currentRevisionSignoffs,
  loadFabApprovalEvidence,
  loadFabGateRfis,
  toFabManifestSignoffs,
} from "../fabReleaseEvidence";

beforeEach(() => {
  database.tables = {};
  database.failTable = "";
  database.calls = [];
});

describe("fabrication package evidence", () => {
  it("reads every project submittal and drawing sign-off through bounded, stable pages", async () => {
    const drawingIds = Array.from({ length: 501 }, (_, index) => `drawing-${String(index).padStart(3, "0")}`);
    database.tables.submittals = Array.from({ length: 1001 }, (_, index) => ({
      id: `sub-${String(index).padStart(4, "0")}`, project_id: "project-1", is_deleted: false,
    })).reverse();
    database.tables.submittals.push({ id: "foreign-sub", project_id: "project-2", is_deleted: false });
    database.tables.drawing_signoffs = [
      ...Array.from({ length: 1001 }, (_, index) => ({
        id: `sign-${String(index).padStart(4, "0")}`, project_id: "project-1",
        drawing_id: drawingIds[0], drawing_revision_id: "rev-current", is_voided: false,
      })),
      { id: "sign-last", project_id: "project-1", drawing_id: drawingIds[500], drawing_revision_id: "rev-last", is_voided: false },
      { id: "foreign-sign", project_id: "project-2", drawing_id: drawingIds[0], drawing_revision_id: "rev-current", is_voided: false },
    ];
    database.tables.drawing_revisions = [
      { id: "rev-current", project_id: "project-1", drawing_id: drawingIds[0], is_current: true },
      { id: "rev-last", project_id: "project-1", drawing_id: drawingIds[500], is_current: true },
    ];

    const evidence = await loadFabApprovalEvidence("project-1", drawingIds);

    expect(evidence.submittals).toHaveLength(1001);
    expect(evidence.submittals[0].id).toBe("sub-0000");
    expect(evidence.drawingSignoffs).toHaveLength(1002);
    expect(evidence.drawingRevisions).toHaveLength(2);
    expect(database.calls.filter((call) => call.table === "submittals")).toHaveLength(3);
    expect(database.calls.filter((call) => call.table === "drawing_signoffs").length).toBeGreaterThan(3);
    expect(database.calls.every((call) => call.filters.project_id === "project-1" && call.order.includes("id"))).toBe(true);
    expect(database.calls.filter((call) => Array.isArray(call.filters.drawing_id)).every((call) =>
      (call.filters.drawing_id as string[]).length <= 500,
    )).toBe(true);
  });

  it("rejects a failed later page instead of returning a credible-looking subset", async () => {
    database.tables.submittals = Array.from({ length: 501 }, (_, index) => ({
      id: `sub-${index}`, project_id: "project-1", is_deleted: false,
    }));
    database.failTable = "submittals";

    await expect(loadFabApprovalEvidence("project-1", ["drawing-1"])).rejects.toThrow("page unavailable");
  });

  it("uses only current-revision sign-offs and maps the real table columns for the manifest", () => {
    const evidence: FabApprovalEvidenceRows = {
      submittals: [],
      drawingRevisions: [
        { id: "rev-old", drawing_id: "drawing-1", is_current: false, archived_at: "2026-09-01" },
        { id: "rev-current", drawing_id: "drawing-1", is_current: true, archived_at: null },
        { id: "rev-other", drawing_id: "drawing-2", is_current: true, archived_at: null },
      ],
      drawingSignoffs: [
        { id: "old", drawing_id: "drawing-1", drawing_revision_id: "rev-old", stamp_type: "approved_for_fabrication", stamped_by_name: "Old PM", stamped_at: "2026-09-01", is_voided: false },
        { id: "current", drawing_id: "drawing-1", drawing_revision_id: "rev-current", stamp_type: "approved_as_noted", stamped_by_name: "Current PM", stamped_at: "2026-10-01", is_voided: false },
        { id: "cross-sheet", drawing_id: "drawing-1", drawing_revision_id: "rev-other", stamp_type: "approved_for_fabrication", stamped_by_name: "Wrong sheet", stamped_at: "2026-10-02", is_voided: false },
      ],
    };

    const current = currentRevisionSignoffs(evidence);
    expect(current.map((row) => row.id)).toEqual(["current"]);
    expect(toFabManifestSignoffs(current)).toEqual([
      { drawing_id: "drawing-1", signed_by: "Current PM", signed_at: "2026-10-01", status: "approved_as_noted" },
    ]);
  });

  it("reads all linked-RFI candidates for the project and rejects a later-page error", async () => {
    database.tables.rfis = Array.from({ length: 1001 }, (_, index) => ({
      id: `rfi-${String(index).padStart(4, "0")}`, project_id: "project-1", is_deleted: false,
    }));
    database.tables.rfis.push({ id: "foreign", project_id: "project-2", is_deleted: false });
    expect(await loadFabGateRfis("project-1")).toHaveLength(1001);
    database.failTable = "rfis";
    await expect(loadFabGateRfis("project-1")).rejects.toThrow("page unavailable");
  });
});

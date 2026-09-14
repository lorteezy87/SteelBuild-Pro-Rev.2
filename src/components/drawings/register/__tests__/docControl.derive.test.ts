import { describe, it, expect } from "vitest";
import type { DrawingRegisterRow } from "@/hooks/useDrawingRegister";
import type { DrawingReviewRow } from "@/hooks/useDrawingReviews";
import type { DrawingImpactRow } from "@/hooks/useDrawingImpacts";
import type { TransmittalRow } from "@/hooks/useTransmittals";
import type { SetPackage } from "@/pages/drawingSubmittalHub/types";
import {
  IMPACT_STATUSES,
  buildRegisterDisplayRows,
  createDrawingRegisterIndex,
  filterIndexedRegisterRows,
  filterRegisterRows,
  firstVisibleDrawingByPackage,
  listDrawingSetNames,
  groupRegisterRowsBySet,
  SET_FILTER_NONE,
  attachableRegisterRows,
  filterReviews,
  groupImpactsByStatus,
  resolveTransmittalDisplay,
} from "../docControl.derive";

function regRow(over: Partial<DrawingRegisterRow> = {}): DrawingRegisterRow {
  return {
    drawing_id: "dwg-1",
    project_id: "proj-1",
    sheet_number: "S101",
    sheet_title: "First Floor Framing",
    discipline: "S",
    drawing_set_name: "Main Steel - IFC",
    stage: "IFC",
    current_revision_id: null,
    current_revision: "A",
    current_status: null,
    current_issued_at: null,
    open_impact_count: 0,
    pending_review_count: 0,
    rfi_count: 0,
    work_package_count: 0,
    last_activity: null,
    ...over,
  };
}

function reviewRow(over: Partial<DrawingReviewRow> = {}): DrawingReviewRow {
  return {
    id: "rev-1",
    project_id: "proj-1",
    drawing_revision_id: "drev-1",
    review_role: "project_manager",
    reviewer_id: null,
    decision: "pending",
    comments: null,
    reviewed_at: null,
    created_at: "2026-07-01T00:00:00Z",
    sheet_number: "S101",
    sheet_title: "Framing",
    revision_code: "A",
    ...over,
  };
}

function impactRow(over: Partial<DrawingImpactRow> = {}): DrawingImpactRow {
  return {
    id: "imp-1",
    project_id: "proj-1",
    drawing_revision_id: "drev-1",
    impact_type: "fabrication",
    status: "open",
    priority: "medium",
    title: "Re-cut embed",
    notes: null,
    assigned_to: null,
    due_date: null,
    resolved_at: null,
    created_at: "2026-07-01T00:00:00Z",
    sheet_number: "S101",
    sheet_title: "Framing",
    revision_code: "A",
    ...over,
  };
}

function transmittalRow(over: Partial<TransmittalRow> = {}): TransmittalRow {
  return {
    id: "t-1",
    project_id: "proj-1",
    transmittal_number: "T-001",
    direction: "incoming",
    source_company: null,
    received_from: "GC",
    sent_to: null,
    subject: "IFC set",
    date_sent: null,
    date_received: "2026-07-02",
    notes: null,
    created_at: "2026-07-02T00:00:00Z",
    items: [],
    item_count: 3,
    ...over,
  };
}

describe("filterRegisterRows", () => {
  it("returns all rows when query is blank and status is 'all'", () => {
    const rows = [regRow({ drawing_id: "a" }), regRow({ drawing_id: "b" })];
    expect(filterRegisterRows(rows, "", "all")).toHaveLength(2);
  });

  it("gates by current_status when a specific status filter is set", () => {
    const rows = [
      regRow({ drawing_id: "a", current_status: "released_for_field" }),
      regRow({ drawing_id: "b", current_status: "pending_review" }),
    ];
    const out = filterRegisterRows(rows, "", "released_for_field");
    expect(out.map((r) => r.drawing_id)).toEqual(["a"]);
  });

  it("matches the query case-insensitively across sheet/title/discipline/set/status", () => {
    const rows = [
      regRow({ drawing_id: "a", sheet_title: "Roof Framing Plan" }),
      regRow({ drawing_id: "b", sheet_title: "Foundation" }),
    ];
    expect(filterRegisterRows(rows, "  ROOF ", "all").map((r) => r.drawing_id)).toEqual(["a"]);
  });

  it("tolerates null text fields without throwing", () => {
    const rows = [regRow({ sheet_number: null, sheet_title: null, discipline: null, drawing_set_name: null, current_status: null })];
    expect(filterRegisterRows(rows, "nomatch", "all")).toHaveLength(0);
  });

  it("gates by drawing set name when setFilter is set", () => {
    const rows = [
      regRow({ drawing_id: "a", drawing_set_name: "Main Steel - IFC" }),
      regRow({ drawing_id: "b", drawing_set_name: "Misc Metals" }),
      regRow({ drawing_id: "c", drawing_set_name: null }),
    ];
    expect(filterRegisterRows(rows, "", "all", "Misc Metals").map((r) => r.drawing_id)).toEqual(["b"]);
    expect(filterRegisterRows(rows, "", "all", SET_FILTER_NONE).map((r) => r.drawing_id)).toEqual(["c"]);
  });
});

describe("indexed drawing register derivation", () => {
  it("normalizes searchable fields once per dataset rather than per filter keystroke", () => {
    let titleReads = 0;
    const rows = Array.from({ length: 250 }, (_, index) => {
      const row = regRow({
        drawing_id: `drawing-${index}`,
        sheet_number: `S${index}`,
        drawing_set_name: `Set ${index % 10}`,
      });
      Object.defineProperty(row, "sheet_title", {
        configurable: true,
        get: () => {
          titleReads += 1;
          return `Framing level ${index}`;
        },
      });
      return row;
    });

    const index = createDrawingRegisterIndex(rows);
    expect(titleReads).toBe(rows.length);

    expect(filterIndexedRegisterRows(index, "level 24", "all")).toHaveLength(11);
    expect(filterIndexedRegisterRows(index, "level 1", "all")).toHaveLength(111);
    expect(titleReads).toBe(rows.length);
  });

  it("indexes drawing and set package joins once and preserves first-visible actions", () => {
    const packageA: SetPackage = {
      key: "id:set-a",
      setId: "set-a",
      name: "Set A",
      parent: { id: "set-a" },
      sheets: [{ id: "drawing-direct" }],
      supersededSheets: [],
      submittals: [],
    };
    const rows = [
      regRow({ drawing_id: "drawing-direct", drawing_set_id: "set-a" }),
      regRow({
        drawing_id: "drawing-fallback",
        drawing_set_id: "set-a",
        sheet_title: "Fallback sheet",
      }),
    ];

    const index = createDrawingRegisterIndex(rows, [packageA]);
    expect(index.entries.map((entry) => entry.pkg?.key)).toEqual(["id:set-a", "id:set-a"]);
    expect(firstVisibleDrawingByPackage(index.entries).get("id:set-a")).toBe("drawing-direct");
    expect(filterIndexedRegisterRows(index, "fallback", "all")[0]?.pkg).toBe(packageA);
  });

  it("flattens grouped rows while omitting collapsed group children", () => {
    const index = createDrawingRegisterIndex([
      regRow({ drawing_id: "a", drawing_set_name: "Set A" }),
      regRow({ drawing_id: "b", drawing_set_name: "Set A" }),
      regRow({ drawing_id: "c", drawing_set_name: "Set B" }),
    ]);

    const expanded = buildRegisterDisplayRows(index.entries, true, new Set());
    expect(expanded.map((row) => row.kind)).toEqual(["group", "sheet", "sheet", "group", "sheet"]);

    const collapsed = buildRegisterDisplayRows(index.entries, true, new Set(["Set A"]));
    expect(collapsed.map((row) => row.kind)).toEqual(["group", "group", "sheet"]);
  });
});

describe("listDrawingSetNames / groupRegisterRowsBySet", () => {
  it("lists unique sorted set names", () => {
    const rows = [
      regRow({ drawing_set_name: "Zeta" }),
      regRow({ drawing_set_name: "Alpha" }),
      regRow({ drawing_set_name: "Alpha" }),
      regRow({ drawing_set_name: null }),
    ];
    expect(listDrawingSetNames(rows)).toEqual(["Alpha", "Zeta"]);
  });

  it("groups named sets first, unassigned last", () => {
    const rows = [
      regRow({ drawing_id: "u", drawing_set_name: null }),
      regRow({ drawing_id: "b", drawing_set_name: "B Set" }),
      regRow({ drawing_id: "a", drawing_set_name: "A Set" }),
      regRow({ drawing_id: "a2", drawing_set_name: "A Set" }),
    ];
    const g = groupRegisterRowsBySet(rows);
    expect(g.map((x) => x.setName)).toEqual(["A Set", "B Set", null]);
    expect(g[0].rows.map((r) => r.drawing_id)).toEqual(["a", "a2"]);
    expect(g[2].rows.map((r) => r.drawing_id)).toEqual(["u"]);
  });
});

describe("attachableRegisterRows", () => {
  it("keeps only rows with a current revision", () => {
    const rows = [
      regRow({ drawing_id: "a", current_revision_id: "r1" }),
      regRow({ drawing_id: "b", current_revision_id: null }),
    ];
    expect(attachableRegisterRows(rows).map((r) => r.drawing_id)).toEqual(["a"]);
  });
});

describe("filterReviews", () => {
  const reviews = [
    reviewRow({ id: "1", decision: "pending" }),
    reviewRow({ id: "2", decision: "approved" }),
  ];
  it("keeps only pending when pendingOnly is true", () => {
    expect(filterReviews(reviews, true).map((r) => r.id)).toEqual(["1"]);
  });
  it("keeps all when pendingOnly is false", () => {
    expect(filterReviews(reviews, false)).toHaveLength(2);
  });
});

describe("groupImpactsByStatus", () => {
  it("always includes all six columns even when empty", () => {
    const grouped = groupImpactsByStatus([]);
    expect(Object.keys(grouped).sort()).toEqual([...IMPACT_STATUSES].sort());
    for (const s of IMPACT_STATUSES) expect(grouped[s]).toEqual([]);
  });

  it("buckets impacts under their status", () => {
    const grouped = groupImpactsByStatus([
      impactRow({ id: "a", status: "open" }),
      impactRow({ id: "b", status: "open" }),
      impactRow({ id: "c", status: "blocked" }),
    ]);
    expect(grouped.open.map((i) => i.id)).toEqual(["a", "b"]);
    expect(grouped.blocked.map((i) => i.id)).toEqual(["c"]);
    expect(grouped.ready).toEqual([]);
  });

  it("does not drop an impact with an unexpected status", () => {
    const grouped = groupImpactsByStatus([impactRow({ id: "x", status: "archived" as unknown as DrawingImpactRow["status"] })]);
    expect(grouped["archived"].map((i) => i.id)).toEqual(["x"]);
  });
});

describe("resolveTransmittalDisplay", () => {
  it("uses received_from + date_received for incoming", () => {
    const d = resolveTransmittalDisplay(transmittalRow({ direction: "incoming", received_from: "GC", date_received: "2026-07-02", sent_to: "X", date_sent: "2026-01-01" }));
    expect(d).toEqual({ party: "GC", date: "2026-07-02" });
  });
  it("uses sent_to + date_sent for outgoing", () => {
    const d = resolveTransmittalDisplay(transmittalRow({ direction: "outgoing", received_from: "GC", date_received: "2026-07-02", sent_to: "Fabricator", date_sent: "2026-07-03" }));
    expect(d).toEqual({ party: "Fabricator", date: "2026-07-03" });
  });
  it("uses sent_to + date_sent for internal", () => {
    const d = resolveTransmittalDisplay(transmittalRow({ direction: "internal", received_from: "GC", date_received: "2026-07-02", sent_to: "Shop", date_sent: "2026-07-04" }));
    expect(d).toEqual({ party: "Shop", date: "2026-07-04" });
  });
});

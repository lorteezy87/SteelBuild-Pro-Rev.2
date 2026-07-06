import { describe, it, expect } from "vitest";
import type { DrawingRegisterRow } from "@/hooks/useDrawingRegister";
import type { DrawingReviewRow } from "@/hooks/useDrawingReviews";
import type { DrawingImpactRow } from "@/hooks/useDrawingImpacts";
import type { TransmittalRow } from "@/hooks/useTransmittals";
import {
  IMPACT_STATUSES,
  filterRegisterRows,
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

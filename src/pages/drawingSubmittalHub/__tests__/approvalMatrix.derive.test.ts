import { describe, expect, it } from "vitest";
import { buildBoardItems, resolvePackageStage } from "@/components/submittals/processBoard.derive";
import type { DrawingHoldRow } from "@/hooks/useDrawingHolds";
import type { TransmittalRow } from "@/hooks/useTransmittals";
import {
  MATRIX_FILTERS,
  buildLastTransmittalBySet,
  createSubmittalForSetSearch,
  enrichApprovalMatrixRows,
  hubTabSearch,
  matchesMatrixFilter,
  parseMatrixFilter,
  submittalSearch,
  summarizeMatrixCoverage,
  transmittalSearch,
} from "../approvalMatrix.derive";
import { buildApprovalMatrixRows, buildSetPackages, summarizeApprovalMatrix } from "../format";

function hold(drawingId: string, isActive = true): DrawingHoldRow {
  return {
    id: `hold-${drawingId}-${isActive ? "on" : "off"}`,
    project_id: "p1",
    drawing_id: drawingId,
    reason: "Pending RFI",
    prior_release_status: null,
    placed_by_id: null,
    placed_by_name: null,
    placed_at: "2026-08-01T00:00:00Z",
    is_active: isActive,
    released_by_id: null,
    released_by_name: null,
    released_at: isActive ? null : "2026-08-02T00:00:00Z",
    release_notes: null,
    created_at: "2026-08-01T00:00:00Z",
  };
}

function transmittal(overrides: Partial<TransmittalRow> & { drawingIds?: string[] } = {}): TransmittalRow {
  const { drawingIds = [], ...rest } = overrides;
  const items = drawingIds.map((drawingId, i) => ({
    id: `${rest.id ?? "t"}-item-${i}`,
    drawing_revision_id: `rev-${drawingId}`,
    drawing_id: drawingId,
    sheet_number: drawingId.toUpperCase(),
    sheet_title: null as string | null,
    revision_code: "0",
  }));
  return {
    id: "t",
    project_id: "p1",
    transmittal_number: "T-001",
    direction: "outgoing",
    source_company: null,
    received_from: null,
    sent_to: "EOR",
    subject: null,
    date_sent: "2026-08-01",
    date_received: null,
    notes: null,
    created_at: "2026-08-01T09:00:00Z",
    is_deleted: false,
    items,
    item_count: items.length,
    ...rest,
  };
}

const SETS = [
  { id: "s1", set_name: "Main Steel" },
  { id: "s2", set_name: "Anchor Bolts" },
  { id: "s3", set_name: "Stairs" },
];

const DRAWINGS = [
  { id: "d1", drawing_set_id: "s1", stage: "IFA" },
  { id: "d2", drawing_set_id: "s1", stage: "IFA" },
  { id: "d3", drawing_set_id: "s1", stage: "IFA", is_superseded: true },
  { id: "d4", drawing_set_id: "s2", stage: "OFA" },
  { id: "d5", drawing_set_id: "s3", stage: "IFA", is_deleted: true },
];

function enrich(submittals: any[], opts: { holds?: DrawingHoldRow[]; transmittals?: TransmittalRow[]; sets?: any[]; drawings?: any[] } = {}) {
  const sets = opts.sets ?? SETS;
  const packages = buildSetPackages((opts.drawings ?? DRAWINGS) as any, sets as any, submittals as any);
  const rows = buildApprovalMatrixRows(sets, submittals);
  return {
    packages,
    rows: enrichApprovalMatrixRows(rows, { setPackages: packages, holds: opts.holds, transmittals: opts.transmittals }),
  };
}

const byId = <T extends { id: string }>(rows: T[], id: string): T => {
  const row = rows.find((r) => r.id === id);
  if (!row) throw new Error(`no row ${id}`);
  return row;
};

describe("enrichApprovalMatrixRows — sheets and holds (2026 columns)", () => {
  it("counts live sheets and ACTIVE holds per set; superseded, deleted and released don't count", () => {
    const { rows } = enrich([], {
      holds: [hold("d1"), hold("d2", false), hold("d3"), hold("d4")],
    });
    expect(byId(rows, "s1")).toMatchObject({ sheetCount: 2, onHold: 1 }); // d3 superseded, d2 released
    expect(byId(rows, "s2")).toMatchObject({ sheetCount: 1, onHold: 1 });
    expect(byId(rows, "s3")).toMatchObject({ sheetCount: 0, onHold: 0 }); // d5 deleted
  });

  it("reports an unknown sheet count (null) rather than 0 when the set has no package", () => {
    const rows = enrichApprovalMatrixRows(buildApprovalMatrixRows(SETS, []), { setPackages: [] });
    expect(rows.every((r) => r.sheetCount === null && r.onHold === 0)).toBe(true);
  });

  it("keeps buildApprovalMatrixRows order and fields untouched", () => {
    const submittals = [{ id: "a", drawing_set_ids: ["s1"], status: "Submitted", submittal_number: "001", submitted_date: "2026-08-01" }];
    const base = buildApprovalMatrixRows(SETS, submittals);
    const { rows } = enrich(submittals);
    expect(rows.map((r) => r.id)).toEqual(base.map((r) => r.id));
    expect(byId(rows, "s1").latestSubmittal.id).toBe("a");
  });
});

describe("enrichApprovalMatrixRows — stage", () => {
  const submittals = [
    { id: "a", drawing_set_ids: ["s1"], status: "Under Review", ball_in_court: "EOR", submittal_number: "001", submitted_date: "2026-08-01" },
    { id: "v", drawing_set_ids: ["s2"], status: "Void", submittal_number: "002" },
  ];

  it("matches the Process Board's stage for every set (one rule, two tabs)", () => {
    const { rows, packages } = enrich(submittals);
    const board = buildBoardItems(packages, submittals);
    for (const row of rows) {
      const item = board.find((b) => b.id === `set-id:${row.id}`);
      expect(item, row.id).toBeTruthy();
      expect(row.stage, row.id).toBe(item?.stage);
    }
  });

  it("labels where the stage came from: submittal, legacy sheet fallback, or nothing", () => {
    const { rows } = enrich(submittals);
    expect(byId(rows, "s1").stageSource).toBe("submittal");
    // Void governs (fallback) but maps to no stage → the sheets' stage, flagged as such.
    expect(byId(rows, "s2")).toMatchObject({ stageSource: "sheets", stage: "OFA" });
    expect(byId(rows, "s3")).toMatchObject({ stageSource: "none", stage: "Not Started" });
  });

  it("resolvePackageStage prefers the governing submittal over sheet stages", () => {
    expect(resolvePackageStage([{ id: "a", status: "Released for Fabrication", submitted_date: "2026-08-01" }], [{ stage: "IFA" }])).toBe("Released");
    expect(resolvePackageStage([{ id: "v", status: "Void" }], [{ stage: "OFA" }])).toBe("OFA");
    expect(resolvePackageStage([], [])).toBe("Not Started");
  });
});

describe("buildLastTransmittalBySet (items → revision → sheet → set)", () => {
  const { packages } = enrich([]);

  it("picks the newest by the date the direction implies, across both directions", () => {
    const last = buildLastTransmittalBySet([
      transmittal({ id: "out", transmittal_number: "T-001", date_sent: "2026-08-01", drawingIds: ["d1"] }),
      transmittal({ id: "in", transmittal_number: "T-002", direction: "incoming", date_sent: null, date_received: "2026-08-05", received_from: "EOR", drawingIds: ["d2"] }),
    ], packages);
    expect(last.get("s1")).toEqual({ id: "in", number: "T-002", direction: "incoming", party: "EOR", date: "2026-08-05" });
  });

  it("breaks same-day ties on created_at, then on transmittal number", () => {
    const last = buildLastTransmittalBySet([
      transmittal({ id: "early", transmittal_number: "T-009", created_at: "2026-08-01T08:00:00Z", drawingIds: ["d1"] }),
      transmittal({ id: "late", transmittal_number: "T-003", created_at: "2026-08-01T17:00:00Z", drawingIds: ["d1"] }),
    ], packages);
    expect(last.get("s1")?.id).toBe("late");
    const tie = buildLastTransmittalBySet([
      transmittal({ id: "t2", transmittal_number: "T-2", drawingIds: ["d1"] }),
      transmittal({ id: "t10", transmittal_number: "T-10", drawingIds: ["d1"] }),
    ], packages);
    expect(tie.get("s1")?.id).toBe("t10"); // natural order: T-10 > T-2
  });

  it("maps superseded sheets, spans sets, and ignores deleted transmittals and unknown sheets", () => {
    const last = buildLastTransmittalBySet([
      transmittal({ id: "both", transmittal_number: "T-001", drawingIds: ["d3", "d4", "ghost"] }),
      transmittal({ id: "deleted", transmittal_number: "T-099", date_sent: "2026-12-31", is_deleted: true, drawingIds: ["d4"] }),
    ], packages);
    expect(last.get("s1")?.id).toBe("both"); // d3 is superseded but still in s1
    expect(last.get("s2")?.id).toBe("both");
    expect(last.has("s3")).toBe(false);
  });

  it("falls back to created_at when a transmittal carries no date", () => {
    const last = buildLastTransmittalBySet([
      transmittal({ id: "dated", date_sent: "2026-08-01", drawingIds: ["d1"] }),
      transmittal({ id: "undated", date_sent: null, created_at: "2026-08-03T00:00:00Z", drawingIds: ["d1"] }),
    ], packages);
    expect(last.get("s1")).toMatchObject({ id: "undated", date: null });
  });
});

describe("matchesMatrixFilter — every pill's count equals the rows its filter shows", () => {
  const sets = [
    { id: "s1", set_name: "A" }, { id: "s2", set_name: "B" }, { id: "s3", set_name: "C" },
    { id: "s4", set_name: "D" }, { id: "s5", set_name: "E" }, { id: "s6", set_name: "F" },
  ];
  const drawings = [
    { id: "d1", drawing_set_id: "s1" }, { id: "d2", drawing_set_id: "s2" }, { id: "d6", drawing_set_id: "s6" },
  ];
  const submittals = [
    { id: "late", drawing_set_ids: ["s1"], status: "Submitted", submitted_date: "2026-01-05", required_date: "2000-01-01", submittal_number: "1" },
    { id: "ok", drawing_set_ids: ["s2"], status: "Approved", submitted_date: "2026-01-05", returned_date: "2026-01-09", submittal_number: "2" },
    { id: "rr", drawing_set_ids: ["s3"], status: "Revise and Resubmit", submitted_date: "2026-01-05", submittal_number: "3" },
    { id: "eor", drawing_set_ids: ["s4"], status: "Under Review", submitted_date: "2026-01-05", submittal_number: "4", approver_notes: [{ id: "n", note: "Confirm camber?", response: "" }] },
    { id: "void", drawing_set_ids: ["s5"], status: "Void", submittal_number: "5" },
  ];
  const { rows } = enrich(submittals, { sets, drawings, holds: [hold("d1"), hold("d6")] });
  const summary = summarizeApprovalMatrix(rows);
  const coverage = summarizeMatrixCoverage(rows);
  const expected: Record<(typeof MATRIX_FILTERS)[number], number> = {
    overdue: summary.overdue,
    pending: summary.pending,
    action: summary.rejected,
    approved: summary.approved,
    eor: summary.pendingEor,
    nosub: summary.noSubmittal,
    hold: coverage.setsOnHold,
  };

  it.each(MATRIX_FILTERS.map((f) => [f]))("%s", (filter) => {
    const shown = rows.filter((row) => matchesMatrixFilter(row, filter)).length;
    expect(shown).toBe(expected[filter]);
    expect(shown).toBeGreaterThan(0); // the fixture exercises every bucket
  });

  it("no filter shows every row", () => {
    expect(rows.filter((row) => matchesMatrixFilter(row, null))).toHaveLength(rows.length);
  });

  it("never files a Void submittal under pending", () => {
    expect(matchesMatrixFilter(byId(rows, "s5"), "pending")).toBe(false);
  });

  it("summarizes holds and released coverage", () => {
    expect(coverage).toEqual({ setsOnHold: 2, sheetsOnHold: 2, released: 0 });
  });
});

describe("parseMatrixFilter", () => {
  it("round-trips every filter and rejects anything else", () => {
    for (const f of MATRIX_FILTERS) expect(parseMatrixFilter(f)).toBe(f);
    expect(parseMatrixFilter(null)).toBeNull();
    expect(parseMatrixFilter("")).toBeNull();
    expect(parseMatrixFilter("OVERDUE")).toBeNull();
    expect(parseMatrixFilter("constructor")).toBeNull();
  });
});

describe("hub deep links", () => {
  it("stay inside the hub as ?hub_tab= links the receiving tab consumes", () => {
    expect(hubTabSearch("holds")).toBe("?hub_tab=holds");
    expect(submittalSearch("sub-1")).toBe("?hub_tab=submittals&recordId=sub-1");
    expect(createSubmittalForSetSearch("set 1")).toBe("?hub_tab=submittals&targetSetId=set+1");
    expect(transmittalSearch("t-1")).toBe("?hub_tab=transmittals&transmittal=t-1");
  });
});

import { describe, it, expect } from "vitest";
import {
  isOverdue, daysLate, groupByDrawingSet,
  buildRfiMap, buildSubmittalsBySetId, filterDrawings, groupByDrawingSetName,
  computeExistingSetNames, buildDrawingSetMap, computeSelectedSetName, computeStagePipeline,
  classifyDrawingStageMutation, getDrawingSetIdentity,
} from "../drawingsUtils";

const PAST = "2020-01-01";
const FUTURE = "2999-01-01";

describe("isOverdue", () => {
  it("flags a past-due sheet that is still active", () => {
    expect(isOverdue({ due_date: PAST, stage: "IFC" })).toBe(true);
  });

  it("is not overdue without a due date, or when due in the future", () => {
    expect(isOverdue({ stage: "IFC" })).toBe(false);
    expect(isOverdue({ due_date: FUTURE, stage: "IFC" })).toBe(false);
  });

  it("never flags a done/inactive sheet, even if past due (the 'good sets light up red' fix)", () => {
    expect(isOverdue({ due_date: PAST, stage: "Released" })).toBe(false);
    expect(isOverdue({ due_date: PAST, stage: "IFC", is_superseded: true })).toBe(false);
    expect(isOverdue({ due_date: PAST, stage: "IFC", set_approval_status: "approved" })).toBe(false);
  });
});

describe("daysLate", () => {
  it("is 0 when not overdue and positive when genuinely late", () => {
    expect(daysLate({ due_date: FUTURE, stage: "IFC" })).toBe(0);
    expect(daysLate({ due_date: PAST, stage: "IFC" })).toBeGreaterThan(0);
    expect(daysLate({ due_date: PAST, stage: "Released" })).toBe(0); // done = not late
  });
});

// groupByDrawingSet powers the register table's set-level rollups. Identity is
// the FK drawing_set_id first, legacy drawing_set_name second, UNGROUPED last.
// These lock the grouping keys, the parent-name resolution (F8 fix), the
// set-only seeding from drawing_sets rows, the aggregate rollups, and the
// action-first ordering (needs-attention sets float up, ungrouped stays last).
describe("groupByDrawingSet", () => {
  it("groups sheets by FK drawing_set_id and names the group from the parent set (F8)", () => {
    const drawings = [
      { id: "s1", drawing_set_id: "set-1", sheet_number: "S-101", stage: "IFC" },
      { id: "s2", drawing_set_id: "set-1", sheet_number: "S-102", stage: "Released" },
    ];
    const map = { "set-1": { id: "set-1", set_name: "Main Steel - IFC" } };
    const groups = groupByDrawingSet(drawings, map);
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("Main Steel - IFC");
    expect(groups[0].setId).toBe("set-1");
    expect(groups[0].isUngrouped).toBe(false);
    expect(groups[0].aggregates.total).toBe(2);
    expect(groups[0].aggregates.releasedCount).toBe(1);
    expect(groups[0].aggregates.percentReleased).toBe(50);
  });

  it("falls back to the legacy drawing_set_name when there is no FK", () => {
    const drawings = [{ id: "s1", drawing_set_name: "Anchor Bolts - OFA", sheet_number: "AB-1", stage: "OFA" }];
    const groups = groupByDrawingSet(drawings, {});
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("Anchor Bolts - OFA");
    expect(groups[0].setId).toBeNull();
  });

  it("routes sheets with neither id nor name to one UNGROUPED group, always sorted last", () => {
    const drawings = [
      { id: "s1", drawing_set_id: "set-1", sheet_number: "S-1", stage: "IFA" },
      { id: "u1", sheet_number: "X-1", stage: "IFA" },
      { id: "u2", sheet_number: "X-2", stage: "IFA" },
    ];
    const map = { "set-1": { id: "set-1", set_name: "Structural" } };
    const groups = groupByDrawingSet(drawings, map);
    const ungrouped = groups.find((g) => g.isUngrouped);
    expect(ungrouped).toBeTruthy();
    expect(ungrouped.name).toBe("UNGROUPED SHEETS");
    expect(ungrouped.aggregates.total).toBe(2);
    expect(groups[groups.length - 1].isUngrouped).toBe(true);
  });

  it("seeds set-level-only groups (parent rows with no child sheets) with parent-derived aggregates", () => {
    const map = {
      "set-9": {
        id: "set-9",
        set_name: "BFA Round 2",
        set_approval_status: "pending_review",
        stage_summary: "OFA sent 2026-01",
        file_url: "https://drive/x",
        metadata: { event_count: 3 },
      },
    };
    const groups = groupByDrawingSet([], map);
    expect(groups).toHaveLength(1);
    const g = groups[0];
    expect(g.setOnly).toBe(true);
    expect(g.aggregates.total).toBe(0);
    expect(g.aggregates.aggregateStatus).toBe("pending_review");
    expect(g.aggregates.stageSummary).toBe("OFA sent 2026-01");
    expect(g.aggregates.driveUrl).toBe("https://drive/x");
    expect(g.aggregates.eventCount).toBe(3);
  });

  it("floats sets needing action (priority / failed extraction) above quiet sets, ungrouped last", () => {
    const drawings = [
      { id: "a1", drawing_set_id: "set-a", sheet_number: "A-1", stage: "IFA" }, // quiet
      { id: "b1", drawing_set_id: "set-b", sheet_number: "B-1", stage: "IFA", priority_flag: true }, // needs action
      { id: "u1", sheet_number: "U-1", stage: "IFA", priority_flag: true }, // ungrouped stays last regardless
    ];
    const map = {
      "set-a": { id: "set-a", set_name: "Alpha" },
      "set-b": { id: "set-b", set_name: "Bravo" },
    };
    const groups = groupByDrawingSet(drawings, map);
    expect(groups[0].name).toBe("Bravo"); // needs-action floats up
    expect(groups[1].name).toBe("Alpha"); // quiet next
    expect(groups[2].isUngrouped).toBe(true); // ungrouped always last
  });

  it("computes the numeric max revision, stripping non-digit revision labels", () => {
    const drawings = [
      { id: "s1", drawing_set_id: "set-1", sheet_number: "S-1", revision_number: "2", stage: "IFA" },
      { id: "s2", drawing_set_id: "set-1", sheet_number: "S-2", revision_number: "Rev 5", stage: "IFA" },
      { id: "s3", drawing_set_id: "set-1", sheet_number: "S-3", revision_number: "IFC", stage: "IFA" },
    ];
    const groups = groupByDrawingSet(drawings, { "set-1": { id: "set-1", set_name: "X" } });
    expect(groups[0].aggregates.maxRev).toBe(5);
  });
});

// ─── Drawings page derivations (extracted from Drawings.jsx) ─────────────────

describe("buildRfiMap", () => {
  it("maps rfi_number → rfi, skipping rows without a number", () => {
    const map = buildRfiMap([
      { rfi_number: "RFI-001", id: "a" },
      { rfi_number: "RFI-002", id: "b" },
      { id: "c" },
    ]);
    expect(Object.keys(map)).toEqual(["RFI-001", "RFI-002"]);
    expect(map["RFI-001"].id).toBe("a");
  });
});

describe("buildSubmittalsBySetId", () => {
  const TERMINAL = new Set(["Approved", "Approved as Noted", "Released for Fabrication"]);
  it("tallies total + open per set, fans out across drawing_set_ids, treats terminal+Void as closed, skips deleted", () => {
    const submittals = [
      { id: "s1", status: "OFA", drawing_set_ids: ["set-1", "set-2"] },       // open, fans out
      { id: "s2", status: "Approved", drawing_set_ids: ["set-1"] },           // closed (terminal)
      { id: "s3", status: "Void", drawing_set_ids: ["set-2"] },               // closed (void)
      { id: "s4", status: "OFA", drawing_set_ids: ["set-3"], is_deleted: true }, // skipped
    ];
    const map = buildSubmittalsBySetId(submittals, TERMINAL);
    expect(map["set-1"]).toEqual({ total: 2, open: 1, latestStatus: "OFA", latestId: "s1" });
    expect(map["set-2"]).toEqual({ total: 2, open: 1, latestStatus: "OFA", latestId: "s1" });
    expect(map["set-3"]).toBeUndefined();
  });
  it("keeps the FIRST encountered status as latest (submittals arrive pre-sorted by -submitted_date)", () => {
    const map = buildSubmittalsBySetId([
      { id: "new", status: "BFA", drawing_set_ids: ["s"] },
      { id: "old", status: "OFA", drawing_set_ids: ["s"] },
    ], TERMINAL);
    expect(map["s"]).toEqual({ total: 2, open: 2, latestStatus: "BFA", latestId: "new" });
  });
});

describe("drawing workflow authority helpers", () => {
  it("blocks direct stage writes while a linked submittal is still open", () => {
    expect(classifyDrawingStageMutation(
      { drawing_set_id: "set-1" },
      "IFC",
      { "set-1": { total: 1, open: 1, latestStatus: "Under Review", latestId: "sub-1" } },
    )).toMatchObject({ kind: "submittal", allowed: false, latestId: "sub-1" });
  });

  it("allows sheet-stage sync after all linked submittals are closed", () => {
    expect(classifyDrawingStageMutation(
      { drawing_set_id: "set-1" },
      "IFC",
      { "set-1": { total: 2, open: 0, latestStatus: "Approved as Noted", latestId: "sub-9" } },
    )).toMatchObject({ kind: "closed-set-sync", allowed: true });
  });

  it("allows constrained legacy recovery when no submittal is linked", () => {
    expect(classifyDrawingStageMutation({ drawing_set_id: "set-2" }, "IFA", {}))
      .toMatchObject({ kind: "legacy-recovery", allowed: true });
  });

  it("uses FK identity before legacy name identity", () => {
    expect(getDrawingSetIdentity({ drawing_set_id: "set-3", drawing_set_name: "Same" })).toBe("id:set-3");
    expect(getDrawingSetIdentity({ drawing_set_name: " Same " })).toBe("name:Same");
  });
});

describe("filterDrawings", () => {
  const rows = [
    { id: "1", sheet_number: "S-101", title: "Framing", reviewer: "Alice", spec_section: "05 12 00", discipline: "Structural", stage: "IFA", priority_flag: false, due_date: PAST },
    { id: "2", sheet_number: "A-201", title: "Plan", reviewer: "Bob", spec_section: "09 00 00", discipline: "Architectural", stage: "Released", priority_flag: true },
    { id: "3", sheet_number: "S-102", title: "Details", reviewer: "Carol", discipline: "Structural", stage: "OFA", priority_flag: false, due_date: FUTURE },
  ];
  const all = { search: "", discipline: "ALL", stageFilter: "ALL" };
  it("returns all rows with no active filters", () => {
    expect(filterDrawings(rows, all)).toHaveLength(3);
  });
  it("searches sheet #, title, reviewer, spec section case-insensitively", () => {
    expect(filterDrawings(rows, { ...all, search: "framing" }).map(r => r.id)).toEqual(["1"]);
    expect(filterDrawings(rows, { ...all, search: "bob" }).map(r => r.id)).toEqual(["2"]);
    expect(filterDrawings(rows, { ...all, search: "05 12" }).map(r => r.id)).toEqual(["1"]);
  });
  it("filters by exact discipline", () => {
    expect(filterDrawings(rows, { ...all, discipline: "Structural" }).map(r => r.id)).toEqual(["1", "3"]);
  });
  it("handles _overdue / _priority / _inReview pseudo-stages and an exact stage", () => {
    expect(filterDrawings(rows, { ...all, stageFilter: "_overdue" }).map(r => r.id)).toEqual(["1"]);
    expect(filterDrawings(rows, { ...all, stageFilter: "_priority" }).map(r => r.id)).toEqual(["2"]);
    expect(filterDrawings(rows, { ...all, stageFilter: "_inReview" }).map(r => r.id)).toEqual(["1", "3"]);
    expect(filterDrawings(rows, { ...all, stageFilter: "OFA" }).map(r => r.id)).toEqual(["3"]);
  });
});

describe("groupByDrawingSetName", () => {
  it("groups by trimmed drawing_set_name, skipping blank/absent names", () => {
    const map = groupByDrawingSetName([
      { id: "1", drawing_set_name: "Set A" },
      { id: "2", drawing_set_name: " Set A " },
      { id: "3", drawing_set_name: "" },
      { id: "4" },
    ]);
    expect(Object.keys(map)).toEqual(["Set A"]);
    expect(map["Set A"].map(d => d.id)).toEqual(["1", "2"]);
  });
});

describe("computeExistingSetNames", () => {
  it("merges legacy grouping keys + parent set_names, deduped + sorted", () => {
    const names = computeExistingSetNames(
      { Beta: [], Alpha: [] },
      [{ set_name: "Gamma" }, { set_name: " Alpha " }, { set_name: "" }],
    );
    expect(names).toEqual(["Alpha", "Beta", "Gamma"]);
  });
});

describe("buildDrawingSetMap", () => {
  it("maps id → row, skipping rows without an id", () => {
    const map = buildDrawingSetMap([{ id: "a", set_name: "A" }, { set_name: "no id" }]);
    expect(Object.keys(map)).toEqual(["a"]);
    expect(map.a.set_name).toBe("A");
  });
});

describe("computeSelectedSetName", () => {
  const drawings = [
    { id: "1", drawing_set_name: "Set A" },
    { id: "2", drawing_set_name: "Set A" },
    { id: "3", drawing_set_name: "Set B" },
  ];
  it("returns the shared name when the whole selection is one set", () => {
    expect(computeSelectedSetName(new Set(["1", "2"]), drawings)).toBe("Set A");
  });
  it("returns null for an empty selection or one spanning multiple sets", () => {
    expect(computeSelectedSetName(new Set(), drawings)).toBeNull();
    expect(computeSelectedSetName(new Set(["1", "3"]), drawings)).toBeNull();
  });
});

describe("computeStagePipeline", () => {
  it("builds the 8 workflow stages (R&R first-class, 2026-07-25) and picks activeIdx from an explicit real-stage filter", () => {
    const r = computeStagePipeline({ submittals: [], drawingSetRecords: [], drawings: [], stageFilter: "OFA" });
    expect(r.pipeStages.map(s => s.id)).toEqual(["Not Started", "IFA", "OFA", "BFA", "R&R", "OFS", "IFC", "Released"]);
    expect(r.activeIdx).toBe(2); // OFA
  });
  it("buckets R&R submittals into the R&R chevron, not IFA", () => {
    const r = computeStagePipeline({
      submittals: [{ id: "s1", status: "Revise and Resubmit", ball_in_court: "Detailer", drawing_set_ids: ["set-1"] }],
      drawingSetRecords: [{ id: "set-1" }],
      drawings: [],
      stageFilter: "ALL",
    });
    expect(r.pipeStages.find(s => s.id === "R&R").count).toBe(1);
    expect(r.pipeStages.find(s => s.id === "IFA").count).toBe(0);
  });
  it("counts a package with no submittal (and no released sheet) in the Not Started bucket", () => {
    const r = computeStagePipeline({
      submittals: [],
      drawingSetRecords: [{ id: "s1" }],
      drawings: [],
      stageFilter: "ALL",
    });
    expect(r.pipeStages.find(s => s.id === "Not Started").count).toBe(1);
  });
});

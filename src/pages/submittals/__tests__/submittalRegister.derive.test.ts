import { describe, it, expect } from "vitest";
import {
  filterSubmittals,
  sortSubmittals,
  filterAndSortSubmittals,
  computeSubmittalStats,
  STATUS_GROUPS,
  getVisibleSelectionState,
} from "../submittalRegister.derive";
import type { DrawingSetsById, Submittal } from "../types";

/** Partial submittal fixture. Annotated `: any` on the factory so partial
 *  fixtures don't trip the noImplicitAny ratchet (agent-memory
 *  wave2-page-extraction-ratchets). */
function sub(over: any = {}): any {
  return {
    id: over.id || "s1",
    status: over.status ?? "Submitted",
    ball_in_court: over.ball_in_court ?? "EOR",
    submittal_number: over.submittal_number ?? "001",
    title: over.title ?? "Anchor Bolts",
    spec_section: over.spec_section ?? "051200",
    required_date: over.required_date ?? null,
    drawing_set_ids: over.drawing_set_ids ?? [],
    ...over,
  };
}

const emptySets: DrawingSetsById = new Map();

describe("STATUS_GROUPS", () => {
  it("keeps the grouped-status keys the KPI cards filter on in sync with the counts", () => {
    expect(STATUS_GROUPS.__pending).toEqual(["Submitted", "Under Review"]);
    expect(STATUS_GROUPS.__approved).toEqual(["Approved", "Approved as Noted", "Released for Fabrication"]);
    expect(STATUS_GROUPS.__rejected).toEqual(["Rejected", "Revise and Resubmit"]);
  });
});

describe("filterSubmittals", () => {
  const rows: Submittal[] = [
    sub({ id: "a", status: "Submitted", ball_in_court: "EOR", submittal_number: "001", title: "Anchor Bolts", spec_section: "051200" }),
    sub({ id: "b", status: "Under Review", ball_in_court: "AOR", submittal_number: "002", title: "Base Plates", spec_section: "051200" }),
    sub({ id: "c", status: "Approved", ball_in_court: "GC", submittal_number: "003", title: "Handrails", spec_section: "055000" }),
    sub({ id: "d", status: "Revise and Resubmit", ball_in_court: "EOR", submittal_number: "004", title: "Stair Stringers", spec_section: "055100" }),
    sub({ id: "e", status: "Released for Fabrication", ball_in_court: "GC", submittal_number: "005", title: "Beams", spec_section: "051200" }),
  ];

  it("returns all rows when no filters are active", () => {
    expect(filterSubmittals(rows, { filterStatus: "all", filterBIC: "all", search: "" })).toHaveLength(5);
  });

  it("__pending group matches Submitted + Under Review", () => {
    const out = filterSubmittals(rows, { filterStatus: "__pending", filterBIC: "all", search: "" });
    expect(out.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("__approved group matches Approved + Approved as Noted + Released for Fabrication", () => {
    const out = filterSubmittals(rows, { filterStatus: "__approved", filterBIC: "all", search: "" });
    expect(out.map((r) => r.id)).toEqual(["c", "e"]);
  });

  it("__rejected group matches Rejected + Revise and Resubmit", () => {
    const out = filterSubmittals(rows, { filterStatus: "__rejected", filterBIC: "all", search: "" });
    expect(out.map((r) => r.id)).toEqual(["d"]);
  });

  it("an exact status key filters by exact status (not a group)", () => {
    const out = filterSubmittals(rows, { filterStatus: "Approved", filterBIC: "all", search: "" });
    expect(out.map((r) => r.id)).toEqual(["c"]);
  });

  it("filters by ball-in-court", () => {
    const out = filterSubmittals(rows, { filterStatus: "all", filterBIC: "EOR", search: "" });
    expect(out.map((r) => r.id)).toEqual(["a", "d"]);
  });

  it("searches number / title / spec_section case-insensitively", () => {
    expect(filterSubmittals(rows, { filterStatus: "all", filterBIC: "all", search: "handrail" }).map((r) => r.id)).toEqual(["c"]);
    expect(filterSubmittals(rows, { filterStatus: "all", filterBIC: "all", search: "004" }).map((r) => r.id)).toEqual(["d"]);
    expect(filterSubmittals(rows, { filterStatus: "all", filterBIC: "all", search: "055000" }).map((r) => r.id)).toEqual(["c"]);
  });

  it("ignores whitespace-only search", () => {
    expect(filterSubmittals(rows, { filterStatus: "all", filterBIC: "all", search: "   " })).toHaveLength(5);
  });

  it("composes status group + BIC + search (AND semantics)", () => {
    const out = filterSubmittals(rows, { filterStatus: "__approved", filterBIC: "GC", search: "beam" });
    expect(out.map((r) => r.id)).toEqual(["e"]);
  });
});

describe("sortSubmittals", () => {
  it("orders by submittal number (numeric, case-insensitive) when no drawing sets", () => {
    const rows: Submittal[] = [sub({ id: "x", submittal_number: "010" }), sub({ id: "y", submittal_number: "002" })];
    const out = sortSubmittals(rows, emptySets);
    expect(out.map((r) => r.id)).toEqual(["y", "x"]);
  });

  it("does not mutate the input array", () => {
    const rows: Submittal[] = [sub({ id: "x", submittal_number: "010" }), sub({ id: "y", submittal_number: "002" })];
    const before = rows.map((r) => r.id);
    sortSubmittals(rows, emptySets);
    expect(rows.map((r) => r.id)).toEqual(before);
  });
});

describe("filterAndSortSubmittals", () => {
  it("filters then sorts (byte-identical to the page's `filtered` memo)", () => {
    const rows: Submittal[] = [
      sub({ id: "a", status: "Submitted", submittal_number: "010", title: "Zulu" }),
      sub({ id: "b", status: "Submitted", submittal_number: "002", title: "Alpha" }),
      sub({ id: "c", status: "Approved", submittal_number: "001", title: "Beta" }),
    ];
    const out = filterAndSortSubmittals(rows, { filterStatus: "__pending", filterBIC: "all", search: "" }, emptySets);
    // __pending keeps a + b; sorted by number → 002 (b), 010 (a)
    expect(out.map((r) => r.id)).toEqual(["b", "a"]);
  });
});

describe("computeSubmittalStats", () => {
  it("counts total, pending, approved, rejected", () => {
    const rows: Submittal[] = [
      sub({ status: "Submitted" }),
      sub({ status: "Under Review" }),
      sub({ status: "Approved" }),
      sub({ status: "Approved as Noted" }),
      sub({ status: "Released for Fabrication" }),
      sub({ status: "Rejected" }),
      sub({ status: "Revise and Resubmit" }),
      sub({ status: "Draft" }),
    ];
    const s = computeSubmittalStats(rows, "2026-07-05");
    expect(s.total).toBe(8);
    expect(s.pending).toBe(2); // Submitted + Under Review
    expect(s.approved).toBe(3); // Approved + Approved as Noted + Released for Fabrication
    expect(s.rejected).toBe(2); // Rejected + Revise and Resubmit
  });

  it("counts overdue: required_date in the past AND status is open", () => {
    const rows: Submittal[] = [
      sub({ status: "Submitted", required_date: "2020-01-01" }), // overdue
      sub({ status: "Under Review", required_date: "2099-01-01" }), // future → not overdue
      sub({ status: "Approved", required_date: "2020-01-01" }), // past but terminal → not overdue
      sub({ status: "Released for Fabrication", required_date: "2020-01-01" }), // terminal → not overdue
      sub({ status: "Void", required_date: "2020-01-01" }), // terminal → not overdue
      sub({ status: "Submitted", required_date: null }), // no date → not overdue
    ];
    const s = computeSubmittalStats(rows, "2026-07-05");
    expect(s.overdue).toBe(1);
  });
});

describe("getVisibleSelectionState", () => {
  it("selects only visible filtered rows, not hidden rows", () => {
    const rows = [sub({ id: "visible-a" }), sub({ id: "visible-b" })];
    expect(getVisibleSelectionState(rows, new Set(["visible-a", "hidden"]))).toEqual({
      allSelected: false,
      selectedVisibleCount: 1,
    });
    expect(getVisibleSelectionState(rows, new Set(["visible-a", "visible-b", "hidden"]))).toEqual({
      allSelected: true,
      selectedVisibleCount: 2,
    });
  });
});

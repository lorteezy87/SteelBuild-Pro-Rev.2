import { describe, it, expect } from "vitest";
import {
  isApprovedForFab,
  isApprovedForTurnover,
  isClaimable,
  groupBySet,
  groupByDate,
  buildFabManifestCsv,
  buildCsv,
  formatIsoDate,
  buildReadme,
  suggestPackageName,
  buildClaimsManifestCsv,
} from "../fabRelease.js";

const released = { id: "1", sheet_number: "S-001", title: "Foundation", drawing_set_name: "100% CD", stage: "Released", revision_number: "0", is_deleted: false };
const ifcApproved = { id: "2", sheet_number: "S-002", title: "Framing", drawing_set_name: "100% CD", stage: "BFA", ifc_status: "Approved", is_deleted: false };
const setApproved = { id: "3", sheet_number: "S-003", title: "Roof", drawing_set_name: "100% CD", stage: "BFA", set_approval_status: "approved", is_deleted: false };
const setApprovedAsNoted = { id: "4", sheet_number: "A-001", title: "Plan", drawing_set_name: "Architectural", set_approval_status: "approved_as_noted", is_deleted: false };
const inReview = { id: "5", sheet_number: "S-100", title: "Detail", drawing_set_name: "100% CD", stage: "OFA", is_deleted: false };
const deleted = { id: "6", sheet_number: "X", title: "X", stage: "Released", is_deleted: true };
const superseded = { id: "7", sheet_number: "S-001", title: "Old", drawing_set_name: "100% CD", stage: "Released", is_superseded: true, is_deleted: false };
const noSetName = { id: "8", sheet_number: "Z-1", title: "Misc", stage: "Released", is_deleted: false };

describe("isApprovedForFab", () => {
  it("accepts Released stage, set-approved, and ifc-approved drawings", () => {
    expect(isApprovedForFab(released)).toBe(true);
    expect(isApprovedForFab(ifcApproved)).toBe(true);
    expect(isApprovedForFab(setApproved)).toBe(true);
    expect(isApprovedForFab(setApprovedAsNoted)).toBe(true);
  });

  it("rejects in-review, deleted, and superseded drawings", () => {
    expect(isApprovedForFab(inReview)).toBe(false);
    expect(isApprovedForFab(deleted)).toBe(false);
    expect(isApprovedForFab(superseded)).toBe(false);
    expect(isApprovedForFab(null)).toBe(false);
  });
});

describe("isApprovedForTurnover", () => {
  it("matches fab approval rules", () => {
    expect(isApprovedForTurnover(released)).toBe(true);
    expect(isApprovedForTurnover(inReview)).toBe(false);
  });
});

describe("isClaimable", () => {
  it("accepts everything except soft-deleted rows", () => {
    expect(isClaimable(released)).toBe(true);
    expect(isClaimable(inReview)).toBe(true);
    expect(isClaimable(superseded)).toBe(true);
    expect(isClaimable(deleted)).toBe(false);
  });
});

describe("groupBySet", () => {
  it("groups by set name and pins ungrouped to the end", () => {
    const groups = groupBySet([released, ifcApproved, setApprovedAsNoted, noSetName]);
    expect(groups).toHaveLength(3);
    expect(groups[0].setName).toBe("100% CD");
    expect(groups[0].sheets.map((s) => s.id).sort()).toEqual(["1", "2"]);
    expect(groups[1].setName).toBe("Architectural");
    expect(groups[2].setName).toBe("(Ungrouped)");
  });

  it("returns empty for empty input", () => {
    expect(groupBySet([])).toEqual([]);
    expect(groupBySet(null)).toEqual([]);
  });

  it("sorts sheets within a set by sheet_number", () => {
    const a = { sheet_number: "S-002", drawing_set_name: "Set" };
    const b = { sheet_number: "S-001", drawing_set_name: "Set" };
    const groups = groupBySet([a, b]);
    expect(groups[0].sheets[0].sheet_number).toBe("S-001");
  });
});

describe("groupByDate", () => {
  it("buckets by yyyy-mm-dd, newest first, undated last", () => {
    const items = [
      { id: "a", created_at: "2026-05-01T10:00:00Z" },
      { id: "b", created_at: "2026-05-03T12:00:00Z" },
      { id: "c" },
    ];
    const groups = groupByDate(items, "created_at");
    expect(groups[0].date).toBe("2026-05-03");
    expect(groups[1].date).toBe("2026-05-01");
    expect(groups[2].date).toBe("Undated");
  });
});

describe("buildFabManifestCsv", () => {
  it("emits one row per drawing with header", () => {
    const csv = buildFabManifestCsv([released, ifcApproved], []);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(3); // header + 2
    expect(lines[0]).toContain("set_name");
    expect(lines[0]).toContain("sheet_number");
    expect(lines[1]).toContain("S-001");
    expect(lines[2]).toContain("S-002");
  });

  it("merges latest signoff per drawing", () => {
    const signoffs = [
      { drawing_id: "1", signed_by: "NL", signed_at: "2026-04-01", status: "Approved" },
      { drawing_id: "1", signed_by: "JM", signed_at: "2026-04-15", status: "Approved" },
    ];
    const csv = buildFabManifestCsv([released], signoffs);
    expect(csv).toContain("JM");
    expect(csv).toContain("2026-04-15");
    expect(csv).not.toMatch(/NL/);
  });

  it("escapes quotes in field values", () => {
    const odd = { id: "x", sheet_number: 'A"B', title: "say \"hi\"", is_deleted: false };
    const csv = buildFabManifestCsv([odd]);
    expect(csv).toContain('"A""B"');
    expect(csv).toContain('"say ""hi"""');
  });
});

describe("buildCsv", () => {
  it("quotes every field", () => {
    const csv = buildCsv(["a", "b"], [["1", "x,y"], ["2", "z"]]);
    expect(csv).toBe('"a","b"\n"1","x,y"\n"2","z"');
  });
});

describe("formatIsoDate", () => {
  it("returns yyyy-mm-dd", () => {
    expect(formatIsoDate(new Date("2026-05-03T12:00:00Z"))).toBe("2026-05-03");
    expect(formatIsoDate("2026-01-15T00:00:00Z")).toBe("2026-01-15");
  });

  it("falls back to today on bad input", () => {
    const out = formatIsoDate("not a date");
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("buildReadme", () => {
  it("includes project header and per-set listing", () => {
    const groups = groupBySet([released, ifcApproved]);
    const md = buildReadme({
      kind: "Fab Release",
      project: { id: "p1", name: "Capstone" },
      groups,
      now: new Date("2026-05-03T00:00:00Z"),
    });
    expect(md).toContain("# Fab Release Package");
    expect(md).toContain("**Project:** Capstone");
    expect(md).toContain("**Generated:** 2026-05-03");
    expect(md).toContain("### 100% CD");
    expect(md).toContain("S-001");
    expect(md).toContain("S-002");
  });

  it("notes fallback mode when zipped=false", () => {
    const md = buildReadme({ zipped: false, project: { name: "P" }, groups: [] });
    expect(md).toContain("fallback mode");
  });

  it("omits fallback note when zipped=true", () => {
    const md = buildReadme({ zipped: true, project: { name: "P" }, groups: [] });
    expect(md).not.toContain("fallback mode");
  });

  it("handles empty groups gracefully", () => {
    const md = buildReadme({ groups: [], project: { name: "P" } });
    expect(md).toContain("No items match");
  });
});

describe("suggestPackageName", () => {
  it("sanitizes project names and includes date + kind", () => {
    const now = new Date("2026-05-03T12:00:00Z");
    expect(suggestPackageName({ kind: "fab_release", project: { name: "24426 Capstone / Phase 1" }, now }))
      .toBe("24426_Capstone_Phase_1_fab_release_2026-05-03");
  });

  it("falls back when project name is missing", () => {
    const now = new Date("2026-05-03T00:00:00Z");
    expect(suggestPackageName({ kind: "claims", now })).toBe("project_claims_2026-05-03");
  });
});

describe("buildClaimsManifestCsv", () => {
  it("interleaves drawings, rfis, change orders, photos", () => {
    const csv = buildClaimsManifestCsv({
      drawings: [{ id: "d1", sheet_number: "S-1", title: "T", created_at: "2026-04-01T00:00:00Z", stage: "Released" }],
      rfis: [{ id: "r1", rfi_number: "RFI-001", subject: "Q?", submitted_date: "2026-04-15", status: "Open", question: "Why" }],
      changeOrders: [{ id: "co1", co_number: "CO-1", title: "Add", issued_date: "2026-04-20", status: "Approved" }],
      photos: [{ id: "p1", caption: "Site", taken_at: "2026-04-25" }],
    });
    expect(csv).toContain("drawing");
    expect(csv).toContain("rfi");
    expect(csv).toContain("change_order");
    expect(csv).toContain("photo");
    expect(csv).toContain("RFI-001");
    expect(csv).toContain("CO-1");
  });

  it("sorts rows newest first", () => {
    const csv = buildClaimsManifestCsv({
      drawings: [
        { id: "d1", sheet_number: "S-1", created_at: "2026-04-01" },
        { id: "d2", sheet_number: "S-2", created_at: "2026-04-15" },
      ],
    });
    const lines = csv.split("\n");
    // header is line 0; first data line should be the newer date
    expect(lines[1]).toContain("2026-04-15");
    expect(lines[2]).toContain("2026-04-01");
  });
});

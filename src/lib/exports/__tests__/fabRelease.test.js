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

const released = {
  id: "1",
  sheet_number: "S-001",
  title: "Foundation",
  drawing_set_name: "100% CD",
  drawing_set_id: "set-1",
  stage: "Released",
  revision_number: "0",
  is_deleted: false,
};
const ifcStage = {
  id: "2",
  sheet_number: "S-002",
  title: "Framing",
  drawing_set_name: "100% CD",
  drawing_set_id: "set-1",
  stage: "IFC",
  is_deleted: false,
};
const bareSetApproved = {
  id: "3",
  sheet_number: "S-003",
  title: "Roof",
  drawing_set_name: "100% CD",
  drawing_set_id: "set-1",
  stage: "BFA",
  set_approval_status: "approved",
  is_deleted: false,
};
const bareIfcStatus = {
  id: "4",
  sheet_number: "A-001",
  title: "Plan",
  drawing_set_name: "Architectural",
  drawing_set_id: "set-2",
  stage: "BFA",
  ifc_status: "Approved",
  is_deleted: false,
};
const inReview = {
  id: "5",
  sheet_number: "S-100",
  title: "Detail",
  drawing_set_name: "100% CD",
  drawing_set_id: "set-1",
  stage: "OFA",
  is_deleted: false,
};
const deleted = { id: "6", sheet_number: "X", title: "X", stage: "Released", is_deleted: true };
const superseded = {
  id: "7",
  sheet_number: "S-001",
  title: "Old",
  drawing_set_name: "100% CD",
  stage: "Released",
  is_superseded: true,
  is_deleted: false,
};
const noSetName = { id: "8", sheet_number: "Z-1", title: "Misc", stage: "Released", is_deleted: false };

describe("isApprovedForFab (Slice 8 IFC/Released)", () => {
  it("accepts Released / IFC stage and submittal-derived IFC", () => {
    expect(isApprovedForFab(released)).toBe(true);
    expect(isApprovedForFab(ifcStage)).toBe(true);
    expect(
      isApprovedForFab(
        { id: "9", drawing_set_id: "set-1", stage: "OFS", is_deleted: false },
        {
          submittals: [
            {
              id: "s1",
              status: "Approved",
              ball_in_court: "GC",
              drawing_set_ids: ["set-1"],
            },
          ],
        },
      ),
    ).toBe(true);
  });

  it("rejects bare set_approval_status / ifc_status and pre-IFC stages", () => {
    expect(isApprovedForFab(bareSetApproved)).toBe(false);
    expect(isApprovedForFab(bareIfcStatus)).toBe(false);
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
    const groups = groupBySet([released, ifcStage, { ...bareIfcStatus, stage: "Released" }, noSetName]);
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
    const csv = buildFabManifestCsv([released, ifcStage], []);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(3); // header + 2
    expect(lines[0]).toContain("set_name");
    expect(lines[0]).toContain("sheet_number");
  });
});

describe("buildCsv / formatIsoDate / suggestPackageName / buildReadme", () => {
  it("builds csv and package metadata", () => {
    expect(buildCsv(["a", "b"], [["1", "2"]])).toContain('"a"');
    expect(formatIsoDate(new Date("2026-05-03T12:00:00Z"))).toMatch(/2026-05-03/);
    expect(suggestPackageName({ kind: "fab_release", project: { name: "Mesa" }, now: new Date("2026-05-03T12:00:00Z") })).toContain("Mesa");
    expect(buildReadme({ project: { name: "Mesa" }, groups: [{ setName: "S", sheets: [released] }] })).toContain("Mesa");
  });
});

describe("buildClaimsManifestCsv", () => {
  it("includes drawings and rfis", () => {
    const csv = buildClaimsManifestCsv({
      drawings: [released],
      rfis: [{ id: "r1", rfi_number: "RFI-1", title: "Q", status: "Open" }],
      changeOrders: [],
      photos: [],
    });
    expect(csv).toContain("drawing");
    expect(csv).toContain("rfi");
  });
});

import { describe, expect, it } from "vitest";
import {
  collectAppliedPieceIds,
  collectAppliedPiecesByWpNumber,
  countWpHints,
  describeAppliedAssignment,
  describeImportAssignResult,
  summarizeAppliedAssignment,
} from "../importAssign";

describe("collectAppliedPieceIds", () => {
  it("returns unique piece ids from applied create/update rows", () => {
    expect(
      collectAppliedPieceIds([
        { matched_piece_id: "p1", resolution: "applied_create" },
        { matched_piece_id: "p2", resolution: "applied_update" },
        { matched_piece_id: "p1", resolution: "applied_create" },
        { matched_piece_id: "p3", resolution: "skipped_conflict" },
        { matched_piece_id: null, resolution: "applied_create" },
      ]),
    ).toEqual(["p1", "p2"]);
  });
});

describe("collectAppliedPiecesByWpNumber", () => {
  it("groups applied pieces by CSV wp_number hints", () => {
    expect(
      collectAppliedPiecesByWpNumber([
        {
          matched_piece_id: "p1",
          resolution: "applied_create",
          original_payload: { wp_number: "WP-001" },
        },
        {
          matched_piece_id: "p2",
          resolution: "applied_update",
          original_payload: { work_package_number: "WP-001" },
        },
        {
          matched_piece_id: "p3",
          resolution: "applied_create",
          original_payload: { wp_number: "WP-004" },
        },
        {
          matched_piece_id: "p4",
          resolution: "skipped_conflict",
          original_payload: { wp_number: "WP-001" },
        },
        {
          matched_piece_id: "p5",
          resolution: "applied_create",
          original_payload: {},
        },
      ]),
    ).toEqual({
      "WP-001": ["p1", "p2"],
      "WP-004": ["p3"],
    });
  });

  it("countWpHints counts applied pieces that carry a hint", () => {
    expect(
      countWpHints([
        { matched_piece_id: "p1", resolution: "applied_create", original_payload: { wp_number: "WP-001" } },
        { matched_piece_id: "p2", resolution: "applied_create", original_payload: {} },
      ]),
    ).toBe(1);
  });
});

const appliedRows = [
  { matched_piece_id: "p1", resolution: "applied_create" },
  { matched_piece_id: "p2", resolution: "applied_create" },
  { matched_piece_id: "p3", resolution: "applied_update" },
  { matched_piece_id: "p4", resolution: "skipped_conflict" },
];
const labelFor = (id: string) => ({ wp14: "WP-014 · Main Steel", wp2: "WP-002 · Mezz" }[id] ?? id);

describe("summarizeAppliedAssignment", () => {
  it("reads the live register, not the import, and reports one bucket when everything is in one package", () => {
    const summary = summarizeAppliedAssignment(
      appliedRows,
      [
        { id: "p1", work_package_id: "wp14" },
        { id: "p2", work_package_id: "wp14" },
        { id: "p3", work_package_id: "wp14" },
        { id: "p4", work_package_id: null },
      ],
      labelFor,
    );
    expect(summary).toEqual({
      pieceCount: 3,
      buckets: [{ workPackageId: "wp14", label: "WP-014 · Main Steel", count: 3 }],
      unassigned: 0,
    });
    expect(describeAppliedAssignment(summary)).toBe("3 of 3 imported pieces are in WP-014 · Main Steel.");
  });

  it("splits mixed assignment with the unassigned bucket last and skips pieces not in the register", () => {
    const summary = summarizeAppliedAssignment(
      appliedRows,
      [
        { id: "p1", work_package_id: "wp14" },
        { id: "p2", work_package_id: null },
        { id: "p3", work_package_id: "wp2" },
        // p4 archived → absent
      ],
      labelFor,
    );
    expect(summary.pieceCount).toBe(3);
    expect(summary.unassigned).toBe(1);
    expect(summary.buckets.map((b) => b.label)).toEqual(["WP-002 · Mezz", "WP-014 · Main Steel", "unassigned"]);
    expect(describeAppliedAssignment(summary)).toBe(
      "3 imported pieces: 1 in WP-002 · Mezz, 1 in WP-014 · Main Steel, 1 unassigned.",
    );
  });

  it("says so when nothing is assigned yet", () => {
    const summary = summarizeAppliedAssignment(appliedRows, [{ id: "p1" }, { id: "p2" }], labelFor);
    expect(describeAppliedAssignment(summary)).toBe("2 imported pieces are not assigned to a work package yet.");
    expect(describeAppliedAssignment({ pieceCount: 0, buckets: [], unassigned: 0 })).toMatch(/No applied pieces/);
  });
});

describe("describeImportAssignResult", () => {
  const base = { assigned: 0, unchanged: 0, linked: 0, pieceCount: 204, sheetHintCount: 0, wpHintCount: 0, targetLabel: null as string | null };

  it("reports 'already in' instead of 'no hints' when the package was applied earlier", () => {
    expect(describeImportAssignResult({ ...base, unchanged: 204, targetLabel: "WP-014 · Main Steel" })).toEqual({
      tone: "info",
      message: "204 already in WP-014 · Main Steel · no drawing sheet hints in this import.",
    });
  });

  it("celebrates real work", () => {
    expect(describeImportAssignResult({ ...base, assigned: 120, unchanged: 84, linked: 3, sheetHintCount: 5, targetLabel: "WP-014" })).toEqual({
      tone: "success",
      message: "120 pieces assigned to WP-014 · 84 already in WP-014 · 3 drawing links.",
    });
  });

  it("explains the hint path when no package is picked", () => {
    expect(describeImportAssignResult(base).message).toBe(
      "No work package hints in this import (pick a package above, or add a wp_number column) · no drawing sheet hints in this import.",
    );
    expect(describeImportAssignResult({ ...base, wpHintCount: 10, unchanged: 10 }).message).toMatch(/^10 already in their hinted package/);
    expect(describeImportAssignResult({ ...base, wpHintCount: 10 }).message).toMatch(/did not match any active package/);
    expect(describeImportAssignResult({ ...base, sheetHintCount: 4 }).message).toMatch(/no new drawing links/);
  });

  it("warns when the batch has nothing applied", () => {
    expect(describeImportAssignResult({ ...base, pieceCount: 0 }).tone).toBe("warning");
  });
});

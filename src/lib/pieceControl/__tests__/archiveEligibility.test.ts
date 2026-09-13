import { describe, expect, it } from "vitest";
import {
  partitionArchiveSelection,
  type ArchiveEligibilityRow,
} from "../archiveEligibility";

// Parity with the client-visible archive_piece_lots guards
// (20260720213000_archive_canonical_pieces.sql): split lot, then held or
// production-started. Sentry JAVASCRIPT-REACT-2D.

function piece(id: string, patch: Partial<ArchiveEligibilityRow> = {}): ArchiveEligibilityRow {
  return {
    id,
    piece_mark: id.toUpperCase(),
    lot_code: "A",
    parent_piece_id: null,
    lifecycle_status: "not_started",
    current_station: null,
    on_hold: false,
    is_container: false,
    is_deleted: false,
    deleted_at: null,
    ...patch,
  };
}

function partition(rows: ArchiveEligibilityRow[], selected: string[]) {
  return partitionArchiveSelection(rows, new Set(selected));
}

describe("partitionArchiveSelection", () => {
  it("keeps an eligible not-started piece archivable", () => {
    expect(partition([piece("p1")], ["p1"])).toEqual({ archivableIds: ["p1"], blocked: [] });
  });

  it.each([
    { label: "on hold", row: piece("p2", { on_hold: true }), reason: "held" },
    {
      label: "lifecycle past not_started",
      row: piece("p2", { lifecycle_status: "fabricated" }),
      reason: "production_started",
    },
    {
      label: "at a station while still not_started",
      row: piece("p2", { current_station: "fit-up" }),
      reason: "production_started",
    },
    { label: "a split container", row: piece("p2", { is_container: true }), reason: "split_lot" },
    { label: "a split child lot", row: piece("p2", { parent_piece_id: "root" }), reason: "split_lot" },
  ] as const)("blocks a piece that is $label as $reason", ({ row, reason }) => {
    expect(partition([piece("p1"), row], ["p1", "p2"])).toEqual({
      archivableIds: ["p1"],
      blocked: [{ id: "p2", pieceMark: "P2", lotCode: "A", reason }],
    });
  });

  it("blocks a parent with an active child among the loaded rows", () => {
    const rows = [piece("parent"), piece("child", { parent_piece_id: "parent", lot_code: "B" })];
    expect(partition(rows, ["parent"])).toEqual({
      archivableIds: [],
      blocked: [{ id: "parent", pieceMark: "PARENT", lotCode: "A", reason: "split_lot" }],
    });
  });

  it("does not block a parent whose only child is archived", () => {
    const rows = [
      piece("parent"),
      piece("child", { parent_piece_id: "parent", is_deleted: true, deleted_at: "2026-09-01T00:00:00.000Z" }),
    ];
    expect(partition(rows, ["parent"]).archivableIds).toEqual(["parent"]);
  });

  it("reports a split lot before a hold, matching the SQL guard order", () => {
    const rows = [piece("p2", { is_container: true, on_hold: true })];
    expect(partition(rows, ["p2"]).blocked[0]?.reason).toBe("split_lot");
  });

  it("drops selected ids that are not in the loaded rows", () => {
    expect(partition([piece("p1")], ["p1", "gone"])).toEqual({
      archivableIds: ["p1"],
      blocked: [],
    });
  });

  it("ignores rows that are not selected", () => {
    expect(partition([piece("p1"), piece("p2", { on_hold: true })], ["p1"])).toEqual({
      archivableIds: ["p1"],
      blocked: [],
    });
  });
});

import { describe, it, expect } from "vitest";
import {
  buildRowsByGuid,
  findGuidsByMark,
  buildFabLegend,
  summarizeSelection,
  describeSelection,
  FAB_LEGEND_ORDER,
} from "@/lib/ifc/viewerSelection";
import {
  buildMarkByGuid,
  buildSeqByGuid,
  buildFabByGuid,
  buildCanonicalPieceByGuid,
  CANONICAL_PIECE_COLORS,
} from "@/lib/ifc/viewerColoring";
import { FAB_STATUS_META } from "@/lib/fabStatus";

// Roster: assembly 1B1 (two parts, linked to piece p1), 1B10 (one part, linked
// to p2 which is on hold), C12 (legacy fab_status only), and an unlinked plate.
const rows = [
  { element_guid: "g1", piece_mark: "1B1", sequence_number: "1", piece_id: "p1", fab_status: "fabricated" },
  { element_guid: "g2", piece_mark: "1b1", sequence_number: "1", piece_id: "p1", fab_status: "fabricated" },
  { element_guid: "g3", piece_mark: "1B10", sequence_number: "2", piece_id: "p2", fab_status: null },
  { element_guid: "g4", piece_mark: "C12", sequence_number: "2", piece_id: null, fab_status: "shipped" },
  { element_guid: "g5", piece_mark: "PL1", sequence_number: null, piece_id: null, fab_status: null },
  { element_guid: "gone", piece_mark: "1B1", piece_id: "p1", is_deleted: true },
];
const pieces = [
  { id: "p1", lifecycle_status: "fabricated", on_hold: false, is_container: false, is_deleted: false, deleted_at: null },
  { id: "p2", lifecycle_status: "delivered", on_hold: true, is_container: false, is_deleted: false, deleted_at: null },
];
const markByGuid = buildMarkByGuid(rows);
const seqByGuid = buildSeqByGuid(rows);
const fabByGuid = buildFabByGuid(rows);
const canonicalPieceByGuid = buildCanonicalPieceByGuid(rows, pieces);
const rowsByGuid = buildRowsByGuid(rows);

describe("findGuidsByMark", () => {
  it("prefers an exact (normalized) match over prefix matches", () => {
    const r = findGuidsByMark(" 1b1 ", markByGuid);
    expect(r.matchKind).toBe("exact");
    expect(r.guids.sort()).toEqual(["g1", "g2"]);
    expect(r.marks).toEqual(["1B1"]);
  });

  it("falls back to prefix, then contains, with natural mark ordering", () => {
    const prefix = findGuidsByMark("1B", markByGuid);
    expect(prefix.matchKind).toBe("prefix");
    expect(prefix.marks).toEqual(["1B1", "1B10"]);
    const contains = findGuidsByMark("L1", markByGuid);
    expect(contains.matchKind).toBe("contains");
    expect(contains.guids).toEqual(["g5"]);
  });

  it("returns an empty result for blank or unknown queries", () => {
    expect(findGuidsByMark("", markByGuid).guids).toEqual([]);
    expect(findGuidsByMark("ZZZ", markByGuid).matchKind).toBe("none");
  });
});

describe("buildFabLegend", () => {
  it("buckets parts exactly the way Fab mode paints them", () => {
    const legend = buildFabLegend({ rows, canonicalPieceByGuid, fabByGuid });
    const byKey = Object.fromEntries(legend.map((b) => [b.key, b]));
    expect(legend.map((b) => b.key)).toEqual(FAB_LEGEND_ORDER);
    expect(byKey.fabricated.guids.sort()).toEqual(["g1", "g2"]); // canonical p1
    expect(byKey.hold.guids).toEqual(["g3"]);                    // p2 on hold beats "delivered"
    expect(byKey.delivered.count).toBe(0);
    expect(byKey.shipped.guids).toEqual(["g4"]);                 // legacy fab_status
    expect(byKey.unlinked.guids).toEqual(["g5"]);                // no status at all
    expect(byKey.hold.color).toBe(CANONICAL_PIECE_COLORS.hold);
    expect(byKey.fabricated.color).toBe(FAB_STATUS_META.fabricated.color);
  });

  it("skips soft-deleted roster rows", () => {
    const legend = buildFabLegend({ rows, canonicalPieceByGuid, fabByGuid });
    const all = legend.flatMap((b) => b.guids);
    expect(all).not.toContain("gone");
  });
});

describe("summarizeSelection", () => {
  const ctx = { markByGuid, seqByGuid, canonicalPieceByGuid, rowsByGuid };

  it("dedupes canonical pieces across parts and reports marks/sequences", () => {
    const s = summarizeSelection(["g1", "g2", "g5", "g2"], ctx);
    expect(s.count).toBe(3);
    expect(s.marks).toEqual(["1B1", "PL1"]);
    expect(s.sequences).toEqual(["1"]);
    expect(s.pieces.map((p) => p.id)).toEqual(["p1"]);
    expect(s.linkedCount).toBe(2);
    expect(s.unlinkedCount).toBe(1);
    expect(s.lifecycle).toEqual([{ key: "fabricated", label: "Fabricated", count: 1 }]);
  });

  it("enables only the logistics action the whole selection is eligible for", () => {
    const s = summarizeSelection(["g1"], ctx);
    const byAction = Object.fromEntries(s.actions.map((a) => [a.action, a]));
    expect(byAction.ship.enabled).toBe(true);
    expect(byAction.ship.pieceIds).toEqual(["p1"]);
    expect(byAction.deliver.enabled).toBe(false);
    expect(byAction.deliver.reason).toMatch(/Shipped status is required/);
    expect(byAction.erect.enabled).toBe(false);
  });

  it("blocks every action when a selected piece is on hold, and explains why", () => {
    const s = summarizeSelection(["g1", "g3"], ctx);
    expect(s.holdCount).toBe(1);
    expect(s.actions.every((a) => !a.enabled)).toBe(true);
    const held = summarizeSelection(["g3"], ctx);
    expect(held.actions.find((a) => a.action === "erect").reason).toMatch(/hold/i);
  });

  it("explains when nothing linked is selected", () => {
    const s = summarizeSelection(["g4", "g5"], ctx);
    expect(s.pieces).toEqual([]);
    expect(s.actions[0].reason).toMatch(/No linked pieces/);
    expect(describeSelection(s)).toBe("2 parts · 2 marks");
  });

  it("describeSelection mentions holds", () => {
    const s = summarizeSelection(["g3"], ctx);
    expect(describeSelection(s)).toBe("1 part · 1 mark · 1 on hold");
    expect(describeSelection(summarizeSelection([], ctx))).toBe("");
  });
});

import { describe, it, expect } from "vitest";
import {
  buildFabByGuid, buildSeqByGuid, buildStatusByGuid, colorFnFor, seqColor, TYPE_PALETTE,
} from "@/lib/ifc/viewerColoring";
import { FAB_STATUS_META } from "@/lib/fabStatus";

// Simulates a saved roster: one assembly (A1) with two parts, plus a part in B2.
// This is what model_elements looks like after "Save model" + assigning fab status
// to assembly A1 (the UPDATE sets fab_status on every part sharing piece_mark).
const rows = [
  { element_guid: "g-a1-p1", piece_mark: "A1", sequence_number: "1", fab_status: "fabricated" },
  { element_guid: "g-a1-p2", piece_mark: "A1", sequence_number: "1", fab_status: "fabricated" },
  { element_guid: "g-b2-p1", piece_mark: "B2", sequence_number: "2", fab_status: null },
];

describe("Fab status coloring (manual assignment)", () => {
  it("maps every part of an assigned assembly to its fab status, leaves others native", () => {
    const fab = buildFabByGuid(rows);
    expect(fab.get("g-a1-p1")).toBe("fabricated");
    expect(fab.get("g-a1-p2")).toBe("fabricated"); // whole assembly, both parts
    expect(fab.has("g-b2-p1")).toBe(false);          // unassigned → not in the map → native
  });

  it("colorFnFor('fab') paints assigned parts the status color, unassigned → native (null)", () => {
    const fn = colorFnFor("fab", { fabByGuid: buildFabByGuid(rows) });
    expect(fn({ guid: "g-a1-p1" })).toBe(FAB_STATUS_META.fabricated.color);
    expect(fn({ guid: "g-a1-p2" })).toBe(FAB_STATUS_META.fabricated.color);
    expect(fn({ guid: "g-b2-p1" })).toBeNull();      // unassigned
    expect(fn({ guid: "not-in-model" })).toBeNull(); // unknown
  });

  it("reflects a status change without rebuilding anything else (re-derive on new rows)", () => {
    const after = rows.map((r) => (r.piece_mark === "B2" ? { ...r, fab_status: "shipped" } : r));
    const fn = colorFnFor("fab", { fabByGuid: buildFabByGuid(after) });
    expect(fn({ guid: "g-b2-p1" })).toBe(FAB_STATUS_META.shipped.color);
  });
});

describe("other color modes", () => {
  it("sequence: same sequence → same stable color; different → different", () => {
    const seq = buildSeqByGuid(rows);
    const fn = colorFnFor("sequence", { seqByGuid: seq });
    expect(fn({ guid: "g-a1-p1" })).toBe(fn({ guid: "g-a1-p2" })); // both seq 1
    expect(fn({ guid: "g-a1-p1" })).not.toBe(fn({ guid: "g-b2-p1" })); // seq 1 vs 2
    expect(seqColor("")).toBeNull();
  });

  it("type: colors by member type, unknown → 'other'", () => {
    const fn = colorFnFor("type", {});
    expect(fn({ ifcType: "beam" })).toBe(TYPE_PALETTE.beam);
    expect(fn({ ifcType: "column" })).toBe(TYPE_PALETTE.column);
    expect(fn({ ifcType: "whatever" })).toBe(TYPE_PALETTE.other);
  });

  it("status: excludes 'unmapped' (those keep native), colors the rest", () => {
    const mapping = { guidsByStatus: { unmapped: ["u1"], fab_ready: ["f1"] } };
    const fn = colorFnFor("status", { statusByGuid: buildStatusByGuid(mapping) });
    expect(fn({ guid: "u1" })).toBeNull();   // unmapped → native
    expect(fn({ guid: "f1" })).toBeTruthy(); // fab_ready → colored
  });

  it("model: always native (null)", () => {
    expect(colorFnFor("model", {})({ guid: "g-a1-p1", ifcType: "beam" })).toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import {
  buildFabByGuid, buildSeqByGuid, buildStatusByGuid,
  buildMarkByGuid, buildFabByMark, buildSeqByMark, buildStatusByMark,
  colorFnFor, seqColor, TYPE_PALETTE,
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

describe("mark-keyed fallback (CSV rosters / multi-part assemblies)", () => {
  // The model renders parts by GUID. Here the roster mixes IFC rows (with GUIDs)
  // and CSV-sourced data keyed only by piece mark. markByGuid bridges a rendered
  // part's GUID -> its normalized mark so the mark-keyed maps can color it.
  const ifcRows = [
    { element_guid: "g-a1-p1", piece_mark: "a1" }, // note lowercase → normalizes to A1
    { element_guid: "g-a1-p2", piece_mark: "A1" },
    { element_guid: "g-b2-p1", piece_mark: "B2" },
  ];

  it("buildMarkByGuid normalizes the mark and only maps GUID-bearing rows", () => {
    const m = buildMarkByGuid([...ifcRows, { element_guid: null, piece_mark: "C3" }]);
    expect(m.get("g-a1-p1")).toBe("A1");
    expect(m.get("g-b2-p1")).toBe("B2");
    expect(m.size).toBe(3); // the guid-less row is not a bridge entry
  });

  it("fab: colors every part of an assembly from a single mark-keyed status", () => {
    // CSV/production data set fab_status on the assembly mark, no per-GUID rows.
    const fabByMark = buildFabByMark([{ piece_mark: "A1", fab_status: "shipped" }]);
    const markByGuid = buildMarkByGuid(ifcRows);
    const fn = colorFnFor("fab", { fabByGuid: buildFabByGuid([]), markByGuid, fabByMark });
    // Both parts of A1 color, even though neither GUID is in any fab-by-GUID map.
    expect(fn({ guid: "g-a1-p1" })).toBe(FAB_STATUS_META.shipped.color);
    expect(fn({ guid: "g-a1-p2" })).toBe(FAB_STATUS_META.shipped.color);
    expect(fn({ guid: "g-b2-p1" })).toBeNull(); // B2 has no status → native
  });

  it("fab: GUID-keyed status wins over the mark fallback", () => {
    const fabByGuid = buildFabByGuid([{ element_guid: "g-a1-p1", piece_mark: "A1", fab_status: "fabricated" }]);
    const fabByMark = buildFabByMark([{ piece_mark: "A1", fab_status: "shipped" }]);
    const fn = colorFnFor("fab", { fabByGuid, markByGuid: buildMarkByGuid(ifcRows), fabByMark });
    expect(fn({ guid: "g-a1-p1" })).toBe(FAB_STATUS_META.fabricated.color); // GUID wins
    expect(fn({ guid: "g-a1-p2" })).toBe(FAB_STATUS_META.shipped.color);    // falls back to mark
  });

  it("sequence: a mark-keyed sequence colors all parts sharing the mark", () => {
    const seqByMark = buildSeqByMark([{ piece_mark: "B2", sequence_number: "5" }]);
    const fn = colorFnFor("sequence", { seqByGuid: buildSeqByGuid([]), markByGuid: buildMarkByGuid(ifcRows), seqByMark });
    expect(fn({ guid: "g-b2-p1" })).toBe(seqColor("5"));
    expect(fn({ guid: "g-a1-p1" })).toBeNull(); // A1 has no sequence
  });

  it("status: falls back to a mark-keyed bucket color (excludes unmapped)", () => {
    const statusByMark = buildStatusByMark({ marksByStatus: { unmapped: ["B2"], fab_ready: ["A1"] } });
    const fn = colorFnFor("status", { statusByGuid: buildStatusByGuid({ guidsByStatus: {} }), markByGuid: buildMarkByGuid(ifcRows), statusByMark });
    expect(fn({ guid: "g-a1-p1" })).toBeTruthy(); // A1 → fab_ready color
    expect(fn({ guid: "g-b2-p1" })).toBeNull();   // B2 → unmapped → native
  });

  it("no mark maps supplied → identical to the original GUID-only behavior", () => {
    const fabByGuid = buildFabByGuid([{ element_guid: "g-a1-p1", piece_mark: "A1", fab_status: "shipped" }]);
    const fn = colorFnFor("fab", { fabByGuid }); // no markByGuid/fabByMark
    expect(fn({ guid: "g-a1-p1" })).toBe(FAB_STATUS_META.shipped.color);
    expect(fn({ guid: "g-a1-p2" })).toBeNull(); // unknown GUID, no fallback → native
  });

  it("a part whose GUID has no mark bridge stays native (no crash)", () => {
    const fabByMark = buildFabByMark([{ piece_mark: "A1", fab_status: "shipped" }]);
    const fn = colorFnFor("fab", { markByGuid: new Map(), fabByMark });
    expect(fn({ guid: "ghost" })).toBeNull();
    expect(fn({})).toBeNull(); // no guid at all
  });
});

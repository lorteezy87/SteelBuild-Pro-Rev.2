import { describe, expect, it } from "vitest";
import { detectHeaderMap, parseModelElementsCsv } from "@/lib/importModelElements";

const TEKLA_CSV = [
  "Piece Mark,Assembly Mark,Profile,Grade,Qty,Weight (kg),Sequence,Area,Drawing,GUID",
  '1B1,A1,W12X26,A992,2,"1,250.5",SEQ-1,Bldg 1,S-101,2O2Fr$t4X7Zf8NOew3FNr1',
  "1B2,A1,W12X26,A992,1,820,SEQ-1,Bldg 1,S-102,",
  "2C1,A2,HSS6X6X1/2,A500,4,455,SEQ-2,Bldg 2,S-999,",
  ",A3,W8X10,A36,1,100,SEQ-2,Bldg 2,S-103,",
  "1B1,A1,W12X26,A992,2,1250,SEQ-1,Bldg 1,S-101,",
].join("\r\n");

const DRAWINGS = [
  { id: "d-101", sheet_number: "S-101", drawing_set_id: "set-1" },
  { id: "d-102", sheet_number: "s-102 ", drawing_set_id: "set-1" },
  // duplicate sheet number -> ambiguous, never auto-linked
  { id: "d-999a", sheet_number: "S-999", drawing_set_id: "set-2" },
  { id: "d-999b", sheet_number: "S-999", drawing_set_id: "set-3" },
];

describe("detectHeaderMap", () => {
  it("matches common Tekla/SDS2 header aliases case-insensitively", () => {
    const map = detectHeaderMap(["PIECE MARK", "Assy Mark", "Section", "Lot #", "Dwg", "IFC GUID"]);
    expect(map).toMatchObject({ piece_mark: 0, assembly_mark: 1, profile: 2, sequence_number: 3, drawing_no: 4, element_guid: 5 });
  });

  it("returns null when no piece-mark column exists", () => {
    expect(detectHeaderMap(["Profile", "Qty", "Drawing"])).toBeNull();
  });
});

describe("parseModelElementsCsv", () => {
  it("fails cleanly on an empty file or unrecognizable header", () => {
    expect(parseModelElementsCsv("").ok).toBe(false);
    const noMark = parseModelElementsCsv("Profile,Qty\nW12X26,2");
    expect(noMark.ok).toBe(false);
    expect(noMark.error).toMatch(/piece-mark/i);
  });

  it("parses rows, coerces numbers, defaults qty, and keeps raw drawing refs", () => {
    const r = parseModelElementsCsv(TEKLA_CSV, { drawings: DRAWINGS });
    expect(r.ok).toBe(true);

    const b1 = r.rows.find((x) => x.piece_mark === "1B1");
    expect(b1).toMatchObject({
      action: "create",
      assembly_mark: "A1",
      profile: "W12X26",
      material_grade: "A992",
      quantity: 2,
      weight_kg: 1250.5, // quoted thousands-separated value
      sequence_number: "SEQ-1",
      erection_area: "Bldg 1",
      drawing_no: "S-101",
      element_guid: "2O2Fr$t4X7Zf8NOew3FNr1",
      source: "csv",
    });
  });

  it("links drawings only on exact normalized sheet match; duplicates are ambiguous", () => {
    const r = parseModelElementsCsv(TEKLA_CSV, { drawings: DRAWINGS });
    const b1 = r.rows.find((x) => x.piece_mark === "1B1");
    const b2 = r.rows.find((x) => x.piece_mark === "1B2");
    const c1 = r.rows.find((x) => x.piece_mark === "2C1");

    expect(b1.drawing_id).toBe("d-101");
    expect(b1.drawing_set_id).toBe("set-1");
    expect(b1.drawing_match).toBe("matched");

    // "s-102 " in the project matches "S-102" in the file (normalized)
    expect(b2.drawing_id).toBe("d-102");

    // S-999 exists twice -> ambiguous, NOT linked
    expect(c1.drawing_id).toBeNull();
    expect(c1.drawing_match).toBe("ambiguous");

    expect(r.stats.drawingMatched).toBe(2);
    expect(r.stats.drawingAmbiguous).toBe(1);
  });

  it("skips rows without a piece mark and duplicate marks within the file", () => {
    const r = parseModelElementsCsv(TEKLA_CSV, { drawings: DRAWINGS });
    expect(r.rows).toHaveLength(3);
    expect(r.stats.skipped).toBe(2);
    expect(r.skipped.map((s) => s.reason)).toEqual([
      "Missing piece mark",
      "Duplicate piece mark in file: 1B1",
    ]);
  });

  it("marks rows as updates when they match existing elements by GUID or piece mark", () => {
    const existing = [
      { id: "ex-1", piece_mark: "OLD-1", element_guid: "2O2Fr$t4X7Zf8NOew3FNr1" }, // guid match beats mark
      { id: "ex-2", piece_mark: "2c1", element_guid: null },                        // mark match (case-insensitive)
    ];
    const r = parseModelElementsCsv(TEKLA_CSV, { drawings: DRAWINGS, existingElements: existing });

    const b1 = r.rows.find((x) => x.piece_mark === "1B1");
    const c1 = r.rows.find((x) => x.piece_mark === "2C1");
    const b2 = r.rows.find((x) => x.piece_mark === "1B2");

    expect(b1).toMatchObject({ action: "update", existing_id: "ex-1" });
    expect(c1).toMatchObject({ action: "update", existing_id: "ex-2" });
    expect(b2.action).toBe("create");
    expect(r.stats).toMatchObject({ create: 1, update: 2 });
  });
});

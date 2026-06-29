/**
 * pieceDrawingLinks.test.ts — buildPieceDrawingMap (pure piece→drawing lookup).
 */

import { describe, expect, it } from "vitest";
import { buildPieceDrawingMap } from "../pieceDrawingLinks";

describe("buildPieceDrawingMap", () => {
  it("maps a mark with a drawing_id to a clickable link entry", () => {
    const map = buildPieceDrawingMap([
      { piece_mark: "B12", drawing_no: "D-101", drawing_id: "draw-uuid-1" },
    ]);
    expect(map.get("B12")).toEqual({ drawingNo: "D-101", drawingId: "draw-uuid-1" });
  });

  it("maps a mark with only a drawing_no to an info-only entry (no id)", () => {
    const map = buildPieceDrawingMap([
      { piece_mark: "C7", drawing_no: "S-204", drawing_id: null },
    ]);
    expect(map.get("C7")).toEqual({ drawingNo: "S-204", drawingId: null });
  });

  it("normalizes the piece mark key (trim + uppercase): '1b1 ' -> '1B1'", () => {
    const map = buildPieceDrawingMap([
      { piece_mark: "1b1 ", drawing_no: "D-9", drawing_id: null },
    ]);
    expect(map.has("1B1")).toBe(true);
    expect(map.has("1b1 ")).toBe(false);
    expect(map.get("1B1")).toEqual({ drawingNo: "D-9", drawingId: null });
  });

  it("returns no entry for an absent mark", () => {
    const map = buildPieceDrawingMap([
      { piece_mark: "A1", drawing_no: "D-1", drawing_id: null },
    ]);
    expect(map.has("ZZZ")).toBe(false);
    expect(map.get("ZZZ")).toBeUndefined();
  });

  it("skips elements with neither a drawing_no nor a drawing_id", () => {
    const map = buildPieceDrawingMap([
      { piece_mark: "NOREF", drawing_no: "", drawing_id: null },
      { piece_mark: "ALSONONE", drawing_no: null, drawing_id: null },
    ]);
    expect(map.size).toBe(0);
  });

  it("prefers the entry with a drawing_id when a mark has multiple elements", () => {
    // Info-only element seen first, clickable element seen second.
    const map = buildPieceDrawingMap([
      { piece_mark: "B12", drawing_no: "S-204", drawing_id: null },
      { piece_mark: "B12", drawing_no: "D-101", drawing_id: "draw-uuid-1" },
    ]);
    expect(map.get("B12")).toEqual({ drawingNo: "D-101", drawingId: "draw-uuid-1" });
  });

  it("keeps the drawing_id entry even when the id-bearing element lacks a drawing_no", () => {
    const map = buildPieceDrawingMap([
      { piece_mark: "B12", drawing_no: "S-204", drawing_id: null },
      { piece_mark: "B12", drawing_no: null, drawing_id: "draw-uuid-1" },
    ]);
    // Upgrade to the clickable id, but retain the earlier drawing_no as info.
    expect(map.get("B12")).toEqual({ drawingNo: "S-204", drawingId: "draw-uuid-1" });
  });

  it("backfills a missing drawing_no on an existing id entry from a later element", () => {
    const map = buildPieceDrawingMap([
      { piece_mark: "B12", drawing_no: null, drawing_id: "draw-uuid-1" },
      { piece_mark: "B12", drawing_no: "D-101", drawing_id: "draw-uuid-1" },
    ]);
    expect(map.get("B12")).toEqual({ drawingNo: "D-101", drawingId: "draw-uuid-1" });
  });

  it("ignores blank/whitespace marks and null rows", () => {
    const map = buildPieceDrawingMap([
      null as unknown as { piece_mark: string },
      { piece_mark: "  ", drawing_no: "D-1", drawing_id: null },
      { piece_mark: "OK", drawing_no: "D-2", drawing_id: null },
    ]);
    expect(map.size).toBe(1);
    expect(map.has("OK")).toBe(true);
  });

  it("handles null/undefined input without throwing", () => {
    expect(buildPieceDrawingMap(null).size).toBe(0);
    expect(buildPieceDrawingMap(undefined).size).toBe(0);
    expect(buildPieceDrawingMap([]).size).toBe(0);
  });
});

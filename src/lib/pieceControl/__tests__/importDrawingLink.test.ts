import { describe, expect, it, vi } from "vitest";
import {
  applyImportDrawingLinks,
  collectAppliedPieceSheetHints,
  planImportDrawingLinks,
} from "../importDrawingLink";

describe("collectAppliedPieceSheetHints", () => {
  it("reads sheet_number from original_payload on applied rows", () => {
    expect(
      collectAppliedPieceSheetHints([
        {
          matched_piece_id: "p1",
          resolution: "applied_create",
          original_payload: { sheet_number: "S-101" },
        },
        {
          matched_piece_id: "p2",
          resolution: "skipped_conflict",
          original_payload: { sheet_number: "S-101" },
        },
        {
          matched_piece_id: "p3",
          resolution: "applied_update",
          original_payload: { drawing_sheet: "S-204" },
        },
      ]),
    ).toEqual([
      { pieceId: "p1", sheetNumber: "S-101" },
      { pieceId: "p3", sheetNumber: "S-204" },
    ]);
  });
});

describe("planImportDrawingLinks", () => {
  const drawings = [
    { id: "d1", sheet_number: "S-101" },
    { id: "d2", sheet_number: "S-204" },
    { id: "d3", sheet_number: "S-204", is_deleted: true },
  ];

  it("links exact unique sheet matches and skips missing/ambiguous", () => {
    const plan = planImportDrawingLinks(
      [
        { pieceId: "p1", sheetNumber: "S-101" },
        { pieceId: "p2", sheetNumber: "s 101" },
        { pieceId: "p3", sheetNumber: "S-999" },
        { pieceId: "p4", sheetNumber: "S-204" },
      ],
      [
        ...drawings,
        { id: "d4", sheet_number: "S-204" },
      ],
    );
    expect(plan.links).toEqual([
      { pieceId: "p1", drawingId: "d1", sheetNumber: "S-101" },
      { pieceId: "p2", drawingId: "d1", sheetNumber: "s 101" },
    ]);
    expect(plan.skipped).toEqual([
      { pieceId: "p3", reason: "no_match", detail: "S-999" },
      { pieceId: "p4", reason: "ambiguous", detail: "S-204" },
    ]);
  });
});

describe("applyImportDrawingLinks", () => {
  it("invokes link RPC per planned row and reports failures", async () => {
    const link = vi.fn(async (pieceId: string) => {
      if (pieceId === "p2") throw new Error("denied");
    });
    const result = await applyImportDrawingLinks(
      {
        links: [
          { pieceId: "p1", drawingId: "d1", sheetNumber: "S-1" },
          { pieceId: "p2", drawingId: "d1", sheetNumber: "S-1" },
        ],
        skipped: [],
      },
      link,
    );
    expect(link).toHaveBeenCalledTimes(2);
    expect(result.linked).toBe(1);
    expect(result.errors).toEqual([{ pieceId: "p2", message: "denied" }]);
  });
});

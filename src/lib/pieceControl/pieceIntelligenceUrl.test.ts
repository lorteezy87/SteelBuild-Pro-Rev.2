import { describe, expect, it } from "vitest";
import {
  parsePieceRegisterUrl,
  updatePieceRegisterUrl,
} from "@/lib/pieceControl/pieceIntelligenceUrl";

describe("Piece Register URL intent", () => {
  it("parses a valid view and revision while defaulting omitted values", () => {
    expect(parsePieceRegisterUrl("?projectId=p1&view=impact&revision=r1")).toEqual({
      view: "impact",
      focus: null,
      pieceId: null,
      revisionId: "r1",
    });
  });

  it("falls back safely for unknown view and focus values", () => {
    expect(parsePieceRegisterUrl("?view=unknown&focus=unsafe")).toEqual({
      view: "overview",
      focus: null,
      pieceId: null,
      revisionId: null,
    });
  });

  it("updates URL intent without disturbing unrelated parameters", () => {
    expect(
      updatePieceRegisterUrl("?projectId=p1&view=impact", {
        view: "register",
        pieceId: "piece 1",
        revisionId: null,
      }),
    ).toBe("projectId=p1&view=register&piece=piece+1");
  });
});

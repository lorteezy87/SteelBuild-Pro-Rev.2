import { describe, expect, it } from "vitest";
import { presentPieceControlError } from "../errorPresentation";

describe("presentPieceControlError", () => {
  it("keeps known domain messages", () => {
    expect(
      presentPieceControlError(
        new Error("Piece control is disabled for this project"),
        "fallback",
      ),
    ).toBe("Set up the Piece Register before using this action.");
  });

  it("surfaces missing-table failures with the table tag", () => {
    expect(
      presentPieceControlError(
        new Error("[submittal_comment_dispositions] Could not find the table 'public.submittal_comment_dispositions' in the schema cache"),
        "Piece relationships could not be loaded.",
      ),
    ).toMatch(/submittal_comment_dispositions unavailable/i);
  });

  it("surfaces core pieces failures explicitly", () => {
    expect(
      presentPieceControlError(
        new Error("[pieces] relation \"public.pieces\" does not exist"),
        "Piece relationships could not be loaded.",
      ),
    ).toMatch(/Piece Control migrations/i);
  });

  it("falls back for opaque PGRST-only codes", () => {
    expect(presentPieceControlError(new Error("PGRST116"), "fallback")).toBe("fallback");
  });
});

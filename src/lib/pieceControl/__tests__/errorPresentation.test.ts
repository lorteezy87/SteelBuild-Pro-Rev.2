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

  it("maps missing link_model_elements_to_pieces to migration guidance", () => {
    expect(
      presentPieceControlError(
        new Error(
          "Could not find the function public.link_model_elements_to_pieces(p_project_id) in the schema cache",
        ),
        "fallback",
      ),
    ).toMatch(/link_model_elements_to_pieces/);
  });

  it("maps the Postgres 22P05 NUL rejection (Sentry JAVASCRIPT-REACT-2C) to re-save guidance", () => {
    const backslash = String.fromCharCode(92);
    const sentryMessage =
      `unsupported Unicode escape sequence — ${backslash}u0000 cannot be converted to text. — 22P05`;
    expect(
      presentPieceControlError(new Error(sentryMessage), "The import could not be staged."),
    ).toBe(
      "This data contains a null character the database can't store. If it came from a file, re-save it as CSV UTF-8 and import it again.",
    );
  });

  // Sentry JAVASCRIPT-REACT-2D: archive_piece_lots guard failures used to
  // collapse to the generic fallback.
  it.each([
    [
      "Held or production-started pieces cannot be archived — P0001",
      "Held or production-started pieces can't be archived. Clear the hold or deselect those pieces, then try again.",
    ],
    [
      "Split piece lots cannot be archived; preserve the complete lot topology — P0001",
      "Split piece lots can't be archived. Deselect the split lots, then try again.",
    ],
    [
      "Pieces with production history cannot be archived — P0001",
      "Pieces with recorded production history can't be archived. Deselect them, then try again.",
    ],
    [
      "Pieces in a canonically released work package cannot be archived — P0001",
      "Pieces in a work package released for fabrication can't be archived. Deselect them, then try again.",
    ],
    [
      "All selected pieces must be active and belong to the same project — P0001",
      "Some selected pieces are no longer active in this project. Refresh the register and try again.",
    ],
  ])("maps the archive guard %s to specific wording", (message, expected) => {
    expect(
      presentPieceControlError(new Error(message), "The selected pieces could not be archived."),
    ).toBe(expected);
  });
});

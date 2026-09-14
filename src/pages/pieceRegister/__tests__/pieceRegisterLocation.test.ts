import { describe, expect, it } from "vitest";
import {
  parsePieceRegisterLocation,
  parsePieceRegisterUrl,
  updatePieceRegisterUrl,
  writePieceRegisterLocation,
} from "@/pages/pieceRegister/pieceRegisterLocation";

describe("parsePieceRegisterLocation", () => {
  it("accepts the impact view and supported focus", () => {
    const result = parsePieceRegisterLocation(
      new URLSearchParams("view=impact&focus=revision&revision=r4"),
    );

    expect(result).toEqual({
      view: "impact",
      focus: "revision",
      pieceId: null,
      revisionId: "r4",
    });
  });

  it("drops unsupported values without losing the valid view or piece", () => {
    const result = parsePieceRegisterLocation(
      new URLSearchParams("view=register&focus=unsafe&piece=p1"),
    );

    expect(result).toEqual({
      view: "register",
      focus: null,
      pieceId: "p1",
      revisionId: null,
    });
  });

  it("falls back safely and trims owned identifiers", () => {
    expect(
      parsePieceRegisterLocation(
        new URLSearchParams(
          "view=unknown&focus=field&piece=%20p-10%20&revision=%20%20",
        ),
      ),
    ).toEqual({
      view: "overview",
      focus: "field",
      pieceId: "p-10",
      revisionId: null,
    });
  });
});

describe("writePieceRegisterLocation", () => {
  it("updates owned values while preserving unrelated parameters", () => {
    const result = writePieceRegisterLocation(
      new URLSearchParams("project=mesa&view=overview&piece=old&embed=1"),
      { view: "impact", focus: "revision", revisionId: " rev 4 " },
    );

    expect(result.toString()).toBe(
      "project=mesa&view=impact&piece=old&embed=1&focus=revision&revision=rev+4",
    );
  });

  it("deletes only owned keys patched with null or empty values", () => {
    const result = writePieceRegisterLocation(
      new URLSearchParams(
        "view=impact&focus=revision&piece=p1&revision=r4&project=mesa",
      ),
      { focus: null, pieceId: "", revisionId: null },
    );

    expect(result.toString()).toBe("view=impact&project=mesa");
  });
});

describe("donor-compatible Piece Register URL contract", () => {
  it("parses a search string through the public URL helper", () => {
    expect(
      parsePieceRegisterUrl("?view=impact&focus=held&piece=%20p1%20"),
    ).toEqual({
      view: "impact",
      focus: "held",
      pieceId: "p1",
      revisionId: null,
    });
  });

  it("updates and encodes a search string without dropping unrelated values", () => {
    expect(
      updatePieceRegisterUrl("?project=mesa&view=overview", {
        view: "register",
        pieceId: "piece 12",
      }),
    ).toBe("project=mesa&view=register&piece=piece+12");
  });
});

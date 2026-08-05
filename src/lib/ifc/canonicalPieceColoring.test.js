import { describe, expect, it } from "vitest";
import {
  CANONICAL_PIECE_COLORS,
  buildCanonicalPieceByGuid,
  colorFnFor,
} from "./viewerColoring";
import { FAB_STATUS_META } from "@/lib/fabStatus";

describe("canonical 3D piece coloring", () => {
  const rows = [
    { element_guid: "linked", piece_id: "piece-1", fab_status: "shipped" },
    { element_guid: "legacy", piece_id: null, fab_status: "shipped" },
  ];
  const pieces = [
    {
      id: "piece-1",
      lifecycle_status: "fabricated",
      on_hold: false,
      is_container: false,
      is_deleted: false,
      deleted_at: null,
    },
  ];

  it("uses canonical lifecycle before legacy fab status for linked elements", () => {
    const canonicalPieceByGuid = buildCanonicalPieceByGuid(rows, pieces);
    const fabByGuid = new Map([
      ["linked", "shipped"],
      ["legacy", "shipped"],
    ]);
    const color = colorFnFor("fab", { canonicalPieceByGuid, fabByGuid });

    expect(color({ guid: "linked" })).toBe(CANONICAL_PIECE_COLORS.fabricated);
    expect(color({ guid: "legacy" })).toBe(FAB_STATUS_META.shipped.color);
  });

  it("gives hold state precedence over lifecycle", () => {
    const canonicalPieceByGuid = buildCanonicalPieceByGuid(rows, [
      { ...pieces[0], on_hold: true },
    ]);
    const color = colorFnFor("fab", { canonicalPieceByGuid });
    expect(color({ guid: "linked" })).toBe(CANONICAL_PIECE_COLORS.hold);
  });

  it("ignores deleted and container pieces so legacy fallback remains", () => {
    const canonicalPieceByGuid = buildCanonicalPieceByGuid(rows, [
      { ...pieces[0], is_container: true },
    ]);
    const color = colorFnFor("fab", {
      canonicalPieceByGuid,
      fabByGuid: new Map([["linked", "shipped"]]),
    });
    expect(color({ guid: "linked" })).toBe(FAB_STATUS_META.shipped.color);
  });
});


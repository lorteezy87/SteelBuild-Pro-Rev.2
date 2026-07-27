import { describe, expect, it } from "vitest";
import { collectAppliedPieceIds } from "../importAssign";

describe("collectAppliedPieceIds", () => {
  it("returns unique piece ids from applied create/update rows", () => {
    expect(
      collectAppliedPieceIds([
        { matched_piece_id: "p1", resolution: "applied_create" },
        { matched_piece_id: "p2", resolution: "applied_update" },
        { matched_piece_id: "p1", resolution: "applied_create" },
        { matched_piece_id: "p3", resolution: "skipped_conflict" },
        { matched_piece_id: null, resolution: "applied_create" },
      ]),
    ).toEqual(["p1", "p2"]);
  });
});

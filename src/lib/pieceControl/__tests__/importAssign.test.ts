import { describe, expect, it } from "vitest";
import {
  collectAppliedPieceIds,
  collectAppliedPiecesByWpNumber,
} from "../importAssign";

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

describe("collectAppliedPiecesByWpNumber", () => {
  it("groups applied pieces by CSV wp_number hints", () => {
    expect(
      collectAppliedPiecesByWpNumber([
        {
          matched_piece_id: "p1",
          resolution: "applied_create",
          original_payload: { wp_number: "WP-001" },
        },
        {
          matched_piece_id: "p2",
          resolution: "applied_update",
          original_payload: { work_package_number: "WP-001" },
        },
        {
          matched_piece_id: "p3",
          resolution: "applied_create",
          original_payload: { wp_number: "WP-004" },
        },
        {
          matched_piece_id: "p4",
          resolution: "skipped_conflict",
          original_payload: { wp_number: "WP-001" },
        },
        {
          matched_piece_id: "p5",
          resolution: "applied_create",
          original_payload: {},
        },
      ]),
    ).toEqual({
      "WP-001": ["p1", "p2"],
      "WP-004": ["p3"],
    });
  });
});

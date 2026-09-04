import { describe, expect, it } from "vitest";
import {
  nextIncompleteStationKey,
  planBulkStationAdvance,
} from "../bulkStationAdvance";
import type { PieceRegisterRow } from "../repository";
import type { StationCompletion, StationConfiguration } from "../stationProgress";

const stations: StationConfiguration[] = [
  {
    id: "s-cut",
    project_id: "p1",
    station_key: "cut",
    station_name: "Cut",
    sort_order: 1,
    earned_percent: 40,
    is_active: true,
  },
  {
    id: "s-fit",
    project_id: "p1",
    station_key: "fit",
    station_name: "Fit",
    sort_order: 2,
    earned_percent: 60,
    is_active: true,
  },
];

function piece(overrides: Partial<PieceRegisterRow> = {}): PieceRegisterRow {
  return {
    id: "piece-1",
    project_id: "p1",
    piece_mark: "B1",
    normalized_piece_mark: "B1",
    lot_code: "A",
    parent_piece_id: null,
    quantity: 1,
    profile: null,
    material_grade: null,
    weight_each_lbs: null,
    weight_total_lbs: null,
    work_package_id: "wp-1",
    lifecycle_status: "released",
    current_station: null,
    on_hold: false,
    is_container: false,
    is_deleted: false,
    source_system: "manual",
    external_ref: null,
    metadata: null,
    updated_at: "2026-07-28T00:00:00.000Z",
    deleted_at: null,
    ...overrides,
  } as PieceRegisterRow;
}

describe("bulkStationAdvance", () => {
  it("finds the next incomplete station in order", () => {
    const completions: StationCompletion[] = [
      {
        id: "c1",
        project_id: "p1",
        piece_id: "piece-1",
        station_configuration_id: "s-cut",
        station_key: "cut",
        station_name: "Cut",
        sort_order: 1,
        earned_percent: 40,
        completed_at: "2026-07-28T00:00:00.000Z",
        completed_by: "u1",
        is_override: false,
        override_reason: null,
        inherited_from_completion_id: null,
      },
    ];
    expect(nextIncompleteStationKey("piece-1", stations, completions)).toBe("fit");
    expect(nextIncompleteStationKey("piece-1", stations, [])).toBe("cut");
  });

  it("plans next-station advance for released leaf lots only", () => {
    const pieces = [
      piece({ id: "ok" }),
      piece({ id: "held", on_hold: true }),
      piece({ id: "container", is_container: true }),
      piece({ id: "unreleased", work_package_id: "wp-2" }),
    ];
    const plan = planBulkStationAdvance({
      mode: "next",
      selectedPieceIds: ["ok", "held", "container", "unreleased"],
      pieces,
      stations,
      completions: [],
      releasedWorkPackageIds: ["wp-1"],
    });
    expect(plan.eligiblePieceIds).toEqual(["ok"]);
    expect(plan.skipped.map((row) => row.pieceId).sort()).toEqual([
      "container",
      "held",
      "unreleased",
    ]);
  });

  it("skips soft-deleted lots and split parents with live children", () => {
    const parent = piece({ id: "parent", is_container: false });
    const child = piece({ id: "child", parent_piece_id: "parent" });
    const gone = piece({ id: "gone", deleted_at: "2026-08-01T00:00:00.000Z" });
    const plan = planBulkStationAdvance({
      mode: "next",
      selectedPieceIds: ["parent", "child", "gone"],
      pieces: [parent, child, gone],
      stations,
      completions: [],
      releasedWorkPackageIds: ["wp-1"],
    });
    expect(plan.eligiblePieceIds).toEqual(["child"]);
    expect(plan.skipped.map((s) => s.pieceId).sort()).toEqual(["gone", "parent"]);
  });

  it("skips lots that already completed the target station", () => {
    const completions: StationCompletion[] = [
      {
        id: "c1",
        project_id: "p1",
        piece_id: "piece-1",
        station_configuration_id: "s-cut",
        station_key: "cut",
        station_name: "Cut",
        sort_order: 1,
        earned_percent: 40,
        completed_at: "2026-07-28T00:00:00.000Z",
        completed_by: "u1",
        is_override: false,
        override_reason: null,
        inherited_from_completion_id: null,
      },
    ];
    const plan = planBulkStationAdvance({
      mode: "station",
      stationKey: "cut",
      selectedPieceIds: ["piece-1"],
      pieces: [piece()],
      stations,
      completions,
      releasedWorkPackageIds: ["wp-1"],
    });
    expect(plan.eligiblePieceIds).toEqual([]);
    expect(plan.skipped[0]?.reason).toMatch(/already complete/i);
  });
});

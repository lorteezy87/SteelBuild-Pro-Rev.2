import { describe, expect, it } from "vitest";
import type { ProductionSnapshot } from "@/lib/pieceControl/productionRepository";
import { derivePieceProductionView } from "../pieceProductionControl.derive";

const snapshot = {
  pieces: [
    {
      id: "piece-1",
      project_id: "project-1",
      piece_mark: "B1",
      normalized_piece_mark: "B1",
      lot_code: "ALL",
      parent_piece_id: null,
      quantity: 2,
      profile: null,
      material_grade: null,
      weight_each_lbs: null,
      weight_total_lbs: null,
      work_package_id: "wp-1",
      lifecycle_status: "not_started",
      on_hold: false,
      is_container: false,
      is_deleted: false,
      current_station: null,
      source_system: null,
      external_ref: null,
      metadata: null,
      updated_at: "2026-09-12T00:00:00Z",
      deleted_at: null,
    },
  ],
  stations: [
    {
      id: "station-cut",
      project_id: "project-1",
      station_key: "cut",
      station_name: "Cut",
      sort_order: 1,
      earned_percent: 100,
      is_active: true,
    },
  ],
  completions: [],
  canonicalReleaseWorkPackageIds: ["wp-1"],
} satisfies ProductionSnapshot;

describe("derivePieceProductionView", () => {
  it("preserves selected-piece, split, release, and bulk planning rules", () => {
    const view = derivePieceProductionView({
      snapshot,
      selectedPieceId: null,
      splitRows: [
        { lot_code: "A", quantity: 1 },
        { lot_code: "B", quantity: 1 },
      ],
      bulkSelectedIds: ["piece-1"],
      bulkStationKey: "cut",
    });

    expect(view.selectedPiece?.id).toBe("piece-1");
    expect(view.splitTotal).toBe(2);
    expect(view.splitValid).toBe(true);
    expect(view.released).toBe(true);
    expect(view.stationDisabledReason).toBeNull();
    expect(view.bulkNextPlan.eligiblePieceIds).toEqual(["piece-1"]);
    expect(view.bulkStationPlan.eligiblePieceIds).toEqual(["piece-1"]);
    expect(view.bulkNeedsOverride).toBe(false);
  });
});

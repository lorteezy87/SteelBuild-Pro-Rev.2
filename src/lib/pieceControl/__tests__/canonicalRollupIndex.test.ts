import { describe, expect, it } from "vitest";
import {
  rollupCanonicalWorkPackages,
  tonnageWeightedFabricationPercent,
  type CanonicalRollupPiece,
} from "../canonicalRollups";
import type { StationCompletion, StationConfiguration } from "../stationProgress";

const stations: StationConfiguration[] = [
  { id: "cut", project_id: "project", station_key: "cut", station_name: "Cut", sort_order: 1, earned_percent: 25, is_active: true },
  { id: "fit", project_id: "project", station_key: "fit", station_name: "Fit", sort_order: 2, earned_percent: 75, is_active: true },
  { id: "paint", project_id: "project", station_key: "paint", station_name: "Paint", sort_order: 3, earned_percent: 10, is_active: false },
];
const piece = (id: string, overrides: Partial<CanonicalRollupPiece> = {}): CanonicalRollupPiece => ({
  id, project_id: "project", parent_piece_id: null, work_package_id: "wp-1",
  quantity: 1, weight_each_lbs: 2000, weight_total_lbs: 2000,
  lifecycle_status: "in_fabrication", current_station: "cut", on_hold: false,
  is_container: false, is_deleted: false, deleted_at: null, ...overrides,
});
const completion = (pieceId: string, stationKey: "cut" | "fit" | "paint" = "cut"): StationCompletion => ({
  id: `${pieceId}-${stationKey}`, project_id: "project", piece_id: pieceId,
  station_configuration_id: stationKey, station_key: stationKey, station_name: stationKey,
  sort_order: 1, earned_percent: 99, completed_at: "2026-01-01T00:00:00Z",
  completed_by: "operator", is_override: false, override_reason: null,
  inherited_from_completion_id: null,
});

describe("canonical rollup indexing", () => {
  it("preserves weight-based earnings, station deduplication, and active configuration rates", () => {
    const pieces = [
      piece("light", { weight_each_lbs: 1000, weight_total_lbs: 1000 }),
      piece("heavy", { weight_each_lbs: 3000, weight_total_lbs: 3000 }),
      piece("unknown", { weight_each_lbs: null, weight_total_lbs: null }),
    ];
    const completions = [
      completion("light"), completion("light", "fit"), completion("light", "cut"),
      completion("heavy"), completion("heavy", "paint"), completion("unknown"),
    ];
    expect(tonnageWeightedFabricationPercent(pieces, stations, completions)).toBe(43.75);
  });

  it("groups only active leaf lots while preserving work-package order and empty scopes", () => {
    const workPackages = ["wp-2", "wp-1", "empty", "archived"].map((id) => ({
      id, project_id: "project", is_deleted: id === "archived",
    }));
    const pieces = [
      piece("parent", { quantity: 10 }),
      piece("child", { parent_piece_id: "parent" }),
      piece("second", { work_package_id: "wp-2", quantity: 2, weight_each_lbs: 2000, weight_total_lbs: 4000 }),
      piece("container", { is_container: true }),
      piece("deleted", { is_deleted: true }),
      piece("timestamp-deleted", { deleted_at: "2026-01-01T00:00:00Z" }),
    ];
    const result = rollupCanonicalWorkPackages(workPackages, pieces, stations, [
      completion("parent"), completion("parent", "fit"),
      completion("child"), completion("second"), completion("second", "fit"),
    ]);
    expect(result.map((row) => row.workPackageId)).toEqual(["wp-2", "wp-1", "empty"]);
    expect(result[0]).toMatchObject({ pieceCount: 2, knownTons: 2, earnedFabricationPercent: 100 });
    expect(result[1]).toMatchObject({ pieceCount: 1, knownTons: 1, earnedFabricationPercent: 25 });
    expect(result[2]).toMatchObject({ pieceCount: 0, earnedFabricationPercent: null });
  });

  it("reads completion identities once for the entire multi-package rollup", () => {
    const pieces = Array.from({ length: 120 }, (_, i) => piece(`piece-${i}`, { work_package_id: `wp-${i % 12}` }));
    let identityReads = 0;
    const completions = pieces.flatMap((row) => ["cut", "fit"].map((key) => {
      const record = completion(row.id, key as "cut" | "fit");
      Object.defineProperty(record, "piece_id", { get: () => { identityReads += 1; return row.id; } });
      return record;
    }));
    const workPackages = Array.from({ length: 12 }, (_, i) => ({ id: `wp-${i}`, project_id: "project" }));
    const result = rollupCanonicalWorkPackages(workPackages, pieces, stations, completions);
    expect(result.every((row) => row.earnedFabricationPercent === 100)).toBe(true);
    expect(identityReads).toBeLessThanOrEqual(completions.length * 2);
  });

  it("also indexes completion rows once for a standalone tonnage rollup", () => {
    const pieces = Array.from({ length: 60 }, (_, i) => piece(`piece-${i}`));
    let identityReads = 0;
    const completions = pieces.map((row) => {
      const record = completion(row.id);
      Object.defineProperty(record, "piece_id", { get: () => { identityReads += 1; return row.id; } });
      return record;
    });
    expect(tonnageWeightedFabricationPercent(pieces, stations, completions)).toBe(25);
    expect(identityReads).toBeLessThanOrEqual(completions.length * 2);
  });
});

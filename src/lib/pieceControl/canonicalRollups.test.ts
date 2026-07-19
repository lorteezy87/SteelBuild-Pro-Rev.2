import { describe, expect, it } from "vitest";
import {
  deriveWorkPackageStatus,
  rollupCanonicalPieces,
  selectActionableLeafPieces,
  tonnageWeightedFabricationPercent,
  type CanonicalRollupPiece,
} from "./canonicalRollups";
import type {
  StationCompletion,
  StationConfiguration,
} from "./stationProgress";

const piece = (
  id: string,
  lifecycle_status: string,
  overrides: Partial<CanonicalRollupPiece> = {},
): CanonicalRollupPiece => ({
  id,
  project_id: "project-1",
  parent_piece_id: null,
  work_package_id: "wp-1",
  quantity: 1,
  weight_each_lbs: 2000,
  weight_total_lbs: 2000,
  lifecycle_status,
  current_station: null,
  on_hold: false,
  is_container: false,
  is_deleted: false,
  deleted_at: null,
  ...overrides,
});

const stations: StationConfiguration[] = [
  {
    id: "cut",
    project_id: "project-1",
    station_key: "cut",
    station_name: "Cut",
    sort_order: 1,
    earned_percent: 25,
    is_active: true,
  },
  {
    id: "fit",
    project_id: "project-1",
    station_key: "fit",
    station_name: "Fit",
    sort_order: 2,
    earned_percent: 75,
    is_active: true,
  },
];

const completion = (
  pieceId: string,
  stationKey: "cut" | "fit",
): StationCompletion => ({
  id: `${pieceId}-${stationKey}`,
  project_id: "project-1",
  piece_id: pieceId,
  station_configuration_id: stationKey,
  station_key: stationKey,
  station_name: stationKey,
  sort_order: stationKey === "cut" ? 1 : 2,
  earned_percent: stationKey === "cut" ? 25 : 75,
  completed_at: "2026-07-18T00:00:00Z",
  completed_by: "user-1",
  is_override: false,
  override_reason: null,
  inherited_from_completion_id: null,
});

describe("canonical piece rollups", () => {
  it("weights fabrication progress by known tons", () => {
    const pieces = [
      piece("light", "in_fabrication", { weight_total_lbs: 1000 }),
      piece("heavy", "in_fabrication", { weight_total_lbs: 3000 }),
    ];
    const completions = [
      completion("light", "cut"),
      completion("light", "fit"),
      completion("heavy", "cut"),
    ];
    expect(
      tonnageWeightedFabricationPercent(pieces, stations, completions),
    ).toBe(43.75);
  });

  it("excludes containers and reports unknown weight separately", () => {
    const container = piece("parent", "fabricated", {
      quantity: 10,
      is_container: true,
      weight_total_lbs: 10000,
    });
    const child = piece("child", "fabricated", {
      parent_piece_id: "parent",
      quantity: 6,
      weight_total_lbs: 6000,
    });
    const unknown = piece("unknown", "not_started", {
      quantity: 4,
      weight_each_lbs: null,
      weight_total_lbs: null,
    });
    expect(selectActionableLeafPieces([container, child, unknown])).toHaveLength(2);
    expect(rollupCanonicalPieces([container, child, unknown])).toMatchObject({
      lotCount: 2,
      pieceCount: 10,
      knownTons: 3,
      unknownWeightLotCount: 1,
      unknownWeightPieceCount: 4,
    });
  });

  it.each([
    [[], "No Canonical Scope"],
    [[piece("a", "not_started")], "Ready for Release"],
    [[piece("a", "in_fabrication")], "In Fabrication"],
    [[piece("a", "fabricated")], "Fabrication Complete"],
    [[piece("a", "shipped")], "Shipping"],
    [[piece("a", "delivered")], "Delivered"],
    [[piece("a", "erected"), piece("b", "delivered")], "Erection"],
    [[piece("a", "erected"), piece("b", "erected")], "Complete"],
  ])("derives %s as %s", (pieces, expected) => {
    expect(deriveWorkPackageStatus(pieces as CanonicalRollupPiece[])).toBe(
      expected,
    );
  });

  it("uses deterministic furthest-activity precedence for mixed states", () => {
    expect(
      deriveWorkPackageStatus([
        piece("a", "not_started"),
        piece("b", "delivered"),
      ]),
    ).toBe("Shipping");
  });
});


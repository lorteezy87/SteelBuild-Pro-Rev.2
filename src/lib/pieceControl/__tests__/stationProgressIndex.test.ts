// Coverage for the batch-2 fixes in the piece-control math.
//
//  1. earnedPercentForPiece was O(pieces x completions) when driven from
//     calculateWeightedProductionProgress — it rebuilt the station map and
//     re-scanned the whole completions array once per piece. The shared index
//     must produce IDENTICAL numbers; these tests pin that equivalence.
//  2. sumPieceTons silently scores an unweighted piece as 0 tons.
//     rollupPieceTons reports the same number plus how many pieces it could
//     not weigh.

import { describe, it, expect } from "vitest";
import {
  earnedPercentForPiece,
  calculateWeightedProductionProgress,
  CANONICAL_STATION_KEYS,
} from "../stationProgress";
import type {
  CanonicalStationKey,
  ProductionPiece,
  StationCompletion,
  StationConfiguration,
} from "../stationProgress";
import { sumPieceTons, rollupPieceTons, pieceTons } from "../tonnage";

const EVEN_PERCENT = 100 / CANONICAL_STATION_KEYS.length;

const configs: StationConfiguration[] = CANONICAL_STATION_KEYS.map((station_key, i) => ({
  id: `cfg-${station_key}`,
  project_id: "p1",
  station_key,
  station_name: station_key,
  sort_order: i + 1,
  earned_percent: EVEN_PERCENT,
  is_active: true,
}));

const completion = (
  pieceId: string,
  station_key: CanonicalStationKey,
  id: string,
): StationCompletion => ({
  id,
  project_id: "p1",
  piece_id: pieceId,
  station_configuration_id: `cfg-${station_key}`,
  station_key,
  station_name: station_key,
  sort_order: 1,
  earned_percent: EVEN_PERCENT,
  completed_at: "2026-01-01T00:00:00Z",
  completed_by: "u1",
  is_override: false,
  override_reason: null,
  inherited_from_completion_id: null,
});

const piece = (id: string, over: Partial<ProductionPiece> = {}): ProductionPiece => ({
  id,
  quantity: 1,
  weight_each_lbs: 1000,
  weight_total_lbs: 1000,
  ...over,
});

describe("earnedPercentForPiece", () => {
  it("sums only the stations that piece completed", () => {
    const completions = [
      completion("a", "cut", "c1"),
      completion("a", "fit", "c2"),
      completion("b", "cut", "c3"),
    ];
    expect(earnedPercentForPiece("a", configs, completions)).toBeCloseTo(EVEN_PERCENT * 2, 6);
    expect(earnedPercentForPiece("b", configs, completions)).toBeCloseTo(EVEN_PERCENT, 6);
    expect(earnedPercentForPiece("missing", configs, completions)).toBe(0);
  });

  it("counts a duplicated station once (override + inherited row)", () => {
    const completions = [
      completion("a", "cut", "c1"),
      { ...completion("a", "cut", "c2"), is_override: true },
    ];
    expect(earnedPercentForPiece("a", configs, completions)).toBeCloseTo(EVEN_PERCENT, 6);
  });

  it("ignores a completion for a station that is no longer active", () => {
    const partialConfigs = configs.map((c) =>
      c.station_key === "paint" ? { ...c, is_active: false } : c,
    );
    const completions = [completion("a", "paint", "c1")];
    expect(earnedPercentForPiece("a", partialConfigs, completions)).toBe(0);
  });

  it("caps at 100", () => {
    const completions = CANONICAL_STATION_KEYS.map((k, i) => completion("a", k, `c${i}`));
    expect(earnedPercentForPiece("a", configs, completions)).toBeCloseTo(100, 6);
  });
});

describe("calculateWeightedProductionProgress matches the per-piece function", () => {
  const pieces = [
    piece("a", { weight_each_lbs: 2000, weight_total_lbs: 2000 }),
    piece("b", { weight_each_lbs: 1000, weight_total_lbs: 1000 }),
    piece("c", { weight_each_lbs: 1000, weight_total_lbs: 1000 }),
  ];
  const completions = [
    completion("a", "cut", "c1"),
    completion("a", "fit", "c2"),
    completion("b", "cut", "c3"),
  ];

  it("equals the weight-weighted mean computed the slow way", () => {
    const slow =
      pieces.reduce(
        (acc, p) => acc + (p.weight_total_lbs as number) * earnedPercentForPiece(p.id, configs, completions),
        0,
      ) / pieces.reduce((acc, p) => acc + (p.weight_total_lbs as number), 0);

    expect(calculateWeightedProductionProgress(pieces, configs, completions)).toBeCloseTo(slow, 9);
  });

  it("falls back to quantity when any actionable piece lacks a weight", () => {
    const mixed = [
      piece("a", { weight_each_lbs: 2000, weight_total_lbs: 2000, quantity: 1 }),
      piece("b", { weight_each_lbs: null, weight_total_lbs: null, quantity: 1 }),
    ];
    const cs = [completion("a", "cut", "c1")];
    // Quantity basis: (1*earned_a + 1*0) / 2
    expect(calculateWeightedProductionProgress(mixed, configs, cs)).toBeCloseTo(EVEN_PERCENT / 2, 6);
  });

  it("excludes deleted and container pieces", () => {
    const withNoise = [
      ...pieces,
      piece("del", { is_deleted: true, weight_total_lbs: 999999 }),
      piece("box", { is_container: true, weight_total_lbs: 999999 }),
    ];
    expect(calculateWeightedProductionProgress(withNoise, configs, completions)).toBeCloseTo(
      calculateWeightedProductionProgress(pieces, configs, completions),
      9,
    );
  });

  it("returns 0 rather than NaN when there is no basis", () => {
    expect(calculateWeightedProductionProgress([], configs, [])).toBe(0);
    expect(
      calculateWeightedProductionProgress(
        [piece("a", { weight_each_lbs: null, weight_total_lbs: null, quantity: 0 })],
        configs,
        [],
      ),
    ).toBe(0);
  });
});

describe("rollupPieceTons", () => {
  it("returns the same tons as sumPieceTons", () => {
    const pieces = [piece("a"), piece("b", { weight_total_lbs: 4000, weight_each_lbs: 4000 })];
    expect(rollupPieceTons(pieces).tons).toBeCloseTo(sumPieceTons(pieces), 9);
  });

  it("counts pieces it could not weigh instead of hiding them at 0 tons", () => {
    const pieces = [
      piece("a", { weight_each_lbs: 2000, weight_total_lbs: 2000 }),
      piece("b", { weight_each_lbs: null, weight_total_lbs: null }),
      piece("c", { weight_each_lbs: null, weight_total_lbs: null }),
    ];
    expect(pieceTons(pieces[1])).toBeNull();

    const rollup = rollupPieceTons(pieces);
    expect(rollup.tons).toBeCloseTo(1, 9); // 2000 lb = 1 ton
    expect(rollup.weighedCount).toBe(1);
    expect(rollup.unknownWeightCount).toBe(2);
    expect(rollup.partial).toBe(true);

    // sumPieceTons reports the same 1 ton with no indication two pieces are
    // missing — that's the gap this exists to close.
    expect(sumPieceTons(pieces)).toBeCloseTo(rollup.tons, 9);
  });

  it("is not partial when every piece has a weight", () => {
    expect(rollupPieceTons([piece("a"), piece("b")]).partial).toBe(false);
  });

  it("handles empty and nullish input", () => {
    expect(rollupPieceTons([])).toEqual({
      tons: 0, weighedCount: 0, unknownWeightCount: 0, partial: false,
    });
    expect(rollupPieceTons(null).partial).toBe(false);
  });
});

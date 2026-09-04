import { describe, expect, it } from 'vitest';
import {
  calculateWeightedProductionProgress,
  earnedPercentForPiece,
  type ProductionPiece,
  type StationCompletion,
  type StationConfiguration,
  validateStationConfiguration,
} from './stationProgress';

const configurations: StationConfiguration[] = [
  ['cut', 'Cut', 1, 15],
  ['fit', 'Fit', 2, 20],
  ['weld', 'Weld', 3, 25],
  ['qc', 'QC', 4, 15],
  ['paint', 'Paint', 5, 15],
  ['ready_to_ship', 'Ready to Ship', 6, 10],
].map(([stationKey, stationName, sortOrder, earnedPercent]) => ({
  id: String(stationKey),
  project_id: 'project-1',
  station_key: stationKey as StationConfiguration['station_key'],
  station_name: String(stationName),
  sort_order: Number(sortOrder),
  earned_percent: Number(earnedPercent),
  is_active: true,
}));

const completion = (
  pieceId: string,
  stationKey: StationConfiguration['station_key'],
): StationCompletion => {
  const station = configurations.find((entry) => entry.station_key === stationKey)!;
  return {
    id: `${pieceId}-${stationKey}`,
    project_id: 'project-1',
    piece_id: pieceId,
    station_configuration_id: station.id,
    station_key: station.station_key,
    station_name: station.station_name,
    sort_order: station.sort_order,
    earned_percent: station.earned_percent,
    completed_at: '2026-07-18T12:00:00.000Z',
    completed_by: 'user-1',
    is_override: false,
    override_reason: null,
    inherited_from_completion_id: null,
  };
};

describe('canonical station progress', () => {
  it('requires a contiguous six-station configuration totaling 100 percent', () => {
    expect(validateStationConfiguration(configurations)).toEqual({
      valid: true,
      errors: [],
      earnedPercentTotal: 100,
    });

    const invalid = configurations.map((station) => ({ ...station }));
    invalid[5].earned_percent = 5;
    expect(validateStationConfiguration(invalid)).toMatchObject({
      valid: false,
      earnedPercentTotal: 95,
    });
  });

  it('earns only configured completed-station percentages', () => {
    expect(
      earnedPercentForPiece('piece-1', configurations, [
        completion('piece-1', 'cut'),
        completion('piece-1', 'fit'),
      ]),
    ).toBe(35);
  });

  it('excludes split containers so parent and children are never double counted', () => {
    const pieces: ProductionPiece[] = [
      {
        id: 'container',
        quantity: 10,
        weight_each_lbs: 100,
        weight_total_lbs: 1000,
        current_station: 'cut' as const,
        is_container: true,
        is_deleted: false,
      },
      {
        id: 'child-a',
        quantity: 4,
        weight_each_lbs: 100,
        weight_total_lbs: 400,
        current_station: 'fit' as const,
        is_container: false,
        is_deleted: false,
      },
      {
        id: 'child-b',
        quantity: 6,
        weight_each_lbs: 100,
        weight_total_lbs: 600,
        current_station: null,
        is_container: false,
        is_deleted: false,
      },
    ];
    const completions = [
      completion('container', 'cut'),
      completion('child-a', 'cut'),
      completion('child-a', 'fit'),
    ];

    expect(calculateWeightedProductionProgress(pieces, configurations, completions)).toBe(14);
  });

  it('falls back to quantity weighting when any actionable piece has no weight', () => {
    // 5,000 lb lot next to a 3-piece lot with no weight: pounds and piece
    // counts must never share a denominator (the unweighted lot used to
    // contribute 3/5003 of the percentage).
    const pieces: ProductionPiece[] = [
      { id: 'heavy', quantity: 1, weight_each_lbs: 5000, weight_total_lbs: 5000, current_station: null, is_container: false, is_deleted: false },
      { id: 'light', quantity: 3, weight_each_lbs: null, weight_total_lbs: null, current_station: null, is_container: false, is_deleted: false },
    ];
    const completions = [completion('light', 'cut')]; // 15% earned on the 3-pc lot
    // qty basis: heavy 1 × 0 + light 3 × 15 = 45 / 4 = 11.25
    expect(calculateWeightedProductionProgress(pieces, configurations, completions)).toBeCloseTo(11.25, 5);
  });

  it('uses pounds when every actionable piece carries a weight', () => {
    const pieces: ProductionPiece[] = [
      { id: 'a', quantity: 1, weight_each_lbs: 300, weight_total_lbs: 300, current_station: null, is_container: false, is_deleted: false },
      { id: 'b', quantity: 1, weight_each_lbs: 100, weight_total_lbs: 100, current_station: null, is_container: false, is_deleted: false },
    ];
    const completions = [completion('b', 'cut')]; // 15% on the 100 lb lot
    expect(calculateWeightedProductionProgress(pieces, configurations, completions)).toBeCloseTo(3.75, 5);
  });
});


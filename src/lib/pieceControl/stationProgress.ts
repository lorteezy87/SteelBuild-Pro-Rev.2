import { pieceTotalWeightLbs } from './tonnage';

export const CANONICAL_STATION_KEYS = [
  'cut',
  'fit',
  'weld',
  'qc',
  'paint',
  'ready_to_ship',
] as const;

export type CanonicalStationKey = (typeof CANONICAL_STATION_KEYS)[number];

export interface StationConfiguration {
  id: string;
  project_id: string;
  station_key: CanonicalStationKey;
  station_name: string;
  sort_order: number;
  earned_percent: number;
  is_active: boolean;
}

export interface StationCompletion {
  id: string;
  project_id: string;
  piece_id: string;
  station_configuration_id: string;
  station_key: CanonicalStationKey;
  station_name: string;
  sort_order: number;
  earned_percent: number;
  completed_at: string;
  completed_by: string;
  is_override: boolean;
  override_reason: string | null;
  inherited_from_completion_id: string | null;
}

export interface ProductionPiece {
  id: string;
  piece_mark?: string;
  lot_code?: string;
  quantity: number;
  weight_each_lbs: number | null;
  weight_total_lbs: number | null;
  current_station?: string | null;
  is_container?: boolean;
  is_deleted?: boolean;
}

export interface StationConfigurationValidation {
  valid: boolean;
  errors: string[];
  earnedPercentTotal: number;
}

export function validateStationConfiguration(
  configurations: StationConfiguration[],
): StationConfigurationValidation {
  const active = configurations
    .filter((configuration) => configuration.is_active)
    .sort((left, right) => left.sort_order - right.sort_order);
  const errors: string[] = [];
  const keys = new Set(active.map((configuration) => configuration.station_key));
  const earnedPercentTotal = active.reduce(
    (total, configuration) => total + Number(configuration.earned_percent),
    0,
  );

  if (
    active.length !== CANONICAL_STATION_KEYS.length ||
    keys.size !== CANONICAL_STATION_KEYS.length ||
    CANONICAL_STATION_KEYS.some((key) => !keys.has(key))
  ) {
    errors.push('The six canonical stations must each appear exactly once.');
  }
  if (active.some((configuration, index) => configuration.sort_order !== index + 1)) {
    errors.push('Station order must be contiguous and start at 1.');
  }
  if (Math.abs(earnedPercentTotal - 100) > 0.0001) {
    errors.push('Earned percentages must total exactly 100.');
  }

  return {
    valid: errors.length === 0,
    errors,
    earnedPercentTotal,
  };
}

export function earnedPercentForPiece(
  pieceId: string,
  configurations: StationConfiguration[],
  completions: StationCompletion[],
): number {
  const activeEarnedByStation = new Map(
    configurations
      .filter((configuration) => configuration.is_active)
      .map((configuration) => [
        configuration.station_key,
        Number(configuration.earned_percent),
      ]),
  );
  const completedKeys = new Set(
    completions
      .filter((completion) => completion.piece_id === pieceId)
      .map((completion) => completion.station_key),
  );

  return Math.min(
    100,
    [...completedKeys].reduce(
      (total, stationKey) => total + (activeEarnedByStation.get(stationKey) ?? 0),
      0,
    ),
  );
}

export function calculateWeightedProductionProgress(
  pieces: ProductionPiece[],
  configurations: StationConfiguration[],
  completions: StationCompletion[],
): number {
  const actionablePieces = pieces.filter(
    (piece) => !piece.is_deleted && !piece.is_container,
  );
  const weighted = actionablePieces.map((piece) => {
    const pounds = pieceTotalWeightLbs(piece);
    const basis = pounds && pounds > 0 ? pounds : Math.max(Number(piece.quantity), 0);
    return {
      basis,
      earned: earnedPercentForPiece(piece.id, configurations, completions),
    };
  });
  const totalBasis = weighted.reduce((total, piece) => total + piece.basis, 0);
  if (totalBasis <= 0) return 0;

  return weighted.reduce(
    (total, piece) => total + piece.basis * piece.earned,
    0,
  ) / totalBasis;
}

export function groupPiecesByCurrentStation(
  pieces: ProductionPiece[],
): Record<'not_started' | CanonicalStationKey, ProductionPiece[]> {
  const grouped = {
    not_started: [],
    cut: [],
    fit: [],
    weld: [],
    qc: [],
    paint: [],
    ready_to_ship: [],
  } as Record<'not_started' | CanonicalStationKey, ProductionPiece[]>;

  pieces
    .filter((piece) => !piece.is_deleted && !piece.is_container)
    .forEach((piece) => {
      const station = CANONICAL_STATION_KEYS.includes(
        piece.current_station as CanonicalStationKey,
      )
        ? (piece.current_station as CanonicalStationKey)
        : 'not_started';
      grouped[station].push(piece);
    });

  return grouped;
}

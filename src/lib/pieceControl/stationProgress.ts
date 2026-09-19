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

/**
 * Build the two lookups the per-piece earned-percent calculation needs.
 *
 * `earnedPercentForPiece` used to rebuild BOTH of these on every call: it
 * re-derived the active-station map from `configurations` and then ran a full
 * `completions.filter(...)` scan to find one piece's rows. Called once per
 * piece from calculateWeightedProductionProgress, that is O(pieces ×
 * completions) — a 5,000-piece job with ~30,000 completions did roughly 150
 * million comparisons on every render of Production Status and Piece Register.
 *
 * Built once, it is O(pieces + completions).
 */
function buildEarnedIndex(
  configurations: StationConfiguration[],
  completions: StationCompletion[],
) {
  const activeEarnedByStation = new Map<string, number>(
    configurations
      .filter((configuration) => configuration.is_active)
      .map((configuration) => [
        configuration.station_key as string,
        Number(configuration.earned_percent),
      ]),
  );

  // Station keys completed per piece. A Set per piece preserves the original
  // de-duplication: two completion rows for the same station (an override plus
  // an inherited row) must earn that station's percent ONCE, not twice.
  const completedKeysByPiece = new Map<string, Set<string>>();
  for (const completion of completions) {
    const pieceId = completion.piece_id;
    let keys = completedKeysByPiece.get(pieceId);
    if (!keys) {
      keys = new Set<string>();
      completedKeysByPiece.set(pieceId, keys);
    }
    keys.add(completion.station_key as string);
  }

  return { activeEarnedByStation, completedKeysByPiece };
}

function earnedPercentFromIndex(
  pieceId: string,
  index: ReturnType<typeof buildEarnedIndex>,
): number {
  const completedKeys = index.completedKeysByPiece.get(pieceId);
  if (!completedKeys) return 0;
  let total = 0;
  for (const stationKey of completedKeys) {
    total += index.activeEarnedByStation.get(stationKey) ?? 0;
  }
  return Math.min(100, total);
}

export function earnedPercentForPiece(
  pieceId: string,
  configurations: StationConfiguration[],
  completions: StationCompletion[],
): number {
  return earnedPercentFromIndex(pieceId, buildEarnedIndex(configurations, completions));
}

export function calculateWeightedProductionProgress(
  pieces: ProductionPiece[],
  configurations: StationConfiguration[],
  completions: StationCompletion[],
): number {
  const actionablePieces = pieces.filter(
    (piece) => !piece.is_deleted && !piece.is_container,
  );
  // Index ONCE for the whole rollup, not once per piece.
  const index = buildEarnedIndex(configurations, completions);
  // One unit per denominator: weight by pounds when every actionable piece has
  // a weight, otherwise by quantity. Mixing the two (5,000 lb next to "3 pcs")
  // made unweighted lots vanish from the percentage.
  const pounds = actionablePieces.map((piece) => pieceTotalWeightLbs(piece));
  const allWeighted =
    actionablePieces.length > 0 && pounds.every((lbs) => lbs != null && lbs > 0);
  const weighted = actionablePieces.map((piece, index_) => {
    const basis = allWeighted
      ? (pounds[index_] as number)
      : Math.max(Number(piece.quantity) || 0, 0);
    return {
      basis,
      earned: earnedPercentFromIndex(piece.id, index),
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

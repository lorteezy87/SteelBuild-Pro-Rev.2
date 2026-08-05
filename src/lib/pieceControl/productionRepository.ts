import { supabase } from '@/lib/supabase';
import type { PieceRegisterRow } from './repository';
import type {
  StationCompletion,
  StationConfiguration,
} from './stationProgress';
import { unwrapPieceControlRpc } from './rpcResult';

export interface ProductionSnapshot {
  pieces: PieceRegisterRow[];
  stations: StationConfiguration[];
  completions: StationCompletion[];
  canonicalReleaseWorkPackageIds: string[];
}

export interface LotAllocation {
  lot_code: string;
  quantity: number;
}

const PAGE = 1000;
const SAFETY_MAX_ROWS = 200_000;

/**
 * Page active pieces for a project (and optional WP scope).
 * PostgREST silently caps a single select at ~1000 rows — same trap as
 * listPieceProduction / fetchAllModelElements — so we range until exhausted.
 */
async function fetchActivePiecesPaged(
  projectId: string,
  workPackageId?: string | null,
): Promise<PieceRegisterRow[]> {
  const db = supabase as any;
  const all: PieceRegisterRow[] = [];

  for (let offset = 0; offset < SAFETY_MAX_ROWS; offset += PAGE) {
    let query = db
      .from('pieces')
      .select('*')
      .eq('project_id', projectId)
      .eq('is_deleted', false)
      .is('deleted_at', null)
      .order('normalized_piece_mark')
      .order('lot_code')
      .range(offset, offset + PAGE - 1);

    if (workPackageId === null) {
      query = query.is('work_package_id', null);
    } else if (workPackageId) {
      query = query.eq('work_package_id', workPackageId);
    }

    const { data, error } = await query;
    if (error) throw error;
    const batch = (data ?? []) as PieceRegisterRow[];
    all.push(...batch);
    if (batch.length < PAGE) return all;
  }

  console.warn(
    `[piece-control-production] stopped at ${SAFETY_MAX_ROWS}-row safety cap — data may be incomplete.`,
  );
  return all;
}

/**
 * @param workPackageId
 *   - `undefined` / omit: all lots in the project
 *   - `null`: unassigned lots only
 *   - uuid: lots for that work package
 */
export async function fetchProductionSnapshot(
  projectId: string,
  workPackageId?: string | null,
): Promise<ProductionSnapshot> {
  const db = supabase as any;

  const [pieces, stationsResult, completionsResult, releasesResult] =
    await Promise.all([
      fetchActivePiecesPaged(projectId, workPackageId),
      db
        .from('piece_station_configurations')
        .select('*')
        .eq('project_id', projectId)
        .eq('is_active', true)
        .order('sort_order'),
      db
        .from('piece_station_completions')
        .select('*')
        .eq('project_id', projectId)
        .order('sort_order'),
      db
        .from('fab_releases')
        .select('work_package_id')
        .eq('project_id', projectId)
        .eq('canonical_release', true)
        .eq('status', 'Released')
        .eq('is_deleted', false),
    ]);

  if (stationsResult.error) throw stationsResult.error;
  if (completionsResult.error) throw completionsResult.error;
  if (releasesResult.error) throw releasesResult.error;

  const completions = (completionsResult.data ?? []) as StationCompletion[];
  const pieceIds = new Set(pieces.map((piece) => piece.id));
  return {
    pieces,
    stations: (stationsResult.data ?? []) as StationConfiguration[],
    completions: completions.filter((completion) =>
      pieceIds.has(completion.piece_id),
    ),
    canonicalReleaseWorkPackageIds: Array.from(
      new Set<string>(
        ((releasesResult.data ?? []) as Array<{ work_package_id?: string | null }>)
          .map((release) => release.work_package_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ),
  };
}

export async function splitPieceLot(
  projectId: string,
  pieceId: string,
  allocations: LotAllocation[],
): Promise<void> {
  const { data, error } = await (supabase as any).rpc('split_piece_lot', {
    p_project_id: projectId,
    p_piece_id: pieceId,
    p_allocations: allocations,
  });
  if (error) throw error;
  unwrapPieceControlRpc(data);
}

export async function advancePieceStation(
  projectId: string,
  pieceId: string,
  stationKey: string,
  override = false,
  overrideReason?: string,
): Promise<void> {
  const { data, error } = await (supabase as any).rpc('advance_piece_station', {
    p_project_id: projectId,
    p_piece_id: pieceId,
    p_station_key: stationKey,
    p_override: override,
    p_override_reason: overrideReason ?? null,
  });
  if (error) throw error;
  unwrapPieceControlRpc(data);
}

export interface AdvancePieceStationsResult {
  project_id: string;
  station_key: string | null;
  mode: 'next' | 'station';
  requested: number;
  advanced: number;
  unchanged: number;
  piece_ids: string[];
  atomic: boolean;
}

export async function advancePieceStations(
  projectId: string,
  pieceIds: string[],
  options: {
    stationKey?: string | null;
    override?: boolean;
    overrideReason?: string;
  } = {},
): Promise<AdvancePieceStationsResult> {
  const { data, error } = await (supabase as any).rpc('advance_piece_stations', {
    p_project_id: projectId,
    p_piece_ids: pieceIds,
    p_station_key: options.stationKey ?? null,
    p_override: options.override ?? false,
    p_override_reason: options.overrideReason ?? null,
  });
  if (error) throw error;
  return unwrapPieceControlRpc(data) as AdvancePieceStationsResult;
}

export async function setPieceHold(
  projectId: string,
  pieceIds: string[],
  onHold: boolean,
  reason?: string,
): Promise<void> {
  const { data, error } = await (supabase as any).rpc('set_piece_hold', {
    p_project_id: projectId,
    p_piece_ids: pieceIds,
    p_on_hold: onHold,
    p_reason: reason ?? null,
  });
  if (error) throw error;
  unwrapPieceControlRpc(data);
}

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

export async function fetchProductionSnapshot(
  projectId: string,
  workPackageId?: string,
): Promise<ProductionSnapshot> {
  const db = supabase as any;
  let piecesQuery = db
    .from('pieces')
    .select('*')
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    .is('deleted_at', null)
    .order('normalized_piece_mark')
    .order('lot_code');
  if (workPackageId) {
    piecesQuery = piecesQuery.eq('work_package_id', workPackageId);
  }

  const [piecesResult, stationsResult, completionsResult, releasesResult] =
    await Promise.all([
      piecesQuery,
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

  if (piecesResult.error) throw piecesResult.error;
  if (stationsResult.error) throw stationsResult.error;
  if (completionsResult.error) throw completionsResult.error;
  if (releasesResult.error) throw releasesResult.error;

  const pieceIds = new Set((piecesResult.data ?? []).map((piece) => piece.id));
  return {
    pieces: (piecesResult.data ?? []) as PieceRegisterRow[],
    stations: (stationsResult.data ?? []) as StationConfiguration[],
    completions: (completionsResult.data ?? []).filter((completion) =>
      pieceIds.has(completion.piece_id),
    ) as StationCompletion[],
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
